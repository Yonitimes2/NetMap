import { Suspense } from "react";
import { OrgScreen } from "@/components/OrgScreen";

export const metadata = { title: "הגדרות החשבון · NetMap" };

export default function OrgPage() {
  return (
    <Suspense>
      <OrgScreen />
    </Suspense>
  );
}
