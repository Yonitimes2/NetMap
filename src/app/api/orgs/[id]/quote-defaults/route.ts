import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { orgRole } from "@/lib/db/orgs";
import { getQuoteDefaults, setQuoteDefaults } from "@/lib/db/projects";
import { cleanDefaults } from "@/lib/quote";

/** The account's starting points for new quotes (owners only): { defaults } */
export async function PUT(req: Request, ctx: RouteContext<"/api/orgs/[id]/quote-defaults">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if ((await orgRole(auth.user, id)) !== "owner") return jsonError(403, "forbidden", "רק בעלי החשבון קובעים מחירים");
  const body = await readJson(req);
  if (!body?.defaults) return jsonError(400, "bad_request", "בקשה לא תקינה");
  await setQuoteDefaults(id, cleanDefaults(body.defaults));
  return Response.json({ defaults: await getQuoteDefaults(id) });
}
