import { jsonError, readJson } from "@/lib/auth/current-user";
import { requireProjectOwner } from "@/lib/auth/project-owner";
import { getFinance, getQuoteDefaults, saveFinance } from "@/lib/db/projects";
import { cleanFinance } from "@/lib/quote";

type Ctx = RouteContext<"/api/accounts/[id]/projects/[siteId]/finance">;

/** The project's quote settings and the account's defaults for quotes (owners only). */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, siteId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  const { finance, rev, updatedAt } = await getFinance(siteId);
  return Response.json({ finance, rev, updatedAt, defaults: await getQuoteDefaults(p.orgId), orgId: p.orgId });
}

/** Save the project's quote settings: { finance } */
export async function PUT(req: Request, ctx: Ctx) {
  const { id, siteId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  const body = await readJson(req);
  if (!body?.finance) return jsonError(400, "bad_request", "בקשה לא תקינה");
  const finance = cleanFinance(body.finance);
  return Response.json({ finance, ...(await saveFinance(p.user, id, siteId, finance)) });
}
