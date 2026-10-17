import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { userToAdd } from "@/lib/auth/add-user";
import { accountExists, canManageUsers, listMembers, roleIn, setMember } from "@/lib/db/accounts";

const isAccountRole = (v: unknown): v is "admin" | "technician" => v === "admin" || v === "technician";

export async function GET(_req: Request, ctx: RouteContext<"/api/accounts/[id]/members">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageUsers(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך הרשאה לנהל את המשתמשים של הלקוח הזה");
  return Response.json({ members: await listMembers(id) });
}

/**
 * Give someone access to just this customer: its business owner, or a technician. Someone who has no
 * login yet gets one, with the first password the admin typed; nothing is emailed to them.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/accounts/[id]/members">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageUsers(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך הרשאה לנהל את המשתמשים של הלקוח הזה");
  if (!(await accountExists(id))) return jsonError(409, "not_saved", "הלקוח עדיין לא נשמר בשרת. נסו שוב בעוד רגע.");

  const body = await readJson(req);
  const role = body?.role;
  if (!isAccountRole(role)) return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const res = await userToAdd(body);
  if ("error" in res) return res.error;
  await setMember(id, res.userId, role);
  return Response.json({ members: await listMembers(id) });
}
