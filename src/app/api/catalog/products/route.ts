import { requireUser } from "@/lib/auth/current-user";
import { listProducts } from "@/lib/products/store";
import { withoutPrices } from "@/lib/products/pricing";

/** Catalog products (any signed-in user: the map uses them; prices only for the account holder). ?category=&q=&brand=&all=1 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const q = new URL(req.url).searchParams;
  const products = await listProducts({
    brandId: q.get("brand") ?? undefined,
    category: q.get("category") ?? undefined,
    q: q.get("q")?.trim() || undefined,
    includeInactive: q.get("all") === "1" && auth.user.role === "admin",
  });
  return Response.json({ products: auth.user.role === "admin" ? products : products.map(withoutPrices) });
}
