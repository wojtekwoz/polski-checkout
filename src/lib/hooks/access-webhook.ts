import { createHmac } from "node:crypto";
import type { AfterPaymentHook, PaymentEvent } from "./types";

/**
 * Generic "grant access" hook: POSTs the payment event as JSON to ACCESS_WEBHOOK_URL
 * (Zapier / Make catch hook, your LMS, Teachery automation, n8n...).
 * If ACCESS_WEBHOOK_SECRET is set, adds `X-Polski-Checkout-Signature: sha256=<hex HMAC of body>`.
 */
export class AccessWebhookHook implements AfterPaymentHook {
  readonly key = "access";
  constructor(
    private readonly url: string,
    private readonly secret?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static payload(event: PaymentEvent) {
    return {
      type: event.kind === "purchase" ? "access.granted" : "access.renewed",
      id: event.id,
      product: event.productId,
      email: event.buyer.email,
      first_name: event.buyer.firstName,
      last_name: event.buyer.lastName,
      company_name: event.buyer.companyName ?? null,
      nip: event.buyer.nip ?? null,
      amount_gross: event.amountGross,
      currency: event.currency,
      paid_at: event.paidAt.toISOString(),
      stripe: event.stripe,
    };
  }

  async run(event: PaymentEvent): Promise<string> {
    const body = JSON.stringify(AccessWebhookHook.payload(event));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.secret) headers["X-Polski-Checkout-Signature"] = `sha256=${createHmac("sha256", this.secret).update(body).digest("hex")}`;
    const res = await this.fetchImpl(this.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Access webhook HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  }
}
