"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, currentUser, AUTH_EVENT } from "@/lib/api";

export default function TopBar() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      currentUser().then((u) => setEmail(u?.email ?? null)).catch(() => setEmail(null));
    };
    refresh();
    window.addEventListener(AUTH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(AUTH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            P
          </span>
          PrepKit
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {email ? (
            <>
              <Badge variant="secondary" className="hidden max-w-[180px] truncate sm:inline-flex">
                {email}
              </Badge>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.post("/auth/logout", {}).catch(() => undefined);
                  setEmail(null);
                  window.dispatchEvent(new Event(AUTH_EVENT));
                  router.push("/");
                  router.refresh();
                }}
              >
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
