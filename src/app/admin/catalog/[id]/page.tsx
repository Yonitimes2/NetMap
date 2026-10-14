import { Suspense } from "react";
import { ProductScreen } from "@/components/catalog/ProductScreen";

export const metadata = { title: "מוצר · מאגר מוצרים · NetMap" };

export default function CatalogProductPage() {
  return (
    <Suspense>
      <ProductScreen />
    </Suspense>
  );
}
