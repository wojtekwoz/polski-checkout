/**
 * Fakturownia.pl adapter. API docs: https://app.fakturownia.pl/api
 * Env: FAKTUROWNIA_DOMAIN (the "xyz" in xyz.fakturownia.pl), FAKTUROWNIA_API_TOKEN.
 */
import { grossToString, isoDate, type InvoiceRequest, type InvoiceResult, type InvoicingAdapter } from "./types";

export interface FakturowniaConfig {
  domain: string;
  apiToken: string;
  /** "vat" (default) or "bill" (rachunek, for VAT-exempt sellers) */
  kind?: "vat" | "bill";
  /** Send the invoice to the buyer by email from Fakturownia right after creating it. */
  sendEmail?: boolean;
  fetchImpl?: typeof fetch;
}

export function buildFakturowniaInvoice(req: InvoiceRequest, kind: "vat" | "bill" = "vat") {
  const b = req.buyer;
  const isCompany = b.type === "company";
  const date = isoDate(req.paidAt);
  return {
    kind,
    // Fakturownia rejects a second document with the same oid when oid_unique is "yes",
    // so Stripe webhook retries cannot create duplicate invoices.
    oid: req.externalId,
    oid_unique: "yes",
    sell_date: date,
    issue_date: date,
    payment_to: date,
    payment_type: "card",
    status: "paid",
    paid: grossToString(req.amountGross),
    currency: req.currency.toUpperCase(),
    lang: "pl",
    buyer_company: isCompany,
    buyer_name: isCompany ? b.companyName : `${b.firstName} ${b.lastName}`,
    buyer_first_name: isCompany ? undefined : b.firstName,
    buyer_last_name: isCompany ? undefined : b.lastName,
    buyer_tax_no: isCompany ? b.nip : undefined,
    buyer_street: b.address.street,
    buyer_post_code: b.address.postalCode,
    buyer_city: b.address.city,
    buyer_country: b.address.country,
    buyer_email: b.email,
    description: req.note,
    positions: [
      {
        name: req.itemName,
        quantity: 1,
        total_price_gross: grossToString(req.amountGross),
        tax: req.vatRate === "zw" ? "zw" : req.vatRate,
      },
    ],
  };
}

export class FakturowniaAdapter implements InvoicingAdapter {
  readonly name = "fakturownia";
  constructor(private readonly cfg: FakturowniaConfig) {}

  async createInvoice(req: InvoiceRequest): Promise<InvoiceResult> {
    const f = this.cfg.fetchImpl ?? fetch;
    const base = `https://${this.cfg.domain}.fakturownia.pl`;
    const res = await f(`${base}/invoices.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_token: this.cfg.apiToken, invoice: buildFakturowniaInvoice(req, this.cfg.kind) }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: number; number?: string; view_url?: string; message?: unknown };
    if (!res.ok || !body.id) {
      throw new Error(`Fakturownia HTTP ${res.status}: ${JSON.stringify(body.message ?? body).slice(0, 300)}`);
    }
    if (this.cfg.sendEmail) {
      await f(`${base}/invoices/${body.id}/send_by_email.json?api_token=${encodeURIComponent(this.cfg.apiToken)}`, { method: "POST" }).catch(
        (e) => console.warn("[polski-checkout] Fakturownia send_by_email failed:", (e as Error).message),
      );
    }
    return { provider: this.name, id: String(body.id), number: body.number, url: body.view_url };
  }
}
