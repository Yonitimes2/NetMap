import { hashPassword, normEmail, normName, passwordProblem, publicUser, readUsers, updateUsers, validEmail, verifyPassword, type AuthUser } from "@/lib/auth/users";
import { clearFails, currentUser, jsonError, readJson, recordFail, requireUser, startSession, throttled } from "@/lib/auth/current-user";

/** The signed-in user, or 401 with `setup: true` when no user exists yet (first-run screen). */
export async function GET() {
  const user = await currentUser();
  if (user) return Response.json({ user: publicUser(user) });
  const setup = (await readUsers()).length === 0;
  return Response.json({ error: { code: "unauthorized", message: "לא מחובר" }, setup }, { status: 401 });
}

/**
 * Change my name, email or password. Email and password changes need the current password.
 * A new password signs out every other session of this user.
 */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError(400, "bad_request", "בקשה לא תקינה");

  const name = body.name !== undefined ? normName(body.name) : undefined;
  const email = body.email !== undefined ? normEmail(body.email) : undefined;
  const newPassword = body.newPassword !== undefined ? body.newPassword : undefined;
  if (name !== undefined && !name) return jsonError(400, "bad_request", "צריך שם");
  if (email !== undefined && !validEmail(email)) return jsonError(400, "bad_request", "כתובת האימייל לא תקינה");
  if (newPassword !== undefined) {
    const bad = passwordProblem(newPassword);
    if (bad) return jsonError(400, "weak_password", bad);
  }

  const sensitive = (email !== undefined && email !== auth.user.email) || newPassword !== undefined;
  if (sensitive) {
    const keys = [`pw:${auth.user.id}`];
    const wait = throttled(keys);
    if (wait) return jsonError(429, "throttled", `יותר מדי ניסיונות כושלים. נסו שוב בעוד ${wait} דקות.`);
    const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!current || !(await verifyPassword(current, auth.user.hash))) {
      recordFail(keys);
      return jsonError(403, "bad_password", "הסיסמה הנוכחית שגויה");
    }
    clearFails(keys);
  }
  const hash = typeof newPassword === "string" ? await hashPassword(newPassword) : undefined;

  const res = await updateUsers<{ error: Response } | { user: AuthUser }>((users) => {
    const me = users.find((u) => u.id === auth.user.id);
    if (!me) return { result: { error: jsonError(401, "unauthorized", "צריך להתחבר מחדש") } };
    if (email !== undefined && users.some((u) => u.email === email && u.id !== me.id)) {
      return { result: { error: jsonError(409, "email_taken", "האימייל הזה כבר שייך למשתמש אחר") } };
    }
    const next = {
      ...me,
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(hash && { hash, sessionVersion: me.sessionVersion + 1 }),
      updatedAt: new Date().toISOString(),
    };
    return { users: users.map((u) => (u.id === me.id ? next : u)), result: { user: next } };
  });
  if ("error" in res) return res.error;
  // keep this browser signed in after a password change
  if (hash) await startSession(res.user);
  return Response.json({ user: publicUser(res.user) });
}
