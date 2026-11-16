import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buyerFromMetadata, buyerToMetadata, parseBuyer, type Buyer } from "../src/lib/buyer";
import { AccessWebhookHook, runAfterPayment, type AfterPaymentHook, type IdempotencyMarker, type PaymentEvent } from "../src/lib/hooks";
import { buildFakturowniaInvoice } from "../src/lib/invoicing/fakturownia";
import { buildIfirmaInvoice, ifirmaSignature } from "../src/lib/invoicing/ifirma";
import { validateProducts } from "../src/lib/products";
import { buildSessionParams } from "../src/lib/stripe";

const companyInput = {
  email: " Jan@Firma.PL ",
  firstName: "Jan",
  lastName: "Kowalski",
  wantsInvoice: true,
  nip: "PL 526-025-09-95",
  companyName: "ORANGE POLSKA SPÓŁKA AKCYJNA",
  address: { street: "ALEJE JEROZOLIMSKIE 160", postalCode: "02326", city: "WARSZAWA", country: "PL" },
  acceptTerms: true,
};

const buyerOf = (input: unknown): Buyer => {
  const r = parseBuyer(input);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.buyer;
};

describe("buyer validation", () => {
  it("normalises a company buyer", () => {
    const b = buyerOf(companyInput);
    expect(b).toMatchObject({ type: "company", email: "jan@firma.pl", nip: "5260250995" });
    expect(b.address.postalCode).toBe("02-326");
  });

  it("rejects invalid NIP, postcode and missing consent", () => {
    const r = parseBuyer({ ...companyInput, nip: "5260250996", acceptTerms: false, address: { ...companyInput.address, postalCode: "0232" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field).sort()).toEqual(["acceptTerms", "address.postalCode", "nip"]);
  });

  it("accepts a private foreign buyer without NIP", () => {
    const b = buyerOf({ ...companyInput, wantsInvoice: false, nip: undefined, companyName: undefined, address: { street: "Hauptstr. 1", postalCode: "10115", city: "Berlin", country: "de" } });
    expect(b).toMatchObject({ type: "person", address: { country: "DE", postalCode: "10115" } });
    expect(b.nip).toBeUndefined();
  });

  it("round-trips through Stripe metadata within limits", () => {
    const b = buyerOf(companyInput);
    const meta = buyerToMetadata(b, "kurs");
    expect(Object.keys(meta).length).toBeLessThanOrEqual(50);
    for (const v of Object.values(meta)) expect(v.length).toBeLessThanOrEqual(500);
    expect(buyerFromMetadata(meta, b.email)).toEqual(b);
  });
});

describe("Stripe session params", () => {
  const b = buyerOf(companyInput);
  it("uses a Stripe price id, promo codes and metadata for subscriptions", () => {
    const [p] = validateProducts([{ id: "vh", name: "VH", pricePln: 99, mode: "subscription", stripePriceId: "price_123" }]);
    const s = buildSessionParams(p, b, "cus_1", "pl", "https://shop.test");
    expect(s).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      line_items: [{ price: "price_123", quantity: 1 }],
      allow_promotion_codes: true,
      locale: "pl",
      subscription_data: { metadata: { pc_nip: "5260250995", pc_product: "vh" } },
    });
    expect(s.success_url).toContain("https://shop.test/success?session_id={CHECKOUT_SESSION_ID}");
  });

  it("builds inline price_data in grosze for one-time products", () => {
    const [p] = validateProducts([{ id: "kurs", name: "Kurs", pricePln: 199.99, mode: "payment" }]);
    const s = buildSessionParams(p, b, "cus_1", "en", "https://shop.test");
    expect(s.line_items?.[0].price_data).toMatchObject({ currency: "pln", unit_amount: 19999 });
    expect(s.payment_intent_data?.metadata?.pc_company_name).toBe("ORANGE POLSKA SPÓŁKA AKCYJNA");
  });

  it("validates product config", () => {
    expect(() => validateProducts([{ id: "Bad Id", name: "x", pricePln: 1, mode: "payment" }])).toThrow();
    expect(() => validateProducts([{ id: "sub", name: "x", pricePln: 1, mode: "subscription" }])).toThrow(/interval/);
  });
});

