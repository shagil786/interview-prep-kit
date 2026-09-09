"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, currentUser } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface KitSummary {
  id: string;
  status: "generating" | "ready" | "failed";
  company_url: string;
  days: number;
  createdAt: string;
  error?: { code: string; message: string } | null;
}

function StatusBadge({ status }: { status: KitSummary["status"] }) {
  if (status === "ready") return <Badge className="bg-emerald-600 hover:bg-emerald-600">ready</Badge>;
  if (status === "generating") return <Badge variant="secondary">generating…</Badge>;
  return <Badge variant="destructive">failed</Badge>;
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const res = await api.post<{ kit: { id: string } }>("/kits", { jd, company_url: url, days: Number(days) });
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
        rows = text
          .trim()
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => {
            const [jdCol, urlCol, daysCol] = line.split(",").map((s) => s.trim());
            return { jd: jdCol, company_url: urlCol, days: Number(daysCol || 5) };
          });
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your kits</h1>
        <p className="text-sm text-muted-foreground">Create a kit per role; bulk-upload several at once.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>New prep kit</CardTitle>
            <CardDescription>Paste a job description and the company website.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jd">Job description</Label>
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
              <Button type="submit" disabled={busy} size="lg" className="w-full sm:w-auto">
                {busy ? "Starting…" : "Create kit"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Several roles at once</CardTitle>
            <CardDescription>
              Upload a JSON array of {"{jd, company_url, days}"} or a CSV with those columns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="bulk" className="sr-only">
              Bulk upload file
            </Label>
            <Input id="bulk" type="file" accept=".json,.csv" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
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
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No kits yet — paste your first job description above.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {kits.map((k) => (
              <li key={k.id}>
                <Link href={`/kits/${k.id}`} className="block">
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{k.company_url}</p>
                        <p className="text-xs text-muted-foreground">
                          {k.days} day(s) · {new Date(k.createdAt).toLocaleDateString()}
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
