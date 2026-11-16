/**
 * Client for the Polish Ministry of Finance VAT White List API ("Biała lista podatników VAT").
 * Docs: https://wl-api.mf.gov.pl/  - public, no API key. Daily request limits apply per IP.
 */
import { parsePolishAddressLine } from "./address";
import type { CompanyInfo } from "./company";

export const WHITE_LIST_BASE_URL = "https://wl-api.mf.gov.pl";

/** Subset of the White List "Entity" model we use. */
export interface WhiteListSubject {
  name: string;
  nip: string | null;
  statusVat: string | null;
  regon: string | null;
  krs: string | null;
  residenceAddress: string | null;
  workingAddress: string | null;
}

export interface WhiteListResponse {
  result?: {
    subject: WhiteListSubject | null;
    requestId?: string;
    requestDateTime?: string;
  };
  code?: string;
  message?: string;
}

export class WhiteListError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "WhiteListError";
  }
}

/** Today's date in Europe/Warsaw as YYYY-MM-DD (the API rejects future dates). */
export function warsawDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Map a White List subject to our CompanyInfo. Pure function, unit tested. */
export function mapWhiteListSubject(subject: WhiteListSubject, nip: string): CompanyInfo {
  // Companies have a registered seat (residenceAddress); sole traders usually only a workingAddress.
  const address =
    parsePolishAddressLine(subject.residenceAddress) ?? parsePolishAddressLine(subject.workingAddress);
  return {
    nip: subject.nip ?? nip,
    name: subject.name.trim(),
    regon: subject.regon,
    krs: subject.krs,
    address,
    vatStatus: subject.statusVat,
    source: "mf-white-list",
  };
}

export interface LookupOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  date?: string;
  timeoutMs?: number;
}

/**
 * Look up a NIP. Returns null when the NIP is not registered for VAT
 * (the White List only contains active, exempt and removed VAT payers).
 */
export async function lookupWhiteList(nip: string, opts: LookupOptions = {}): Promise<CompanyInfo | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? WHITE_LIST_BASE_URL}/api/search/nip/${encodeURIComponent(nip)}?date=${opts.date ?? warsawDate()}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch (err) {
    throw new WhiteListError(`White List request failed: ${(err as Error).message}`);
  }

  let body: WhiteListResponse;
  try {
    body = (await res.json()) as WhiteListResponse;
  } catch {
    throw new WhiteListError(`White List returned non-JSON response (HTTP ${res.status})`, res.status);
  }

  if (!res.ok) {
    // e.g. WL-113 invalid NIP, WL-190/191 request limit exceeded
    throw new WhiteListError(body.message ?? `White List HTTP ${res.status}`, res.status, body.code);
  }

  const subject = body.result?.subject;
  if (!subject) return null;
  return mapWhiteListSubject(subject, nip);
}
