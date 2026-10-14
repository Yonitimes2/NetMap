import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { hashPassword, newUser, normEmail, normName, passwordProblem, updateUsers, validEmail } from "@/lib/auth/users";
import { accountExists, canManageUsers, listMembers, roleIn, setMember } from "@/lib/db/accounts";

const isAccountRole = (v: unknown): v is "admin" | "technician" => v === "admin" || v === "technician";

export async function GET(_req: Request, ctx: RouteContext<"/api/accounts/[id]/members">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageUsers(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך הרשאה לנהל את המשתמשים של העסק הזה");
  return Response.json({ members: await listMembers(id) });
}

/**
 * Give someone access to the account. Someone who has no login yet gets one, with the first
 * password the admin typed; nothing is emailed to them.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/accounts/[id]/members">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageUsers(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך הרשאה לנהל את המשתמשים של העסק הזה");
  if (!(await accountExists(id))) return jsonError(409, "not_saved", "העסק עדיין לא נשמר בשרת. נסו שוב בעוד רגע.");

  const body = await readJson(req);
  const email = normEmail(body?.email);
  const name = normName(body?.name);
  const role = body?.role;
  if (!validEmail(email)) return jsonError(400, "bad_request", "כתובת האימייל לא תקינה");
  if (!isAccountRole(role)) return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const password = typeof body?.password === "string" && body.password ? body.password : undefined;
  const bad = password ? passwordProblem(password) : null;
  if (bad) return jsonError(400, "weak_password", bad);
  const hash = password ? await hashPassword(password) : undefined;

  const res = await updateUsers<{ userId: string } | { error: Response }>((users) => {
    const existing = users.find((u) => u.email === email);
    if (existing) return { result: { userId: existing.id } };
    if (!name) return { result: { error: jsonError(400, "need_name", "למשתמש הזה עדיין אין כניסה למערכת. צריך שם וסיסמה ראשונה.") } };
    if (!hash) return { result: { error: jsonError(400, "need_password", "למשתמש הזה עדיין אין כניסה למערכת. צריך לקבוע לו סיסמה ראשונה.") } };
    const u = newUser({ email, name, role: "member", hash });
    return { users: [...users, u], result: { userId: u.id } };
  });
  if ("error" in res) return res.error;
  await setMember(id, res.userId, role);
  return Response.json({ members: await listMembers(id) });
}
