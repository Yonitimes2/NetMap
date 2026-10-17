import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { canManageOrg, getOrg, listOrgMembers, orgRole, renameOrg } from "@/lib/db/orgs";

/** The account's details, and its people for those who manage it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/orgs/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const role = await orgRole(auth.user, id);
  const org = role && (await getOrg(id));
  if (!org) return jsonError(404, "not_found", "החשבון לא נמצא");
  return Response.json({ org: { ...org, role }, members: canManageOrg(role) ? await listOrgMembers(id) : null });
}

/** Rename the account: { name } */
export async function PATCH(req: Request, ctx: RouteContext<"/api/orgs/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!canManageOrg(await orgRole(auth.user, id))) return jsonError(403, "forbidden", "רק בעל החשבון יכול לשנות את פרטיו");
  const body = await readJson(req);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return jsonError(400, "bad_request", "צריך שם עסק");
  await renameOrg(id, name);
  return Response.json({ org: await getOrg(id) });
}
