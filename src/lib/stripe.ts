import Stripe from "stripe";
import { buyerToMetadata, type Buyer } from "./buyer";
import { appUrl, requireEnv } from "./env";
import { toEuVat } from "./nip";
import type { Product } from "./products";
import type { Locale } from "./i18n";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { appInfo: { name: "polski-checkout" } });
  return client;
}

export interface CreateSessionArgs {
  product: Product;
  buyer: Buyer;
  locale: Locale;
  stripe?: Stripe;
}

/** Build the Checkout Session params. Pure, so it can be unit tested without Stripe. */
export function buildSessionParams(
  product: Product,
  buyer: Buyer,
  customerId: string,
  locale: Locale,
  baseUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const metadata = buyerToMetadata(buyer, product.id);
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = product.stripePriceId
    ? { price: product.stripePriceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(product.pricePln * 100),
          product_data: { name: product.name, ...(product.description ? { description: product.description } : {}) },
          ...(product.mode === "subscription" ? { recurring: { interval: product.interval ?? "month" } } : {}),
        },
      };

  const success = product.successUrl ?? `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&lang=${locale}`;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: product.mode,
    customer: customerId,
    line_items: [lineItem],
    success_url: success,
    cancel_url: `${baseUrl}/cancel?product=${encodeURIComponent(product.id)}&lang=${locale}`,
    locale: locale === "pl" ? "pl" : "en",
    allow_promotion_codes: product.allowPromotionCodes ?? true,
    client_reference_id: product.id,
    metadata,
    // Buyer data is already collected and validated by our form - do not ask again.
    billing_address_collection: "auto",
  };
  if (product.mode === "subscription") {
    params.subscription_data = { metadata };
  } else {
    params.payment_intent_data = { metadata };
  }
  return params;
}

/**
 * Creates a Stripe Customer carrying the buyer's address, tax id (eu_vat, "PL" + NIP) and metadata,
 * then a Checkout Session for that customer. Returns the hosted Checkout URL.
 *
 * Note: a Customer is created for every started checkout, including abandoned ones.
 */
export async function createCheckout({ product, buyer, locale, stripe = getStripe() }: CreateSessionArgs): Promise<string> {
  const displayName = buyer.type === "company" && buyer.companyName ? buyer.companyName : `${buyer.firstName} ${buyer.lastName}`;
  const metadata = buyerToMetadata(buyer, product.id);

  const customer = await stripe.customers.create({
    email: buyer.email,
    name: displayName,
    address: {
      line1: buyer.address.street,
      postal_code: buyer.address.postalCode,
      city: buyer.address.city,
      country: buyer.address.country,
    },
    preferred_locales: [locale],
    metadata,
    ...(buyer.type === "company" && buyer.nip ? { tax_id_data: [{ type: "eu_vat", value: toEuVat(buyer.nip) }] } : {}),
  });

  const session = await stripe.checkout.sessions.create(buildSessionParams(product, buyer, customer.id, locale, appUrl()));
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}
