import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { loadDocs, visibleAccounts } from "@/lib/db/accounts";
import { listOrgsFor } from "@/lib/db/orgs";

/**
 * The browser sends the revision it has of each customer; the answer lists the accounts the user
 * works in, every customer they can see (with their role), the full data of customers that are new
 * or changed, and the ids the browser has but may no longer see.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const known = (body?.known ?? {}) as Record<string, unknown>;
  if (typeof known !== "object" || Array.isArray(known)) return jsonError(400, "bad_request", "בקשה לא תקינה");

  const accounts = await visibleAccounts(auth.user);
  const changed = accounts.filter((a) => known[a.id] !== a.rev).map((a) => a.id);
  const visible = new Set(accounts.map((a) => a.id));
  return Response.json({
    orgs: await listOrgsFor(auth.user),
    accounts,
    docs: await loadDocs(changed),
    removed: Object.keys(known).filter((id) => !visible.has(id)),
  });
}
