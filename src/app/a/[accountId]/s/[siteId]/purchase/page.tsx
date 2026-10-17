import { Suspense } from "react";
import { PurchaseScreen } from "@/components/project/PurchaseScreen";

export default function PurchasePage() {
  return (
    <Suspense>
      <PurchaseScreen />
    </Suspense>
  );
}
