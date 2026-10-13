import { Suspense } from "react";
import { SiteScreen } from "@/components/SiteScreen";

export default function SitePage() {
  return (
    <Suspense>
      <SiteScreen />
    </Suspense>
  );
}
