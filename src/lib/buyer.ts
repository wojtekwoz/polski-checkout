import { isValidPostalCode, normalizePostalCode, type Address } from "./address";
import { validateNip } from "./nip";

export interface BuyerInput {
  email: string;
  firstName: string;
  lastName: string;
  wantsInvoice: boolean;
  /** Only when wantsInvoice */
  nip?: string;
  companyName?: string;
  address: Address;
  /** Consent to terms (regulamin) - required */
  acceptTerms: boolean;
}

export interface Buyer extends Omit<BuyerInput, "nip" | "companyName" | "acceptTerms"> {
  type: "company" | "person";
  nip?: string;
  companyName?: string;
}

export type FieldError = { field: string; code: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validate and normalise untrusted form data. Never trust the client. */
export function parseBuyer(input: unknown): { ok: true; buyer: Buyer } | { ok: false; errors: FieldError[] } {
  const i = (input ?? {}) as Record<string, unknown>;
  const a = (i.address ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  const email = str(i.email, 254).toLowerCase();
  const firstName = str(i.firstName, 100);
  const lastName = str(i.lastName, 100);
  const wantsInvoice = i.wantsInvoice === true;
  const country = (str(a.country, 2) || "PL").toUpperCase();
  const address: Address = {
    street: str(a.street, 200),
    postalCode: normalizePostalCode(str(a.postalCode, 16), country),
    city: str(a.city, 100),
    country,
  };

  if (!EMAIL.test(email)) errors.push({ field: "email", code: "invalid" });
  if (!firstName) errors.push({ field: "firstName", code: "required" });
  if (!lastName) errors.push({ field: "lastName", code: "required" });
  if (!address.street) errors.push({ field: "address.street", code: "required" });
  if (!address.city) errors.push({ field: "address.city", code: "required" });
  if (!/^[A-Z]{2}$/.test(country)) errors.push({ field: "address.country", code: "invalid" });
  if (!isValidPostalCode(address.postalCode, country)) errors.push({ field: "address.postalCode", code: "invalid" });
  if (i.acceptTerms !== true) errors.push({ field: "acceptTerms", code: "required" });

  let nip: string | undefined;
  let companyName: string | undefined;
  if (wantsInvoice) {
    const v = validateNip(str(i.nip, 20));
    if (!v.valid) errors.push({ field: "nip", code: v.reason });
    else nip = v.nip;
    companyName = str(i.companyName, 250);
    if (!companyName) errors.push({ field: "companyName", code: "required" });
    // A Polish NIP implies a Polish company address.
    if (country !== "PL") errors.push({ field: "address.country", code: "nip_requires_pl" });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    buyer: {
      type: wantsInvoice ? "company" : "person",
      email,
      firstName,
      lastName,
      wantsInvoice,
      nip,
      companyName,
      address,
    },
  };
}

/** Stripe metadata: max 50 keys, 500 chars per value. Prefix keys to avoid collisions. */
export function buyerToMetadata(buyer: Buyer, productId: string): Record<string, string> {
  const m: Record<string, string> = {
    pc_product: productId,
    pc_buyer_type: buyer.type,
    pc_first_name: buyer.firstName,
    pc_last_name: buyer.lastName,
    pc_street: buyer.address.street,
    pc_postal_code: buyer.address.postalCode,
    pc_city: buyer.address.city,
    pc_country: buyer.address.country,
  };
  if (buyer.nip) m.pc_nip = buyer.nip;
  if (buyer.companyName) m.pc_company_name = buyer.companyName.slice(0, 500);
  return m;
}

export function buyerFromMetadata(meta: Record<string, string> | null | undefined, email: string): Buyer | null {
  if (!meta || !meta.pc_buyer_type) return null;
  const type = meta.pc_buyer_type === "company" ? "company" : "person";
  return {
    type,
    email,
    firstName: meta.pc_first_name ?? "",
    lastName: meta.pc_last_name ?? "",
    wantsInvoice: type === "company",
    nip: meta.pc_nip,
    companyName: meta.pc_company_name,
    address: {
      street: meta.pc_street ?? "",
      postalCode: meta.pc_postal_code ?? "",
      city: meta.pc_city ?? "",
      country: meta.pc_country ?? "PL",
    },
  };
}
