export interface Address {
  /** Street with building/flat number, e.g. "ul. Prosta 1/2" */
  street: string;
  /** Polish format NN-NNN for PL, free text for other countries */
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2, e.g. "PL" */
  country: string;
}

export const POLISH_POSTCODE = /^\d{2}-\d{3}$/;

/** For PL, accepts "00950" or "00-950" and returns "00-950". Other countries are only trimmed. */
export function normalizePostalCode(input: string, country: string = "PL"): string {
  const t = input.trim();
  if (country.toUpperCase() === "PL" && /^\d{5}$/.test(t)) return `${t.slice(0, 2)}-${t.slice(2)}`;
  return t;
}

export function isValidPostalCode(postalCode: string, country: string): boolean {
  if (country.toUpperCase() === "PL") return POLISH_POSTCODE.test(postalCode);
  return postalCode.trim().length > 0 && postalCode.length <= 16;
}

/**
 * Parse a one-line Polish address as returned by the MF VAT White List, e.g.
 *   "ALEJE JEROZOLIMSKIE 160, 02-326 WARSZAWA"
 *   "UL. PROSTA 1/2, 00-838 WARSZAWA"
 *   "DZIEKANÓW LEŚNY UL. SADOWA 3 05-092 ŁOMIANKI"
 * Returns null when no postcode can be found.
 */
export function parsePolishAddressLine(line: string | null | undefined): Address | null {
  if (!line) return null;
  const cleaned = line.replace(/\s+/g, " ").trim();
  // Take the LAST postcode in the string: street names may contain numbers.
  const re = /(\d{2}-\d{3})/g;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(cleaned)) !== null) last = match;
  if (!last) return null;

  const street = cleaned.slice(0, last.index).replace(/[,\s]+$/, "").trim();
  const city = cleaned.slice(last.index + last[0].length).replace(/^[,\s]+/, "").trim();
  if (!city) return null;

  return { street, postalCode: last[1], city, country: "PL" };
}
