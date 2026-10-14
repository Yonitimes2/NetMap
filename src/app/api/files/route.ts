import { jsonError, requireUser } from "@/lib/auth/current-user";
import { accountExists, roleIn } from "@/lib/db/accounts";
import { IMAGE_TYPES, MAX_FILE_BYTES, saveFile } from "@/lib/db/files";

/** Upload an image for an account: POST /api/files?account=<id>, the image itself as the body. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const accountId = new URL(req.url).searchParams.get("account") ?? "";
  if (!(await roleIn(auth.user, accountId)) || !(await accountExists(accountId))) return jsonError(403, "forbidden", "אין לך גישה לעסק הזה");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!IMAGE_TYPES.includes(mime)) return jsonError(415, "bad_type", "אפשר להעלות רק תמונות");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) return jsonError(413, "too_big", "התמונה גדולה מדי");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return jsonError(413, "too_big", "התמונה ריקה או גדולה מדי");
  return Response.json({ id: await saveFile(accountId, auth.user.id, mime, bytes) });
}
