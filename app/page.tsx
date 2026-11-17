import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import WallFeed from "@/components/wall-feed";
import { getCurrentUser } from "@/utils/supabase/auth";

async function AuthenticatedFeed() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const metadataName = user.user_metadata?.full_name;
  const profileName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "Member";

  return (
    <WallFeed
      authId={user.id}
      email={user.email ?? null}
      initialName={profileName}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
          Checking your account…
        </div>
      }
    >
      <AuthenticatedFeed />
    </Suspense>
  );
}
