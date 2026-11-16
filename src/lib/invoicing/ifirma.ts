/**
 * iFirma.pl adapter (API "iapi"). Docs: https://api.ifirma.pl/
 * Auth: header `Authentication: IAPIS user=<login>, hmac-sha1=<hex>` where
 *   hmac = HMAC-SHA1(key = hex-decoded API key "faktura", message = url + login + keyName + body).
 * Env: IFIRMA_LOGIN, IFIRMA_INVOICE_KEY (the "faktura" API key from iFirma settings).
 *
 * Status: implemented from the public docs, covered by unit tests for the payload and signature,
 * NOT yet verified against a live iFirma account. Test on a demo account before production.
 */
import { createHmac } from "node:crypto";
import { grossToString, isoDate, type InvoiceRequest, type InvoiceResult, type InvoicingAdapter } from "./types";

export const IFIRMA_URL = "https://www.ifirma.pl/iapi/fakturakraj.json";

export interface IfirmaConfig {
  login: string;
  /** Hex API key for the "faktura" key name. */
  invoiceKey: string;
  /** Place of issue shown on the invoice, e.g. "Warszawa". */
  placeOfIssue?: string;
  fetchImpl?: typeof fetch;
}

export function ifirmaSignature(url: string, login: string, keyName: string, body: string, hexKey: string): string {
  return createHmac("sha1", Buffer.from(hexKey, "hex"))
    .update(url + login + keyName + body, "utf8")
    .digest("hex");
}

export function buildIfirmaInvoice(req: InvoiceRequest, placeOfIssue = "") {
  const b = req.buyer;
  const isCompany = b.type === "company";
  const date = isoDate(req.paidAt);
  const exempt = req.vatRate === "zw";
  return {
    Zaplacono: Number(grossToString(req.amountGross)),
    ZaplaconoNaDokumencie: Number(grossToString(req.amountGross)),
    LiczOd: "BRT",
    DataWystawienia: date,
    MiejsceWystawienia: placeOfIssue,
    DataSprzedazy: date,
    FormatDatySprzedazy: "DZN",
    SposobZaplaty: "KAR",
    RodzajPodpisuOdbiorcy: "BPO",
    WidocznyNumerGios: false,
    Numer: null,
    Uwagi: req.note ?? "",
    Pozycje: [
      {
        StawkaVat: exempt ? null : (req.vatRate as number) / 100,
        Ilosc: 1,
        CenaJednostkowa: Number(grossToString(req.amountGross)),
        NazwaPelna: req.itemName,
        Jednostka: "szt.",
        TypStawkiVat: exempt ? "ZW" : "PRC",
      },
    ],
    Kontrahent: {
      Nazwa: isCompany ? b.companyName : `${b.firstName} ${b.lastName}`,
      NIP: isCompany ? b.nip : undefined,
      Ulica: b.address.street,
      KodPocztowy: b.address.postalCode,
      Miejscowosc: b.address.city,
      Kraj: b.address.country === "PL" ? "Polska" : b.address.country,
      Email: b.email,
      OsobaFizyczna: !isCompany,
    },
  };
}

export class IfirmaAdapter implements InvoicingAdapter {
  readonly name = "ifirma";
  constructor(private readonly cfg: IfirmaConfig) {}

  async createInvoice(req: InvoiceRequest): Promise<InvoiceResult> {
    const f = this.cfg.fetchImpl ?? fetch;
    const body = JSON.stringify(buildIfirmaInvoice(req, this.cfg.placeOfIssue));
    const keyName = "faktura";
    const sig = ifirmaSignature(IFIRMA_URL, this.cfg.login, keyName, body, this.cfg.invoiceKey);
    const res = await f(IFIRMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json",
        Authentication: `IAPIS user=${this.cfg.login}, hmac-sha1=${sig}`,
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { response?: { Kod?: number; Informacja?: string; Identyfikator?: number } };
    const r = json.response;
    if (!res.ok || !r || r.Kod !== 0) {
      throw new Error(`iFirma HTTP ${res.status}: ${r?.Informacja ?? "unknown error"} (Kod ${r?.Kod})`);
    }
    return { provider: this.name, id: String(r.Identyfikator ?? "") };
  }
}
