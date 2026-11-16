import defaultProducts from "../../products.config";

export interface Product {
  /** URL slug: /checkout/<id> */
  id: string;
  name: string;
  description?: string;
  /** Gross price in PLN, shown on the checkout page (and used for price_data when no stripePriceId). */
  pricePln: number;
  mode: "payment" | "subscription";
  /** Required for subscriptions without stripePriceId. */
  interval?: "day" | "week" | "month" | "year";
  /** Existing Stripe Price id (price_...). */
  stripePriceId?: string;
  /** VAT rate in percent for your invoices (23, 8, 5, 0) or "zw" (VAT-exempt). Default 23. */
  vatRate?: number | "zw";
  /** Name used on the invoice line (defaults to `name`). */
  invoiceItemName?: string;
  /** Allow Stripe promotion codes on this product (default true). */
  allowPromotionCodes?: boolean;
  /** Override the post-payment redirect for this product. */
  successUrl?: string;
}

export function validateProducts(list: unknown): Product[] {
  if (!Array.isArray(list)) throw new Error("Products must be an array");
  const ids = new Set<string>();
  return list.map((p, i) => {
    const prod = p as Product;
    if (!prod || typeof prod.id !== "string" || !/^[a-z0-9-]+$/.test(prod.id)) {
      throw new Error(`Product #${i}: id must match [a-z0-9-]+`);
    }
    if (ids.has(prod.id)) throw new Error(`Duplicate product id "${prod.id}"`);
    ids.add(prod.id);
    if (typeof prod.name !== "string" || !prod.name) throw new Error(`Product ${prod.id}: name required`);
    if (typeof prod.pricePln !== "number" || prod.pricePln <= 0) throw new Error(`Product ${prod.id}: pricePln must be > 0`);
    if (prod.mode !== "payment" && prod.mode !== "subscription") throw new Error(`Product ${prod.id}: mode must be payment|subscription`);
    if (prod.mode === "subscription" && !prod.stripePriceId && !prod.interval) {
      throw new Error(`Product ${prod.id}: subscriptions need stripePriceId or interval`);
    }
    return prod;
  });
}

let cached: Product[] | null = null;

export function getProducts(): Product[] {
  if (cached) return cached;
  const raw = process.env.PRODUCTS_JSON;
  cached = validateProducts(raw ? JSON.parse(raw) : defaultProducts);
  return cached;
}

export function getProduct(id: string): Product | undefined {
  return getProducts().find((p) => p.id === id);
}

export function formatPln(amount: number, locale: string = "pl-PL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(amount);
}
