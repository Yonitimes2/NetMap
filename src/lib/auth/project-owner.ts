import { jsonError, requireUser } from "./current-user";
import { roleIn } from "../db/accounts";
import { projectOf } from "../db/projects";

/** For a project's money routes: the signed-in owner of the account the customer is in, and the project. */
export async function requireProjectOwner(accountId: string, siteId: string) {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  if ((await roleIn(auth.user, accountId)) !== "owner") return { error: jsonError(403, "forbidden", "רק בעלי החשבון רואים מחירים ושולחים הצעות") };
  const project = await projectOf(accountId, siteId);
  if (!project) return { error: jsonError(404, "not_found", "הפרויקט לא נמצא. אם הוא חדש, הוא עוד נשמר בשרת: נסו שוב בעוד רגע.") };
  return { user: auth.user, ...project };
}
