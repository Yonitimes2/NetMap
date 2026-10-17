import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { userToAdd } from "@/lib/auth/add-user";
import { createOrg, listAllOrgs, setOrgMember } from "@/lib/db/orgs";

/** System admins: every account on the platform. */
export async function GET() {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  return Response.json({ orgs: await listAllOrgs() });
}

/** System admins open an account for an installer: { name, owner: { email, name?, password? } }. Nothing is emailed. */
export async function POST(req: Request) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return jsonError(400, "bad_request", "צריך שם עסק");
  const owner = body?.owner && typeof body.owner === "object" ? (body.owner as Record<string, unknown>) : null;
  const res = await userToAdd(owner);
  if ("error" in res) return res.error;
  const id = await createOrg(name);
  await setOrgMember(id, res.userId, "owner");
  return Response.json({ id, orgs: await listAllOrgs() });
}
