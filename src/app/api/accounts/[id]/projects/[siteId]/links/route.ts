import { readJson } from "@/lib/auth/current-user";
import { requireProjectOwner } from "@/lib/auth/project-owner";
import { createLink, listLinks } from "@/lib/db/projects";

type Ctx = RouteContext<"/api/accounts/[id]/projects/[siteId]/links">;

/** The links the customer can open the project's page with. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, siteId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  return Response.json({ links: await listLinks(siteId) });
}

/** A new link: { showPrices, days? } */
export async function POST(req: Request, ctx: Ctx) {
  const { id, siteId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  const body = await readJson(req);
  const days = typeof body?.days === "number" && body.days > 0 && body.days <= 365 ? Math.round(body.days) : undefined;
  await createLink(p.user, id, siteId, body?.showPrices === true, days);
  return Response.json({ links: await listLinks(siteId) });
}
