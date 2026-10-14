import { adminCount, hashPassword, isRole, normEmail, normName, passwordProblem, publicUser, updateUsers, validEmail, type AuthUser } from "@/lib/auth/users";
import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";

/** Change a user's name, email or role, or set a new password for them (signs them out everywhere). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return jsonError(400, "bad_request", "בקשה לא תקינה");

  const name = body.name !== undefined ? normName(body.name) : undefined;
  const email = body.email !== undefined ? normEmail(body.email) : undefined;
  const role = body.role;
  if (name !== undefined && !name) return jsonError(400, "bad_request", "צריך שם");
  if (email !== undefined && !validEmail(email)) return jsonError(400, "bad_request", "כתובת האימייל לא תקינה");
  if (role !== undefined && !isRole(role)) return jsonError(400, "bad_request", "תפקיד לא מוכר");
  if (body.password !== undefined) {
    const bad = passwordProblem(body.password);
    if (bad) return jsonError(400, "weak_password", bad);
  }
  const hash = typeof body.password === "string" ? await hashPassword(body.password) : undefined;

  const res = await updateUsers<{ error: Response } | { user: AuthUser }>((users) => {
    const target = users.find((u) => u.id === id);
    if (!target) return { result: { error: jsonError(404, "not_found", "המשתמש לא נמצא") } };
    if (email !== undefined && users.some((u) => u.email === email && u.id !== id)) {
      return { result: { error: jsonError(409, "email_taken", "כבר יש משתמש עם האימייל הזה") } };
    }
    if (role === "member" && target.role === "admin" && adminCount(users) === 1) {
      return { result: { error: jsonError(409, "last_admin", "חייב להישאר לפחות מנהל מערכת אחד") } };
    }
    const next = {
      ...target,
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(isRole(role) && { role }),
      ...(hash && { hash, sessionVersion: target.sessionVersion + 1 }),
      updatedAt: new Date().toISOString(),
    };
    return { users: users.map((u) => (u.id === id ? next : u)), result: { user: next } };
  });
  if ("error" in res) return res.error;
  return Response.json({ user: publicUser(res.user) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (id === auth.user.id) return jsonError(409, "self", "אי אפשר למחוק את המשתמש שאיתו אתם מחוברים");

  const error = await updateUsers<Response | null>((users) => {
    const target = users.find((u) => u.id === id);
    if (!target) return { result: jsonError(404, "not_found", "המשתמש לא נמצא") };
    if (target.role === "admin" && adminCount(users) === 1) {
      return { result: jsonError(409, "last_admin", "חייב להישאר לפחות מנהל מערכת אחד") };
    }
    return { users: users.filter((u) => u.id !== id), result: null };
  });
  return error ?? Response.json({ ok: true });
}
