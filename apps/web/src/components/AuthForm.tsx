"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

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
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="text-2xl font-semibold">{register ? "Create your account" : "Log in"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "…" : register ? "Sign up" : "Log in"}
        </button>
        <p className="text-sm text-slate-500">
          {register ? (
            <>
              Already have an account? <Link href="/login" className="underline">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/register" className="underline">Create an account</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
