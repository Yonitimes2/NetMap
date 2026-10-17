import { jsonError } from "./current-user";
import { hashPassword, newUser, normEmail, normName, passwordProblem, updateUsers, validEmail } from "./users";

/**
 * The person an admin is giving access to, by email: their existing login, or a new one with the
 * first password the admin typed ({ email, name, password }). Nothing is emailed to them.
 */
export async function userToAdd(body: Record<string, unknown> | null): Promise<{ userId: string } | { error: Response }> {
  const email = normEmail(body?.email);
  const name = normName(body?.name);
  if (!validEmail(email)) return { error: jsonError(400, "bad_request", "כתובת האימייל לא תקינה") };
  const password = typeof body?.password === "string" && body.password ? body.password : undefined;
  const bad = password ? passwordProblem(password) : null;
  if (bad) return { error: jsonError(400, "weak_password", bad) };
  const hash = password ? await hashPassword(password) : undefined;

  return updateUsers<{ userId: string } | { error: Response }>((users) => {
    const existing = users.find((u) => u.email === email);
    if (existing) return { result: { userId: existing.id } };
    if (!name) return { result: { error: jsonError(400, "need_name", "למשתמש הזה עדיין אין כניסה למערכת. צריך שם וסיסמה ראשונה.") } };
    if (!hash) return { result: { error: jsonError(400, "need_password", "למשתמש הזה עדיין אין כניסה למערכת. צריך לקבוע לו סיסמה ראשונה.") } };
    const u = newUser({ email, name, role: "member", hash });
    return { users: [...users, u], result: { userId: u.id } };
  });
}
