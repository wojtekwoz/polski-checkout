import Link from "next/link";
import { dictionaries, resolveLocale } from "@/lib/i18n";

export default async function Cancel({ searchParams }: { searchParams: Promise<{ lang?: string; product?: string }> }) {
  const sp = await searchParams;
  const locale = resolveLocale(sp.lang);
  const d = dictionaries[locale];
  return (
    <div className="card">
      <h1>{d.cancelTitle}</h1>
      <p>{d.cancelBody}</p>
      {sp.product && /^[a-z0-9-]+$/.test(sp.product) ? (
        <Link href={`/checkout/${sp.product}?lang=${locale}`}>{d.backToCheckout}</Link>
      ) : null}
    </div>
  );
}
