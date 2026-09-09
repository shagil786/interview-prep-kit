"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, currentUser } from "@/lib/api";

interface KitSummary {
  id: string;
  status: "generating" | "ready" | "failed";
  company_url: string;
  days: number;
  createdAt: string;
  error?: { code: string; message: string } | null;
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    currentUser().then(async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      try {
        setKits((await api.get<{ kits: KitSummary[] }>("/kits")).kits);
      } catch (err) {
        setError((err as Error).message);
      }
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
    setBulkNote(null);
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
      const res = await api.post<{ results: { index: number; status: string; id?: string; error?: string }[] }>("/kits/bulk", rows);
      const okCount = res.results.filter((r) => r.status === "started" || r.status === "duplicate").length;
      const bad = res.results.filter((r) => r.status === "invalid").length;
      setBulkNote(`${okCount} kit(s) started, ${bad} row(s) invalid`);
      setKits((await api.get<{ kits: KitSummary[] }>("/kits")).kits);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!user) return <p className="text-slate-500">Checking session…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Your kits</h1>

      <form onSubmit={create} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Create a kit</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="jd" className="mb-1 block text-sm font-medium">
              Job description
            </label>
            <textarea
              id="jd"
              required
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor="url" className="mb-1 block text-sm font-medium">
                Company website
              </label>
              <input
                id="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://company.example"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="days" className="mb-1 block text-sm font-medium">
                Days
              </label>
              <input
                id="days"
                type="number"
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {busy ? "Starting…" : "Create kit"}
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm">
        <label className="font-medium" htmlFor="bulk">
          Preparing for several roles at once?
        </label>
        <input
          id="bulk"
          type="file"
          accept=".json,.csv"
          className="mt-2 block text-sm"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        <p className="mt-1 text-xs text-slate-500">
          A JSON array of {"{jd, company_url, days}"} or a CSV with columns jd,company_url,days.
        </p>
        {bulkNote && <p className="mt-2 text-emerald-700">{bulkNote}</p>}
      </div>

      <section className="mt-8" aria-label="Kit list">
        {kits.length === 0 ? (
          <p className="text-slate-500">No kits yet — paste your first job description above.</p>
        ) : (
          <ul className="space-y-2">
            {kits.map((k) => (
              <li key={k.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <a href={`/kits/${k.id}`} className="flex items-center justify-between">
                  <span className="truncate font-medium text-slate-800">{k.company_url}</span>
                  <span className="flex items-center gap-3 text-sm">
                    <span>{k.days} day(s)</span>
                    {k.status === "ready" && <span className="text-emerald-600">ready</span>}
                    {k.status === "generating" && <span className="text-amber-600">generating…</span>}
                    {k.status === "failed" && <span className="text-red-600">failed</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
