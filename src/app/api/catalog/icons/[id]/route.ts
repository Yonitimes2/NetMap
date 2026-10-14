import { jsonError, requireUser } from "@/lib/auth/current-user";
import { catalogIcon } from "@/lib/products/store";

/** One of a manufacturer's box icons. Never changes, so browsers keep it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/catalog/icons/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const icon = await catalogIcon((await ctx.params).id);
  if (!icon) return jsonError(404, "not_found", "האייקון לא נמצא");
  return new Response(new Uint8Array(icon.bytes), {
    headers: { "Content-Type": icon.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
