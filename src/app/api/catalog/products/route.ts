import { requireUser } from "@/lib/auth/current-user";
import { listProducts } from "@/lib/products/store";
import { withoutPrices } from "@/lib/products/pricing";
import { priceOrg } from "@/lib/db/orgs";

/** Catalog products (any signed-in user: the map uses them; prices only for an account owner, their own). ?category=&q=&brand=&all=1 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const q = new URL(req.url).searchParams;
  const orgId = await priceOrg(auth.user);
  const products = await listProducts(
    {
    brandId: q.get("brand") ?? undefined,
    category: q.get("category") ?? undefined,
    q: q.get("q")?.trim() || undefined,
      includeInactive: q.get("all") === "1" && auth.user.role === "admin",
    },
    orgId,
  );
  return Response.json({ products: orgId ? products : products.map(withoutPrices) });
}
