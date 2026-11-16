import { lookupCompany } from "@/lib/company-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ nip: string }> }) {
  const { nip } = await ctx.params;
  const result = await lookupCompany(nip);
  if (result.ok) {
    return Response.json(result.company, { headers: { "Cache-Control": "private, max-age=3600" } });
  }
  const status = result.error === "invalid_nip" ? 400 : result.error === "not_found" ? 404 : 502;
  return Response.json({ error: result.error }, { status });
}
