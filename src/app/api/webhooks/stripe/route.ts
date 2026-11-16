import type Stripe from "stripe";
import { getHooks, runAfterPayment, type HookOutcome } from "@/lib/hooks";
import { getStripe } from "@/lib/stripe";
import { stripeMarker, toPaymentEvent } from "@/lib/stripe-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 500 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const stripe = getStripe();
  const raw = await req.text(); // raw body is required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return Response.json({ error: `invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  const payment = await toPaymentEvent(event, stripe);
  if (!payment) return Response.json({ received: true, ignored: event.type });

  try {
    const outcomes = await runAfterPayment(payment, getHooks(), stripeMarker(stripe, payment));
    return Response.json({ received: true, id: payment.id, outcomes });
  } catch (err) {
    // 500 -> Stripe retries; hooks that already succeeded are skipped on retry.
    const outcomes = (err as Error & { outcomes?: HookOutcome[] }).outcomes;
    return Response.json({ received: true, id: payment.id, error: (err as Error).message, outcomes }, { status: 500 });
  }
}
