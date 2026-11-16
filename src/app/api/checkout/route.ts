import { parseBuyer } from "@/lib/buyer";
import { resolveLocale } from "@/lib/i18n";
import { getProduct } from "@/lib/products";
import { createCheckout } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const product = getProduct(String(body.productId ?? ""));
  if (!product) return Response.json({ error: "unknown_product" }, { status: 404 });

  const parsed = parseBuyer(body.buyer);
  if (!parsed.ok) return Response.json({ error: "validation", errors: parsed.errors }, { status: 422 });

  try {
    const url = await createCheckout({ product, buyer: parsed.buyer, locale: resolveLocale(String(body.locale ?? "")) });
    return Response.json({ url });
  } catch (err) {
    console.error("[polski-checkout] createCheckout failed:", (err as Error).message);
    return Response.json({ error: "stripe_error" }, { status: 502 });
  }
}
