import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { priceOrg } from "@/lib/db/orgs";
import { applyPriceList, setMarkup } from "@/lib/products/store";
import type { PriceRow } from "@/lib/products/pricing";

/** Prices are an account's own: only an account owner imports a price list or sets a markup, for their account. */
async function ownerOrg() {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  const orgId = await priceOrg(auth.user);
  return orgId ? { orgId } : { error: jsonError(403, "forbidden", "רק בעל חשבון יכול לעדכן מחירים") };
}

/**
 * A distributor's price list for a brand (read from the Excel file in the browser):
 * { brandId, source, rows: [{ model, price?, note?, sheet? }], dryRun? }. With dryRun it only
 * reports what would match; otherwise it replaces the account's costs for the brand.
 */
export async function POST(req: Request) {
  const auth = await ownerOrg();
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const source = typeof body?.source === "string" ? body.source.trim().slice(0, 160) : "";
  if (!brandId || !source || !Array.isArray(body?.rows)) return jsonError(400, "bad_request", "בקשה לא תקינה");
  const rows: PriceRow[] = [];
  for (const r of (body.rows as unknown[]).slice(0, 20000)) {
    if (!r || typeof r !== "object") continue;
    const { model, price, note, sheet } = r as Record<string, unknown>;
    if (typeof model !== "string" || !model.trim() || model.length > 120) continue;
    rows.push({
      model,
      price: typeof price === "number" && Number.isFinite(price) && price > 0 && price < 10_000_000 ? price : undefined,
      note: typeof note === "string" ? note.slice(0, 120) : undefined,
      sheet: typeof sheet === "string" ? sheet.slice(0, 60) : undefined,
    });
  }
  return Response.json({ stats: await applyPriceList(auth.orgId, brandId, source, rows, body.dryRun === true) });
}

/** The account's markup on cost for a customer price, per brand: { brandId, markupPct } */
export async function PATCH(req: Request) {
  const auth = await ownerOrg();
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const pct = typeof body?.markupPct === "number" ? body.markupPct : NaN;
  if (!brandId || !(pct >= 0 && pct <= 1000)) return jsonError(400, "bad_request", "אחוז לא תקין");
  await setMarkup(auth.orgId, brandId, Math.round(pct * 10) / 10);
  return Response.json({ ok: true });
}
