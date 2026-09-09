"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, currentUser } from "@/lib/api";

export default function TopBar() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    currentUser().then((u) => setEmail(u?.email ?? null)).catch(() => setEmail(null));
  }, []);
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          PrepKit
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {email ? (
            <>
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                Dashboard
              </Link>
              <span className="text-slate-400">{email}</span>
              <button
                type="button"
                onClick={async () => {
                  await api.post("/auth/logout", {}).catch(() => undefined);
                  setEmail(null);
                  router.push("/");
                  router.refresh();
                }}
                className="text-slate-600 hover:text-slate-900"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
