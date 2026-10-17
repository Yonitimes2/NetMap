import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { docProblem, validId, type AccountDoc } from "@/lib/account-doc";
import { accountExists, roleIn, saveDoc } from "@/lib/db/accounts";
import { orgRole } from "@/lib/db/orgs";

/**
 * Save a customer's data. A new customer is created in the account its doc names, by someone who
 * works in that account (or a system admin).
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "bad_request", "מזהה לא תקין");

  const body = await readJson(req);
  const doc = body?.doc as AccountDoc | undefined;
  const problem = docProblem(id, doc);
  if (problem) return jsonError(400, "bad_doc", problem);
  if (await accountExists(id)) {
    if (!(await roleIn(auth.user, id))) return jsonError(403, "forbidden", "אין לך גישה ללקוח הזה");
  } else {
    const orgId = doc!.account.orgId;
    if (!orgId || !(await orgRole(auth.user, orgId))) return jsonError(403, "forbidden", "אפשר לפתוח לקוח רק בחשבון שאתה עובד בו");
  }
  const baseRev = typeof body?.baseRev === "number" ? body.baseRev : 0;
  return Response.json(await saveDoc(auth.user, id, baseRev, doc!));
}
