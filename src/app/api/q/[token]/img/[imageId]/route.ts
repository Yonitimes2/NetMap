import { jsonError } from "@/lib/auth/current-user";
import { openLink } from "@/lib/db/projects";
import { catalogImage } from "@/lib/products/store";

/** A catalog product's picture, for the customer's page (no sign-in), while its link works. ?w=160|320|800 */
export async function GET(req: Request, ctx: RouteContext<"/api/q/[token]/img/[imageId]">) {
  const { token, imageId } = await ctx.params;
  if (!(await openLink(token))) return jsonError(404, "not_found", "התמונה לא נמצאה");
  const w = Number(new URL(req.url).searchParams.get("w")) || undefined;
  const img = await catalogImage(imageId, w);
  if (!img) return jsonError(404, "not_found", "התמונה לא נמצאה");
  return new Response(new Uint8Array(img.bytes), {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
