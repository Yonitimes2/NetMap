import { jsonError, readJson, requireUser } from "@/lib/auth/current-user";
import { getProduct, updateProduct } from "@/lib/products/store";
import { CATEGORY_LABEL, type CatalogCategory } from "@/lib/products/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/catalog/products/[id]">) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const product = await getProduct((await ctx.params).id);
  return product ? Response.json({ product }) : jsonError(404, "not_found", "המוצר לא נמצא");
}

/** System admins correct a product: parameter values (null = back to the source), equipment type, category, status. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/catalog/products/[id]">) {
  const auth = await requireUser({ admin: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError(400, "bad_request", "בקשה לא תקינה");
  const overrides = body.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides) ? (body.overrides as Record<string, unknown>) : undefined;
  const category = typeof body.category === "string" && body.category in CATEGORY_LABEL ? (body.category as CatalogCategory) : undefined;
  const status = body.status === "active" || body.status === "discontinued" || body.status === "review" ? body.status : undefined;
  const deviceType = typeof body.deviceType === "string" && /^[a-z-]{2,20}$/.test(body.deviceType) ? body.deviceType : undefined;
  const product = await updateProduct((await ctx.params).id, { overrides, category, status, deviceType });
  return product ? Response.json({ product }) : jsonError(404, "not_found", "המוצר לא נמצא");
}
