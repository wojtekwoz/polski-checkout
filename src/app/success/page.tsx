import { dictionaries, resolveLocale } from "@/lib/i18n";

export default async function Success({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const d = dictionaries[resolveLocale((await searchParams).lang)];
  return (
    <div className="card">
      <h1>{d.successTitle}</h1>
      <p>{d.successBody}</p>
    </div>
  );
}
