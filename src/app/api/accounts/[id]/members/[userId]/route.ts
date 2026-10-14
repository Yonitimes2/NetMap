import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { canManageUsers, listMembers, removeMember, roleIn, setMember } from "@/lib/db/accounts";

type Ctx = RouteContext<"/api/accounts/[id]/members/[userId]">;

/**
 * Checks shared by both handlers. A business admin can't take away the last admin role in their
 * own business (they'd lock themselves out); system admins can.
 */
async function guard(ctx: Ctx, leavesAdmin: (members: Awaited<ReturnType<typeof listMembers>>) => boolean) {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error };
  const { id, userId } = await ctx.params;
  const role = await roleIn(auth.user, id);
  if (!canManageUsers(role)) return { error: jsonError(403, "forbidden", "אין לך הרשאה לנהל את המשתמשים של העסק הזה") };
  const members = await listMembers(id);
  if (!members.some((m) => m.userId === userId)) return { error: jsonError(404, "not_found", "המשתמש לא נמצא בעסק") };
  if (role !== "super" && !leavesAdmin(members)) return { error: jsonError(409, "last_admin", "חייב להישאר לפחות מנהל אחד בעסק") };
  return { id, userId };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const body = await readJson(req);
  const role = body?.role;
  if (role !== "admin" && role !== "technician") return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const { userId: target } = await ctx.params;
  const g = await guard(ctx, (ms) => role === "admin" || ms.some((m) => m.role === "admin" && m.userId !== target));
  if ("error" in g) return g.error;
  await setMember(g.id, g.userId, role);
  return Response.json({ members: await listMembers(g.id) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { userId: target } = await ctx.params;
  const g = await guard(ctx, (ms) => ms.some((m) => m.role === "admin" && m.userId !== target));
  if ("error" in g) return g.error;
  await removeMember(g.id, g.userId);
  return Response.json({ members: await listMembers(g.id) });
}
