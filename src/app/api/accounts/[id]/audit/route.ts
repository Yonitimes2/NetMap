import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { accountExists, addAudit, canManageUsers, listAudit, roleIn } from "@/lib/db/accounts";

/** Who viewed or copied equipment passwords. Readable by the account's admins. */
export async function GET(_req: Request, ctx: RouteContext<"/api/accounts/[id]/audit">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageUsers(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך הרשאה ליומן של העסק הזה");
  return Response.json({ entries: await listAudit(id) });
}

/** Logged by the browser when someone reveals or copies a password. */
export async function POST(req: Request, ctx: RouteContext<"/api/accounts/[id]/audit">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!(await roleIn(auth.user, id)) || !(await accountExists(id))) return jsonError(403, "forbidden", "אין לך גישה לעסק הזה");
  const body = await readJson(req);
  if (typeof body?.action !== "string" || !body.action.trim()) return jsonError(400, "bad_request", "בקשה לא תקינה");
  await addAudit(id, auth.user, body.action, typeof body.target === "string" ? body.target : undefined);
  return Response.json({ ok: true });
}
