import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/CheckoutForm";
import { dictionaries, locales, resolveLocale } from "@/lib/i18n";
import { formatPln, getProduct } from "@/lib/products";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();
  const locale = resolveLocale((await searchParams).lang);
  const d = dictionaries[locale];
  const interval =
    product.mode === "subscription"
      ? { month: d.perMonth, year: d.perYear, week: d.perWeek, day: d.perDay }[product.interval ?? "month"]
      : d.oneTime;

  return (
    <>
      {locales.length > 1 ? (
        <div className="lang">
          {locales.map((l) => (
            <Link key={l} href={`/checkout/${product.id}?lang=${l}`} aria-current={l === locale ? "page" : undefined}>
              {l.toUpperCase()}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="card">
        <div className="muted">{process.env.NEXT_PUBLIC_SHOP_NAME ?? d.title}</div>
        <h1>{product.name}</h1>
        {product.description ? <div className="muted">{product.description}</div> : null}
        <p className="price">
          {formatPln(product.pricePln, locale === "pl" ? "pl-PL" : "en-GB")} <small>{interval} · {d.grossNote}</small>
        </p>
      </div>
      <div className="card">
        <CheckoutForm
          productId={product.id}
          locale={locale}
          dict={d}
          termsUrl={process.env.NEXT_PUBLIC_TERMS_URL}
          showPromoInfo={product.allowPromotionCodes ?? true}
        />
      </div>
    </>
  );
}
