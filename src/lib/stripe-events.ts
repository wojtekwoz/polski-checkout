import type Stripe from "stripe";
import { buyerFromMetadata } from "./buyer";
import type { IdempotencyMarker, PaymentEvent } from "./hooks/types";

const idOf = (v: string | { id: string } | null | undefined): string | null => (v == null ? null : typeof v === "string" ? v : v.id);

/**
 * Turn a Stripe event into a PaymentEvent, or null when it is not "money arrived".
 *
 * - checkout.session.completed with payment_status "paid" (cards, BLIK) -> purchase
 * - checkout.session.async_payment_succeeded (delayed methods, e.g. bank transfers) -> purchase
 * - invoice.paid with billing_reason "subscription_cycle" -> renewal
 *   (the first subscription invoice is covered by checkout.session.completed, so it is skipped
 *   to avoid a double invoice / double access grant)
 */
export async function toPaymentEvent(event: Stripe.Event, stripe: Stripe): Promise<PaymentEvent | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return null;
      const email = session.customer_details?.email ?? session.customer_email ?? "";
      const buyer = buyerFromMetadata(session.metadata as Record<string, string>, email);
      if (!buyer) return null; // not created by polski-checkout
      return {
        kind: "purchase",
        id: session.id,
        productId: session.metadata?.pc_product ?? session.client_reference_id ?? null,
        buyer,
        amountGross: session.amount_total ?? 0,
        currency: session.currency ?? "pln",
        paidAt: new Date(event.created * 1000),
        stripe: {
          customerId: idOf(session.customer),
          sessionId: session.id,
          subscriptionId: idOf(session.subscription),
          paymentIntentId: idOf(session.payment_intent),
          invoiceId: idOf(session.invoice) ?? undefined,
          livemode: session.livemode,
        },
      };
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== "subscription_cycle") return null;
      const customerId = idOf(invoice.customer);
      if (!customerId || !invoice.id) return null;
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      const buyer = buyerFromMetadata(customer.metadata, invoice.customer_email ?? customer.email ?? "");
      if (!buyer) return null;
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
      return {
        kind: "renewal",
        id: invoice.id,
        productId: customer.metadata.pc_product ?? null,
        buyer,
        amountGross: invoice.amount_paid,
        currency: invoice.currency,
        paidAt: new Date((invoice.status_transitions?.paid_at ?? event.created) * 1000),
        stripe: { customerId, invoiceId: invoice.id, subscriptionId, livemode: invoice.livemode },
      };
    }
    default:
      return null;
  }
}

/**
 * Idempotency markers stored in Stripe metadata (no own database):
 * - one-time purchase -> PaymentIntent metadata
 * - subscription purchase -> first Invoice metadata
 * - renewal -> that Invoice's metadata
 */
export function stripeMarker(stripe: Stripe, ev: PaymentEvent): IdempotencyMarker {
  const target: { kind: "pi" | "inv"; id: string } | null = ev.stripe.paymentIntentId
    ? { kind: "pi", id: ev.stripe.paymentIntentId }
    : ev.stripe.invoiceId
      ? { kind: "inv", id: ev.stripe.invoiceId }
      : null;

  const memory = new Map<string, string>();
  const read = async (): Promise<Record<string, string>> => {
    if (!target) return Object.fromEntries(memory);
    const obj = target.kind === "pi" ? await stripe.paymentIntents.retrieve(target.id) : await stripe.invoices.retrieve(target.id);
    return (obj.metadata ?? {}) as Record<string, string>;
  };
  return {
    async has(key) {
      return Boolean((await read())[key]);
    },
    async set(key, value) {
      if (!target) {
        memory.set(key, value);
        return;
      }
      if (target.kind === "pi") await stripe.paymentIntents.update(target.id, { metadata: { [key]: value } });
      else await stripe.invoices.update(target.id, { metadata: { [key]: value } });
    },
  };
}
