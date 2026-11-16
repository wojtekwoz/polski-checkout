import type { Buyer } from "../buyer";

export interface InvoiceRequest {
  /** Stable id used for idempotency (Stripe Checkout Session id or Stripe Invoice id). */
  externalId: string;
  buyer: Buyer;
  itemName: string;
  /** Gross amount actually paid, in grosze (after discounts). */
  amountGross: number;
  currency: string;
  /** Percent (23, 8, 5, 0) or "zw" for VAT-exempt sellers. */
  vatRate: number | "zw";
  paidAt: Date;
  /** Free text, e.g. "Stripe: cs_test_..." */
  note?: string;
}

export interface InvoiceResult {
  provider: string;
  id: string;
  number?: string;
  url?: string;
}

export interface InvoicingAdapter {
  readonly name: string;
  createInvoice(req: InvoiceRequest): Promise<InvoiceResult>;
}

export function grossToString(grosze: number): string {
  return (grosze / 100).toFixed(2);
}

export function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
