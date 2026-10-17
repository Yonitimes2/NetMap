import { Suspense } from "react";
import { QuoteScreen } from "@/components/project/QuoteScreen";

export default function QuotePage() {
  return (
    <Suspense>
      <QuoteScreen />
    </Suspense>
  );
}
