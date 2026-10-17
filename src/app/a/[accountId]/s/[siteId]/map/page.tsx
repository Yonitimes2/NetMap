import { Suspense } from "react";
import { SiteScreen } from "@/components/SiteScreen";

export default function MapPage() {
  return (
    <Suspense>
      <SiteScreen />
    </Suspense>
  );
}
