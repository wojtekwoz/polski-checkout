/**
 * Polish NIP (Numer Identyfikacji Podatkowej) helpers.
 *
 * A NIP has 10 digits. The last digit is a checksum:
 *   sum(d[i] * w[i]) mod 11 for i = 0..8, with weights 6 5 7 2 3 4 5 6 7.
 * A remainder of 10 is never issued, so such numbers are invalid.
 */

const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

/** Strip spaces, dashes, dots and an optional "PL" prefix. Returns digits only (may be invalid). */
export function normalizeNip(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/^PL/, "")
    .replace(/[\s\-.]/g, "");
}

export type NipValidation =
  | { valid: true; nip: string }
  | { valid: false; reason: "format" | "checksum" };

export function validateNip(input: string): NipValidation {
  const nip = normalizeNip(input);
  if (!/^\d{10}$/.test(nip)) return { valid: false, reason: "format" };
  // All-zero and similar degenerate numbers pass the checksum but are never issued.
  if (/^0+$/.test(nip)) return { valid: false, reason: "format" };

  const digits = nip.split("").map(Number);
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * digits[i], 0);
  const control = sum % 11;
  if (control === 10 || control !== digits[9]) {
    return { valid: false, reason: "checksum" };
  }
  return { valid: true, nip };
}

export function isValidNip(input: string): boolean {
  return validateNip(input).valid;
}

/** Format as the EU VAT id Stripe expects for `eu_vat` tax ids, e.g. "PL5260250995". */
export function toEuVat(nip: string): string {
  return `PL${normalizeNip(nip)}`;
}

/** Human formatting: 526-025-09-95 */
export function formatNip(nip: string): string {
  const n = normalizeNip(nip);
  if (n.length !== 10) return n;
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8)}`;
}
