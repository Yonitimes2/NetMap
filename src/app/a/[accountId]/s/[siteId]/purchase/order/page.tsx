import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderSheet } from "@/components/project/OrderSheet";

export const metadata: Metadata = { title: "דף הזמנה לספק · NetMap" };

export default function OrderPage({ params }: PageProps<"/a/[accountId]/s/[siteId]/purchase/order">) {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-400">טוען…</p>}>
      <OrderSheet params={params} />
    </Suspense>
  );
}
