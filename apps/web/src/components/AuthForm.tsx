"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, notifyAuthChange } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const register = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/auth/${register ? "register" : "login"}`, { email, password });
      notifyAuthChange();
      toast.success(register ? "Account created — welcome!" : "Welcome back.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>{register ? "Create your account" : "Log in"}</CardTitle>
          <CardDescription>
            {register ? "Sign up to build your first prep kit." : "Log in to see your kits."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "…" : register ? "Sign up" : "Log in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {register ? (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Log in
                  </Link>
                </>
              ) : (
                <>
                  New here?{" "}
                  <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
                    Create an account
                  </Link>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
