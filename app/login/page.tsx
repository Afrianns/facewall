import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { getCurrentUser } from "@/utils/supabase/auth";

async function LoginPageContent() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
          Checking your account…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
