import type { InvoicingAdapter } from "../invoicing";
import { getProduct } from "../products";
import type { AfterPaymentHook, PaymentEvent } from "./types";

export class InvoiceHook implements AfterPaymentHook {
  readonly key = "invoice";
  constructor(
    private readonly adapter: InvoicingAdapter,
    /** "all" = invoice everyone (Polish B2C sales also need an invoice on request or a fiscal receipt);
     *  "company" = only buyers who ticked "Chcę fakturę na firmę". */
    private readonly scope: "all" | "company" = "company",
  ) {}

  async run(event: PaymentEvent): Promise<string | void> {
    if (this.scope === "company" && event.buyer.type !== "company") return "skipped (private buyer)";
    const product = event.productId ? getProduct(event.productId) : undefined;
    const res = await this.adapter.createInvoice({
      externalId: event.id,
      buyer: event.buyer,
      itemName: product?.invoiceItemName ?? product?.name ?? "Zamówienie",
      amountGross: event.amountGross,
      currency: event.currency,
      vatRate: product?.vatRate ?? 23,
      paidAt: event.paidAt,
      note: `Stripe: ${event.id}`,
    });
    return `${res.provider}:${res.id}${res.number ? ` (${res.number})` : ""}`;
  }
}
