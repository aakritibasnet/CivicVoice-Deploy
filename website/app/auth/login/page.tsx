import { Suspense } from "react";
import LoginForm from "@/src/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
