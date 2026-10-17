import { requireProjectOwner } from "@/lib/auth/project-owner";
import { listLinks, revokeLink } from "@/lib/db/projects";

/** Stop a link from working, at once and for good. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/accounts/[id]/projects/[siteId]/links/[linkId]">) {
  const { id, siteId, linkId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  await revokeLink(siteId, linkId);
  return Response.json({ links: await listLinks(siteId) });
}
