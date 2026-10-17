import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { canManageOrg, listOrgMembers, orgRole, removeOrgMember, setOrgMember, type OrgMember } from "@/lib/db/orgs";

type Ctx = RouteContext<"/api/orgs/[id]/members/[userId]">;

/** Checks shared by both handlers. An account always keeps an owner, unless a system admin says otherwise. */
async function guard(ctx: Ctx, leavesOwner: (members: OrgMember[]) => boolean) {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error };
  const { id, userId } = await ctx.params;
  const role = await orgRole(auth.user, id);
  if (!canManageOrg(role)) return { error: jsonError(403, "forbidden", "רק בעל החשבון יכול לנהל את המשתמשים שלו") };
  const members = await listOrgMembers(id);
  if (!members.some((m) => m.userId === userId)) return { error: jsonError(404, "not_found", "המשתמש לא נמצא בחשבון") };
  if (role !== "super" && !leavesOwner(members)) return { error: jsonError(409, "last_owner", "חייב להישאר לפחות בעלים אחד בחשבון") };
  return { id, userId };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const body = await readJson(req);
  const role = body?.role;
  if (role !== "owner" && role !== "technician") return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const { userId: target } = await ctx.params;
  const g = await guard(ctx, (ms) => role === "owner" || ms.some((m) => m.role === "owner" && m.userId !== target));
  if ("error" in g) return g.error;
  await setOrgMember(g.id, g.userId, role);
  return Response.json({ members: await listOrgMembers(g.id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { userId: target } = await ctx.params;
  const g = await guard(ctx, (ms) => ms.some((m) => m.role === "owner" && m.userId !== target));
  if ("error" in g) return g.error;
  await removeOrgMember(g.id, g.userId);
  return Response.json({ members: await listOrgMembers(g.id) });
}
