import type { CompanyInfo } from "./company";
import { lookupGus, GUS_PROD_URL, GUS_TEST_URL } from "./gus";
import { validateNip } from "./nip";
import { lookupWhiteList } from "./whitelist";

export type CompanyLookupResult =
  | { ok: true; company: CompanyInfo }
  | { ok: false; error: "invalid_nip" | "not_found" | "lookup_failed" };

// Small in-memory cache of PUBLIC registry data, to save the White List daily quota.
// Per serverless instance only; no buyer data is stored.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: CompanyInfo | null }>();

function cacheGet(nip: string) {
  const hit = cache.get(nip);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(nip);
    return undefined;
  }
  return hit.value;
}

function cacheSet(nip: string, value: CompanyInfo | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(nip, { at: Date.now(), value });
}

export interface CompanyLookupDeps {
  fetchImpl?: typeof fetch;
  gusApiKey?: string;
  gusUrl?: string;
  noCache?: boolean;
}

export async function lookupCompany(rawNip: string, deps: CompanyLookupDeps = {}): Promise<CompanyLookupResult> {
  const v = validateNip(rawNip);
  if (!v.valid) return { ok: false, error: "invalid_nip" };
  const nip = v.nip;

  if (!deps.noCache) {
    const cached = cacheGet(nip);
    if (cached) return { ok: true, company: cached };
  }

  const gusApiKey = deps.gusApiKey ?? process.env.GUS_API_KEY;
  const gusUrl = deps.gusUrl ?? (process.env.GUS_ENV === "test" ? GUS_TEST_URL : GUS_PROD_URL);
  let failed = false;

  try {
    const company = await lookupWhiteList(nip, { fetchImpl: deps.fetchImpl });
    if (company) {
      if (!deps.noCache) cacheSet(nip, company);
      return { ok: true, company };
    }
  } catch (err) {
    failed = true;
    console.warn("[polski-checkout] White List lookup failed:", (err as Error).message);
  }

  if (gusApiKey) {
    try {
      const company = await lookupGus(nip, { apiKey: gusApiKey, url: gusUrl, fetchImpl: deps.fetchImpl });
      if (company) {
        if (!deps.noCache) cacheSet(nip, company);
        return { ok: true, company };
      }
      failed = false;
    } catch (err) {
      failed = true;
      console.warn("[polski-checkout] GUS lookup failed:", (err as Error).message);
    }
  }

  return { ok: false, error: failed ? "lookup_failed" : "not_found" };
}
