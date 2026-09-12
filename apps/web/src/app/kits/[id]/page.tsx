"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, currentUser } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BriefTab } from "@/components/kit/brief-tab";
import { QuestionsTab } from "@/components/kit/questions-tab";
import { FlashcardsTab } from "@/components/kit/flashcards-tab";
import { ScheduleTab } from "@/components/kit/schedule-tab";
import { MockTab, PracticeTab, WeakTab } from "@/components/kit/study-tabs";
import { CoverageBadge, GeneratingPanel } from "@/components/kit/shared";
import { TABS, type ItemMeta, type KitPayload, type Tab } from "@/components/kit/types";

export default function KitPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [payload, setPayload] = useState<KitPayload | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("brief");
  const [regenTarget, setRegenTarget] = useState<{ scope: string; category?: string } | null>(null);
  /** Bumped after each regeneration so editors remount with fresh server content. */
  const [regenRev, setRegenRev] = useState(0);
  const pollCount = useRef(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ kit: KitPayload }>(`/kits/${id}`);
      setPayload(res.kit);
    } catch (err) {
      const e = err as { code?: string; message: string };
      if (e.code === "UNAUTHENTICATED") router.replace("/login");
      else setError(e.message);
    }
  }, [id, router]);

  useEffect(() => {
    currentUser().then((u) => {
      setAuthChecked(true);
      if (!u) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    pollCount.current = 0;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [authChecked, load]);

  // Poll while generating with backoff (2s → 5s → 10s cap) to avoid
  // hammering the API during long generations.
  useEffect(() => {
    if (!payload || payload.status !== "generating") return;
    const delay = Math.min(10_000, 2000 * Math.pow(1.5, pollCount.current));
    pollCount.current += 1;
    const t = setTimeout(() => void load(), delay);
    return () => clearTimeout(t);
  }, [payload, load]);

  const saveEdit = useCallback(
    async (edit: unknown) => {
      setSaving(true);
      setError(null);
      try {
        const res = await api.patch<{ kit: KitPayload }>(`/kits/${id}`, { edit });
        setPayload(res.kit);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const runRegenerate = useCallback(async () => {
    if (!regenTarget) return;
    setRegenTarget(null);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ kit: KitPayload }>(`/kits/${id}/regenerate`, regenTarget);
      setPayload(res.kit);
      setRegenRev((r) => r + 1);
      toast.success("Section regenerated — your edits were preserved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [id, regenTarget]);

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      setTab(TABS[next][0]);
      tabRefs.current[next]?.focus();
    }
  };

  const overlay = payload?.overlay;
  const metaOf = (kind: "questions" | "flashcards", itemId: string): ItemMeta =>
    overlay?.[kind]?.[itemId] ?? { origin: "generated", edited_by_user: false, pinned: false };

  if (!authChecked || !payload) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (payload.status === "failed") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <h1 className="text-lg font-semibold text-destructive">Generation failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{payload.error?.message ?? "Unknown error"}</p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={async () => {
              await api.post(`/kits/${id}/retry`, {}).catch((e) => setError((e as Error).message));
              void load();
            }}
          >
            Retry
          </Button>
        </div>
        {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (payload.status === "generating") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Building your kit</h1>
          <Badge variant="secondary">generating…</Badge>
        </div>
        <GeneratingPanel job={payload.job?.steps ?? []} />
      </div>
    );
  }

  const kit = payload.kit!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-bold text-white"
        >
          {(kit.source.company[0] ?? "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{kit.source.company}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {kit.role.title} · {kit.schedule.days_available}-day plan ·{" "}
            <a href={kit.source.company_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {kit.source.company_url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-muted-foreground" role="status">saving…</span>}
          {busy && <span className="text-xs text-muted-foreground" role="status">working…</span>}
          <CoverageBadge uncovered={kit.coverage.uncovered_requirement_ids.length} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div role="tablist" aria-label="Kit sections" className="flex w-max max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map(([key, label], i) => (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {key === "questions" && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                {kit.questions.length}
              </span>
            )}
            {key === "flashcards" && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                {kit.flashcards.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div key={regenRev} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "brief" && <BriefTab kit={kit} overlay={overlay} saveEdit={saveEdit} askRegen={setRegenTarget} />}
        {tab === "questions" && (
          <QuestionsTab kit={kit} metaOf={(qid) => metaOf("questions", qid)} saveEdit={saveEdit} askRegen={setRegenTarget} />
        )}
        {tab === "flashcards" && (
          <FlashcardsTab kit={kit} metaOf={(fid) => metaOf("flashcards", fid)} saveEdit={saveEdit} askRegen={setRegenTarget} />
        )}
        {tab === "schedule" && <ScheduleTab kit={kit} saveEdit={saveEdit} askRegen={setRegenTarget} />}
        {tab === "practice" && <PracticeTab kit={kit} id={id} />}
        {tab === "weak" && <WeakTab id={id} />}
        {tab === "mock" && <MockTab id={id} />}
      </div>

      <Dialog open={!!regenTarget} onOpenChange={(open) => !open && setRegenTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate this section?</DialogTitle>
            <DialogDescription>
              Generated items in {regenTarget?.scope === "questions-category" ? `the “${regenTarget?.category}” category` : "this section"}{" "}
              will be replaced. Questions and cards you wrote, edited or pinned are kept, and the
              schedule and coverage are recomputed automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void runRegenerate()}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
