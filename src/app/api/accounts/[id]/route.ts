import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { docProblem, validId, type AccountDoc } from "@/lib/account-doc";
import { accountExists, roleIn, saveDoc } from "@/lib/db/accounts";

/** Save an account's data (creates the account when a system admin saves a new one). */
export async function PUT(req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "bad_request", "מזהה לא תקין");
  const role = await roleIn(auth.user, id);
  if (!role) return jsonError(403, "forbidden", "אין לך גישה לעסק הזה");
  if (role !== "super" && !(await accountExists(id))) return jsonError(403, "forbidden", "רק מנהל מערכת יכול לפתוח עסק חדש");

  const body = await readJson(req);
  const doc = body?.doc as AccountDoc | undefined;
  const problem = docProblem(id, doc);
  if (problem) return jsonError(400, "bad_doc", problem);
  const baseRev = typeof body?.baseRev === "number" ? body.baseRev : 0;
  return Response.json(await saveDoc(auth.user, id, baseRev, doc!));
}
