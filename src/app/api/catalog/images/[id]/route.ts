import { jsonError, requireUser } from "@/lib/auth/current-user";
import { catalogImage } from "@/lib/products/store";

/** A product image from the catalog. Never changes, so browsers keep it. */
/** ?w=160|320|800 returns a smaller copy. */
export async function GET(req: Request, ctx: RouteContext<"/api/catalog/images/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const w = Number(new URL(req.url).searchParams.get("w")) || undefined;
  const img = await catalogImage((await ctx.params).id, w);
  if (!img) return jsonError(404, "not_found", "התמונה לא נמצאה");
  return new Response(new Uint8Array(img.bytes), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
