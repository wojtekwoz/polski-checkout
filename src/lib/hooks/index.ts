import { getInvoicingAdapter } from "../invoicing";
import { AccessWebhookHook } from "./access-webhook";
import { InvoiceHook } from "./invoice-hook";
import type { AfterPaymentHook, IdempotencyMarker, PaymentEvent } from "./types";

export * from "./types";
export { AccessWebhookHook } from "./access-webhook";
export { InvoiceHook } from "./invoice-hook";

/** Build the hook list from env. Add your own hooks here (Slack notification, CRM, Plunk/Mailchimp tag...). */
export function getHooks(env: NodeJS.ProcessEnv = process.env): AfterPaymentHook[] {
  const hooks: AfterPaymentHook[] = [];
  if (env.ACCESS_WEBHOOK_URL) hooks.push(new AccessWebhookHook(env.ACCESS_WEBHOOK_URL, env.ACCESS_WEBHOOK_SECRET));
  const adapter = getInvoicingAdapter(env);
  if (adapter) hooks.push(new InvoiceHook(adapter, env.INVOICE_SCOPE === "all" ? "all" : "company"));
  return hooks;
}

export interface HookOutcome {
  key: string;
  status: "done" | "already_done" | "failed";
  detail?: string;
}

/**
 * Run every hook once per payment. Each hook is independent: a failing invoice does not block access.
 * Throws at the end if any hook failed, so the webhook returns 500 and Stripe retries
 * (hooks that already succeeded are skipped on retry thanks to the marker).
 */
export async function runAfterPayment(event: PaymentEvent, hooks: AfterPaymentHook[], marker: IdempotencyMarker): Promise<HookOutcome[]> {
  const outcomes: HookOutcome[] = [];
  for (const hook of hooks) {
    const markerKey = `pc_done_${hook.key}`;
    try {
      if (await marker.has(markerKey)) {
        outcomes.push({ key: hook.key, status: "already_done" });
        continue;
      }
      const detail = (await hook.run(event)) ?? "ok";
      await marker.set(markerKey, String(detail).slice(0, 450));
      outcomes.push({ key: hook.key, status: "done", detail: String(detail) });
    } catch (err) {
      console.error(`[polski-checkout] hook "${hook.key}" failed for ${event.id}:`, (err as Error).message);
      outcomes.push({ key: hook.key, status: "failed", detail: (err as Error).message });
    }
  }
  if (outcomes.some((o) => o.status === "failed")) {
    const e = new Error("One or more after-payment hooks failed") as Error & { outcomes: HookOutcome[] };
    e.outcomes = outcomes;
    throw e;
  }
  return outcomes;
}
