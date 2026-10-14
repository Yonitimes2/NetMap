import { hashPassword, newUser, normEmail, normName, passwordProblem, publicUser, updateUsers, validEmail } from "@/lib/auth/users";
import { jsonError, readJson, startSession } from "@/lib/auth/current-user";

/** Creates the first system admin. Works only while there are no users at all. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normEmail(body?.email);
  const name = normName(body?.name);
  if (!name) return jsonError(400, "bad_request", "צריך שם");
  if (!validEmail(email)) return jsonError(400, "bad_request", "כתובת האימייל לא תקינה");
  const bad = passwordProblem(body?.password);
  if (bad) return jsonError(400, "weak_password", bad);
  const hash = await hashPassword(body!.password as string);

  const user = await updateUsers((users) => {
    if (users.length) return { result: null };
    const u = newUser({ email, name, role: "admin", hash });
    return { users: [u], result: u };
  });
  if (!user) return jsonError(409, "already_set_up", "כבר הוגדר מנהל מערכת. התחברו עם האימייל והסיסמה.");
  await startSession(user);
  return Response.json({ user: publicUser(user) });
}
