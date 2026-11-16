import { FakturowniaAdapter } from "./fakturownia";
import { IfirmaAdapter } from "./ifirma";
import type { InvoicingAdapter } from "./types";

export * from "./types";

/**
 * Pick the invoicing adapter from env. INVOICING_PROVIDER = "fakturownia" | "ifirma" | "none" (default).
 * To add another provider (inFakt, wFirma, KSeF...), implement InvoicingAdapter and register it here.
 */
export function getInvoicingAdapter(env: NodeJS.ProcessEnv = process.env): InvoicingAdapter | null {
  const provider = (env.INVOICING_PROVIDER ?? "none").toLowerCase();
  switch (provider) {
    case "fakturownia":
      if (!env.FAKTUROWNIA_DOMAIN || !env.FAKTUROWNIA_API_TOKEN) throw new Error("Fakturownia needs FAKTUROWNIA_DOMAIN and FAKTUROWNIA_API_TOKEN");
      return new FakturowniaAdapter({
        domain: env.FAKTUROWNIA_DOMAIN,
        apiToken: env.FAKTUROWNIA_API_TOKEN,
        kind: env.FAKTUROWNIA_KIND === "bill" ? "bill" : "vat",
        sendEmail: env.FAKTUROWNIA_SEND_EMAIL === "true",
      });
    case "ifirma":
      if (!env.IFIRMA_LOGIN || !env.IFIRMA_INVOICE_KEY) throw new Error("iFirma needs IFIRMA_LOGIN and IFIRMA_INVOICE_KEY");
      return new IfirmaAdapter({ login: env.IFIRMA_LOGIN, invoiceKey: env.IFIRMA_INVOICE_KEY, placeOfIssue: env.IFIRMA_PLACE_OF_ISSUE });
    case "none":
    case "":
      return null;
    default:
      throw new Error(`Unknown INVOICING_PROVIDER "${provider}"`);
  }
}
