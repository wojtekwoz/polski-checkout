import type { Address } from "./address";

/** Normalised company data returned by any lookup source. Public registry data only. */
export interface CompanyInfo {
  nip: string;
  name: string;
  regon?: string | null;
  krs?: string | null;
  address: Address | null;
  /** VAT status from the White List: "Czynny" | "Zwolniony" | null (unknown / from GUS) */
  vatStatus?: string | null;
  source: "mf-white-list" | "gus-bir";
}
