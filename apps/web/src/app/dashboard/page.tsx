"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, currentUser } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface KitSummary {
  id: string;
  status: "generating" | "ready" | "failed";
  company_url: string;
  days: number;
  createdAt: string;
  error?: { code: string; message: string } | null;
}

function StatusBadge({ status }: { status: KitSummary["status"] }) {
  if (status === "ready")
    return (
      <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
        ready
      </Badge>
    );
  if (status === "generating") return <Badge variant="secondary">generating…</Badge>;
  return <Badge variant="destructive">failed</Badge>;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

function initialOf(url: string): string {
  const d = domainOf(url);
  return (d[0] ?? "?").toUpperCase();
}

/** Minimal CSV parser: handles quoted fields with embedded commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip, handled with \n
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffDays = Math.floor((Date.now() - then) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const refreshKits = async () => {
    try {
      setKits((await api.get<{ kits: KitSummary[] }>("/kits")).kits);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    currentUser().then(async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      await refreshKits();
    });
  }, [router]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const daysNum = Math.min(60, Math.max(1, Number(days) || 0));
    if (!jd.trim() || !url.trim()) {
      setError("Paste a job description and a company website to create a kit.");
      return;
    }
    if (!daysNum) {
      setError("Days must be a number between 1 and 60.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ kit: { id: string } }>("/kits", {
        jd,
        company_url: url,
        days: daysNum,
      });
      router.push(`/kits/${res.kit.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      let rows: { jd: string; company_url: string; days: number }[];
      if (file.name.endsWith(".csv")) {
        const [header, ...data] = parseCsv(text.trim());
        const idx = (name: string) =>
          header.findIndex((h) => h.trim().toLowerCase() === name);
        const jdI = idx("jd");
        const urlI = idx("company_url");
        const daysI = idx("days");
        const body = jdI === -1 || urlI === -1 ? [header, ...data] : data;
        rows = body.map((cols) => ({
          jd: (jdI === -1 ? cols[0] : cols[jdI])?.trim() ?? "",
          company_url: (urlI === -1 ? cols[1] : cols[urlI])?.trim() ?? "",
          days: Math.min(60, Math.max(1, Number(daysI === -1 ? cols[2] : cols[daysI]) || 5)),
        }));
      } else {
        rows = JSON.parse(text);
      }
      const res = await api.post<{ results: { index: number; status: string; error?: string }[] }>("/kits/bulk", rows);
      const okCount = res.results.filter((r) => r.status === "started" || r.status === "duplicate").length;
      const bad = res.results.filter((r) => r.status === "invalid").length;
      toast.success(`${okCount} kit(s) started${bad ? ` · ${bad} invalid row(s)` : ""}`);
      await refreshKits();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const readyCount = kits?.filter((k) => k.status === "ready").length ?? 0;
  const genCount = kits?.filter((k) => k.status === "generating").length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your kits</h1>
          <p className="text-sm text-muted-foreground">Create a kit per role; bulk-upload several at once.</p>
        </div>
        {kits && kits.length > 0 && (
          <div className="flex gap-2 text-sm">
            <Badge variant="secondary">
              {kits.length} total
            </Badge>
            {genCount > 0 && <Badge variant="secondary">{genCount} generating</Badge>}
            {readyCount > 0 && (
              <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                {readyCount} ready
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>New prep kit</CardTitle>
            <CardDescription>Paste a job description and the company website.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="jd">Job description</Label>
                  <span className="text-xs text-muted-foreground">{jd.length} chars</span>
                </div>
                <Textarea
                  id="jd"
                  required
                  rows={8}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description…"
                  className="resize-y"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <div className="space-y-2">
                  <Label htmlFor="url">Company website</Label>
                  <Input
                    id="url"
                    required
                    inputMode="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://company.example"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="days">Days</Label>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    max={60}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </div>
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || !jd.trim() || !url.trim()} size="lg">
                  {busy ? "Starting…" : "Create kit"}
                </Button>
                <p className="text-xs text-muted-foreground">Takes a minute or two — progress shows on the kit page.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Several roles at once</CardTitle>
            <CardDescription>
              Upload a JSON array of {"{jd, company_url, days}"} or a CSV with those columns (header row optional; quoted commas supported).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="bulk" className="sr-only">
              Bulk upload file
            </Label>
            <Input
              id="bulk"
              ref={fileRef}
              type="file"
              accept=".json,.csv"
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
            <p className="mt-2 text-xs text-muted-foreground">Each row creates its own kit; invalid rows are reported, the rest still run.</p>
          </CardContent>
        </Card>
      </div>

      <section aria-label="Kit list">
        <h2 className="mb-3 text-lg font-semibold">Kits</h2>
        {!kits ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : kits.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="font-medium">No kits yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste your first job description above — your kit will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {kits.map((k) => (
              <li key={k.id}>
                <Link
                  href={`/kits/${k.id}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex items-center gap-3 py-4">
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold",
                          k.status === "ready"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : k.status === "generating"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {initialOf(k.company_url)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{domainOf(k.company_url)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {k.days} day(s) · {relativeDate(k.createdAt)}
                          {k.error ? ` · ${k.error.message}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={k.status} />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
