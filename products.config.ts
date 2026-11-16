import type { Product } from "./src/lib/products";

/**
 * Your products. Each one gets a checkout page at /checkout/<id>.
 *
 * - `stripePriceId` (recommended): an existing Price in your Stripe account. The amount and
 *   interval then come from Stripe; `pricePln` is only shown on the page.
 * - Without `stripePriceId`, the session is created with inline `price_data` from `pricePln`
 *   (and `interval` for subscriptions).
 *
 * You can override this whole list without a code change by setting PRODUCTS_JSON
 * (a JSON array with the same shape) in your environment.
 */
const products: Product[] = [
  {
    id: "kurs-demo",
    name: "Kurs demo",
    description: "Jednorazowy dostęp do kursu.",
    pricePln: 199,
    mode: "payment",
    vatRate: 23,
  },
  {
    id: "spolecznosc-miesiecznie",
    name: "Społeczność - plan miesięczny",
    description: "Dostęp do społeczności, odnawiany co miesiąc.",
    pricePln: 149,
    mode: "subscription",
    interval: "month",
    vatRate: 23,
  },
];

export default products;
