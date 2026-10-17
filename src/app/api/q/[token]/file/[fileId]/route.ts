import { jsonError } from "@/lib/auth/current-user";
import { fileInfo, readFileBytes } from "@/lib/db/files";
import { customerDoc, openLink } from "@/lib/db/projects";

/**
 * A floor plan of the linked project, for the customer's page (no sign-in). Only the plans of that
 * project's floors: never equipment photos or another project's files.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/q/[token]/file/[fileId]">) {
  const { token, fileId } = await ctx.params;
  const link = await openLink(token);
  const info = link && (await fileInfo(fileId));
  const doc = info && info.accountId === link.accountId ? (await customerDoc(link.accountId))?.doc : null;
  const isPlan = doc?.floors.some((f) => f.siteId === link!.siteId && f.plan?.src === `file:${fileId}`);
  if (!isPlan) return jsonError(404, "not_found", "הקובץ לא נמצא");
  const bytes = await readFileBytes(fileId).catch(() => null);
  if (!bytes) return jsonError(404, "not_found", "הקובץ לא נמצא");
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": info!.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
  });
}
