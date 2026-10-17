import { jsonError, requireUser } from "@/lib/auth/current-user";
import { roleIn } from "@/lib/db/accounts";
import { fileInfo, readFileBytes } from "@/lib/db/files";

/**
 * An uploaded file, for people with access to its customer; a private one (a receipt) only for the
 * account's owners. Never changes, so browsers keep it.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const info = await fileInfo(id);
  const role = info && (await roleIn(auth.user, info.accountId));
  if (!info || !role || (info.private && role !== "owner")) return jsonError(404, "not_found", "הקובץ לא נמצא");
  const bytes = await readFileBytes(id).catch(() => null);
  if (!bytes) return jsonError(404, "not_found", "הקובץ לא נמצא");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": info.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // an uploaded PDF opens as a document, never as a page of the app
      ...(info.mime === "application/pdf" ? { "Content-Disposition": "inline", "Content-Security-Policy": "sandbox" } : {}),
    },
  });
}
