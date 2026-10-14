import { burnPasswordCheck, findUserByEmail, normEmail, publicUser, verifyPassword } from "@/lib/auth/users";
import { clearFails, clientIp, jsonError, readJson, recordFail, startSession, throttled } from "@/lib/auth/current-user";

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return jsonError(400, "bad_request", "צריך אימייל וסיסמה");

  const keys = [`ip:${clientIp(req)}`, `email:${email}`];
  const wait = throttled(keys);
  if (wait) return jsonError(429, "throttled", `יותר מדי ניסיונות כושלים. נסו שוב בעוד ${wait} דקות.`);

  const user = await findUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.hash) : (await burnPasswordCheck(password), false);
  if (!user || !ok) {
    recordFail(keys);
    return jsonError(401, "bad_credentials", "האימייל או הסיסמה שגויים");
  }
  clearFails(keys);
  await startSession(user);
  return Response.json({ user: publicUser(user) });
}
