import type { Buyer } from "../buyer";

/** Normalised "money arrived" event passed to every after-payment hook. */
export interface PaymentEvent {
  kind: "purchase" | "renewal";
  /** Stripe object id used for idempotency: Checkout Session id (purchase) or Invoice id (renewal). */
  id: string;
  productId: string | null;
  buyer: Buyer;
  amountGross: number;
  currency: string;
  paidAt: Date;
  stripe: {
    customerId: string | null;
    sessionId?: string;
    invoiceId?: string;
    subscriptionId?: string | null;
    paymentIntentId?: string | null;
    livemode: boolean;
  };
}

/**
 * Where we remember which hooks already ran, so Stripe webhook retries do not
 * grant access twice or issue duplicate invoices. Backed by Stripe metadata - no own database.
 */
export interface IdempotencyMarker {
  has(key: string): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
}

export interface AfterPaymentHook {
  /** Short key, also used as the idempotency marker key (pc_done_<key>). */
  readonly key: string;
  run(event: PaymentEvent): Promise<string | void>;
}
