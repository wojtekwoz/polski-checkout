import Link from "next/link";
import { dictionaries, resolveLocale } from "@/lib/i18n";
import { formatPln, getProducts } from "@/lib/products";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = resolveLocale((await searchParams).lang);
  const d = dictionaries[locale];
  return (
    <div className="card products">
      <h1>{d.products}</h1>
      {getProducts().map((p) => (
        <Link key={p.id} href={`/checkout/${p.id}?lang=${locale}`}>
          <strong>{p.name}</strong> - {formatPln(p.pricePln, locale === "pl" ? "pl-PL" : "en-GB")}
          {p.description ? <div className="muted">{p.description}</div> : null}
        </Link>
      ))}
    </div>
  );
}
