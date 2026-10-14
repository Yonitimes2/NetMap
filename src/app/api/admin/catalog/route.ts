import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { countsByCategory, listBrands, recentRuns } from "@/lib/products/store";
import { startWebSync, syncProgress } from "@/lib/products/sync";

/** Brands, how many products each category has, recent updates and the one running now. */
export async function GET() {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const brands = await listBrands();
  const out = [];
  for (const b of brands) out.push({ ...b, counts: await countsByCategory(b.id), runs: await recentRuns(b.id) });
  return Response.json({ brands: out, progress: syncProgress() });
}

/** Start updating a brand from its website: { brandId, limit? } */
export async function POST(req: Request) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const limit = typeof body?.limit === "number" && body.limit > 0 ? Math.floor(body.limit) : undefined;
  try {
    if (!startWebSync(brandId, { limit })) return jsonError(409, "running", "כבר רץ עדכון. אפשר לעקוב אחריו בדף.");
  } catch (e) {
    return jsonError(400, "bad_request", (e as Error).message);
  }
  return Response.json({ progress: syncProgress() });
}
