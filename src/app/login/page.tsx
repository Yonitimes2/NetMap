import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";

export const metadata = { title: "כניסה · NetMap" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
