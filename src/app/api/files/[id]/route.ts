import { jsonError, requireUser } from "@/lib/auth/current-user";
import { roleIn } from "@/lib/db/accounts";
import { fileInfo, readFileBytes } from "@/lib/db/files";

/** An uploaded image, for people with access to its account. Never changes, so browsers keep it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const info = await fileInfo(id);
  if (!info || !(await roleIn(auth.user, info.accountId))) return jsonError(404, "not_found", "הקובץ לא נמצא");
  const bytes = await readFileBytes(id).catch(() => null);
  if (!bytes) return jsonError(404, "not_found", "הקובץ לא נמצא");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": info.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
