/**
 * Minimal client for GUS BIR 1.1 (REGON database) - "Wyszukiwarka REGON" SOAP API.
 * Requires a free user key from GUS (regon_bir@stat.gov.pl). Used as a fallback when a company
 * is not on the VAT White List (e.g. VAT-exempt sole traders who never registered for VAT).
 *
 * Test environment: https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc
 * with the public test key "abcde12345abcde12345" (test data only).
 */
import { normalizePostalCode } from "./address";
import type { CompanyInfo } from "./company";

export const GUS_PROD_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
export const GUS_TEST_URL = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const NS = "http://CIS/BIR/PUBL/2014/07";

export interface GusOptions {
  apiKey: string;
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GusError";
  }
}

function envelope(url: string, action: string, body: string): string {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${NS}" xmlns:dat="${NS}/DataContract">
<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
<wsa:To>${url}</wsa:To>
<wsa:Action>${NS}/IUslugaBIRzewnPubl/${action}</wsa:Action>
</soap:Header>
<soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/gi, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function extractTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return m ? m[1] : null;
}

/** Parse the inner `<root><dane>...</dane></root>` document of DaneSzukajPodmioty. Pure, unit tested. */
export function mapGusSearchResult(innerXml: string, nip: string): CompanyInfo | null {
  const dane = extractTag(innerXml, "dane");
  if (!dane) return null;
  // GUS returns an error record inside <dane> when nothing is found.
  if (extractTag(dane, "ErrorCode")) return null;

  const get = (t: string) => {
    const v = extractTag(dane, t);
    return v ? decodeXmlEntities(v).trim() : "";
  };

  const ulica = get("Ulica");
  const nrNieruchomosci = get("NrNieruchomosci");
  const nrLokalu = get("NrLokalu");
  const miejscowosc = get("Miejscowosc");
  const poczta = get("MiejscowoscPoczty") || miejscowosc;
  const building = nrNieruchomosci + (nrLokalu ? `/${nrLokalu}` : "");
  // In villages without street names, the address is "<village> <number>".
  const street = [ulica || (poczta !== miejscowosc ? miejscowosc : ""), building].filter(Boolean).join(" ");
  const postal = get("KodPocztowy");

  return {
    nip: get("Nip") || nip,
    name: get("Nazwa"),
    regon: get("Regon") || null,
    krs: null,
    address: postal || poczta
      ? { street, postalCode: normalizePostalCode(postal), city: poczta, country: "PL" }
      : null,
    vatStatus: null,
    source: "gus-bir",
  };
}

async function call(opts: GusOptions, action: string, body: string, sid?: string): Promise<string> {
  const url = opts.url ?? GUS_PROD_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "Content-Type": "application/soap+xml; charset=utf-8" };
  if (sid) headers.sid = sid;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: envelope(url, action, body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
      cache: "no-store",
    });
  } catch (err) {
    throw new GusError(`GUS ${action} request failed: ${(err as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new GusError(`GUS ${action} HTTP ${res.status}`);
  return text;
}

export async function lookupGus(nip: string, opts: GusOptions): Promise<CompanyInfo | null> {
  const login = await call(opts, "Zaloguj", `<ns:Zaloguj><ns:pKluczUzytkownika>${escapeXml(opts.apiKey)}</ns:pKluczUzytkownika></ns:Zaloguj>`);
  const sid = extractTag(login, "ZalogujResult")?.trim();
  if (!sid) throw new GusError("GUS login failed (check GUS_API_KEY)");

  try {
    const res = await call(
      opts,
      "DaneSzukajPodmioty",
      `<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${escapeXml(nip)}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>`,
      sid,
    );
    const inner = extractTag(res, "DaneSzukajPodmiotyResult");
    if (!inner) return null;
    return mapGusSearchResult(decodeXmlEntities(inner), nip);
  } finally {
    // Best effort logout; ignore errors.
    call(opts, "Wyloguj", `<ns:Wyloguj><ns:pIdentyfikatorSesji>${escapeXml(sid)}</ns:pIdentyfikatorSesji></ns:Wyloguj>`).catch(() => {});
  }
}
