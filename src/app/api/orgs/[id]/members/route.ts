import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { userToAdd } from "@/lib/auth/add-user";
import { canManageOrg, listOrgMembers, orgRole, setOrgMember } from "@/lib/db/orgs";

/**
 * Give someone a role in the account: owner or technician. Someone who has no login yet gets one,
 * with the first password the owner typed; nothing is emailed to them.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/orgs/[id]/members">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageOrg(await orgRole(auth.user, id))) return jsonError(403, "forbidden", "רק בעל החשבון יכול לנהל את המשתמשים שלו");
  const body = await readJson(req);
  const role = body?.role;
  if (role !== "owner" && role !== "technician") return jsonError(400, "bad_request", "תפקיד לא מוכר");
  const res = await userToAdd(body);
  if ("error" in res) return res.error;
  await setOrgMember(id, res.userId, role);
  return Response.json({ members: await listOrgMembers(id) });
}
