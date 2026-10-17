import { jsonError } from "@/lib/auth/current-user";
import { requireProjectOwner } from "@/lib/auth/project-owner";
import { MAX_FILE_BYTES, RECEIPT_TYPES, saveFile } from "@/lib/db/files";

/**
 * A supplier's receipt for the project (a picture or a PDF, the file itself as the body), kept
 * privately: only the account's owners open it. Returns its file id; the receipt's details go in
 * the project's purchasing.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/accounts/[id]/projects/[siteId]/receipts">) {
  const { id, siteId } = await ctx.params;
  const p = await requireProjectOwner(id, siteId);
  if ("error" in p) return p.error;
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!RECEIPT_TYPES.includes(mime)) return jsonError(415, "bad_type", "אפשר להעלות תמונה או PDF");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) return jsonError(413, "too_big", "הקובץ גדול מדי (עד 15MB)");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return jsonError(413, "too_big", "הקובץ ריק או גדול מדי");
  // a PDF is what it says it is
  if (mime === "application/pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return jsonError(415, "bad_type", "הקובץ לא נראה כמו PDF");
  return Response.json({ fileId: await saveFile(id, p.user.id, mime, bytes, { private: true }), mime });
}
