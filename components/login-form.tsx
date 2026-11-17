"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";

type AuthMode = "login" | "register";

export default function LoginForm() {
  const [supabase] = useState(createSupabaseClient);
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthSubmitting(true);
    let shouldNavigate = false;

    try {
      if (authMode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: { full_name: authName.trim() },
          },
        });

        if (error) {
          setAuthError(error.message);
        } else if (data.session) {
          shouldNavigate = true;
        } else {
          setAuthMode("login");
          setAuthNotice("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

        if (error) {
          setAuthError(error.message);
        } else {
          shouldNavigate = true;
        }
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Unable to authenticate right now.",
      );
    } finally {
      setAuthSubmitting(false);
    }

    if (shouldNavigate) router.replace("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-[420px]">
        <Link
          className="mb-6 flex justify-center items-center gap-2 text-2xl font-extrabold tracking-[-1.4px]"
          href="/"
          aria-label="Wall home"
        >
          <span>
            Facewall<span className="text-primary">.</span>
          </span>
        </Link>

        <Card className="gap-5 rounded-2xl border border-border p-5 ring-0 sm:p-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold">
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {authMode === "login"
                ? "Sign in to continue to your feed."
                : "Register to join the conversation."}
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
            {(["login", "register"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  authMode === mode
                    ? "bg-white text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={authMode === mode}
                onClick={() => {
                  setAuthMode(mode);
                  setAuthError("");
                  setAuthNotice("");
                }}
              >
                {mode === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <form className="grid gap-3" onSubmit={submitAuth}>
            {authMode === "register" && (
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <input
                  autoComplete="name"
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  name="name"
                  required
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                />
              </label>
            )}
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                name="email"
                type="email"
                required
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Password
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                name="password"
                type="password"
                required
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </label>
            {authError && (
              <p className="text-sm text-destructive" role="alert">
                {authError}
              </p>
            )}
            {authNotice && (
              <p className="text-sm text-muted-foreground" role="status">
                {authNotice}
              </p>
            )}
            <Button type="submit" disabled={authSubmitting}>
              {authSubmitting
                ? "Please wait…"
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
