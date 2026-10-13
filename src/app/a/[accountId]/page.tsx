import { Suspense } from "react";
import { AccountScreen } from "@/components/AccountScreen";

export default function AccountPage() {
  return (
    <Suspense>
      <AccountScreen />
    </Suspense>
  );
}
