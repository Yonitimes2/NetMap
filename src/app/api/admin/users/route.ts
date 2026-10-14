import { hashPassword, newUser, normEmail, normName, passwordProblem, publicUser, readUsers, updateUsers, validEmail, isRole } from "@/lib/auth/users";
import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";

export async function GET() {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const users = await readUsers();
  return Response.json({ users: users.map(publicUser) });
}

/** Add a user with a first password that the admin gives them. */
export async function POST(req: Request) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const email = normEmail(body?.email);
  const name = normName(body?.name);
  const role = body?.role ?? "member";
  if (!name) return jsonError(400, "bad_request", "צריך שם");
  if (!validEmail(email)) return jsonError(400, "bad_request", "כתובת האימייל לא תקינה");
  if (!isRole(role)) return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const bad = passwordProblem(body?.password);
  if (bad) return jsonError(400, "weak_password", bad);
  const hash = await hashPassword(body!.password as string);

  const user = await updateUsers((users) => {
    if (users.some((u) => u.email === email)) return { result: null };
    const u = newUser({ email, name, role, hash });
    return { users: [...users, u], result: u };
  });
  if (!user) return jsonError(409, "email_taken", "כבר יש משתמש עם האימייל הזה");
  return Response.json({ user: publicUser(user) });
}