describe("invoicing payloads", () => {
  const req = {
    externalId: "cs_test_1",
    buyer: buyerOf(companyInput),
    itemName: "Kurs",
    amountGross: 12300,
    currency: "pln",
    vatRate: 23 as const,
    paidAt: new Date("2026-11-16T10:00:00Z"),
  };

  it("Fakturownia: company invoice, gross amount, idempotent oid", () => {
    const inv = buildFakturowniaInvoice(req);
    expect(inv).toMatchObject({
      kind: "vat",
      oid: "cs_test_1",
      oid_unique: "yes",
      buyer_tax_no: "5260250995",
      buyer_post_code: "02-326",
      status: "paid",
      sell_date: "2026-11-16",
      positions: [{ total_price_gross: "123.00", tax: 23, quantity: 1 }],
    });
  });

  it("iFirma: payload and HMAC-SHA1 signature", () => {
    const inv = buildIfirmaInvoice(req, "Warszawa");
    expect(inv.Kontrahent).toMatchObject({ NIP: "5260250995", KodPocztowy: "02-326", OsobaFizyczna: false });
    expect(inv.Pozycje[0]).toMatchObject({ StawkaVat: 0.23, CenaJednostkowa: 123, TypStawkiVat: "PRC" });
    const key = "0123456789abcdef";
    const expected = createHmac("sha1", Buffer.from(key, "hex")).update("https://x" + "login" + "faktura" + "{}").digest("hex");
    expect(ifirmaSignature("https://x", "login", "faktura", "{}", key)).toBe(expected);
  });
});

describe("after-payment hooks", () => {
  const event: PaymentEvent = {
    kind: "purchase",
    id: "cs_test_1",
    productId: "kurs",
    buyer: buyerOf(companyInput),
    amountGross: 12300,
    currency: "pln",
    paidAt: new Date("2026-11-16T10:00:00Z"),
    stripe: { customerId: "cus_1", sessionId: "cs_test_1", livemode: false },
  };
  const memoryMarker = (): IdempotencyMarker & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return { store, has: async (k) => store.has(k), set: async (k, v) => void store.set(k, v) };
  };

  it("runs each hook once, even when Stripe retries", async () => {
    const run = vi.fn(async () => "ok");
    const hook: AfterPaymentHook = { key: "x", run };
    const marker = memoryMarker();
    await runAfterPayment(event, [hook], marker);
    const second = await runAfterPayment(event, [hook], marker);
    expect(run).toHaveBeenCalledOnce();
    expect(second[0].status).toBe("already_done");
  });

  it("keeps running other hooks when one fails, then throws so Stripe retries", async () => {
    const ok = vi.fn(async () => "ok");
    const marker = memoryMarker();
    await expect(
      runAfterPayment(event, [{ key: "bad", run: async () => { throw new Error("boom"); } }, { key: "good", run: ok }], marker),
    ).rejects.toThrow(/hooks failed/);
    expect(ok).toHaveBeenCalledOnce();
    expect(marker.store.has("pc_done_good")).toBe(true);
    expect(marker.store.has("pc_done_bad")).toBe(false);
  });

  it("access webhook signs the JSON body", async () => {
    const fetchImpl = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
    await new AccessWebhookHook("https://hooks.test/x", "s3cret", fetchImpl as unknown as typeof fetch).run(event);
    const init = fetchImpl.mock.calls[0][1]!;
    const body = String(init.body);
    expect(JSON.parse(body)).toMatchObject({ type: "access.granted", email: "jan@firma.pl", product: "kurs" });
    expect((init.headers as Record<string, string>)["X-Polski-Checkout-Signature"]).toBe(
      `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`,
    );
  });
});
