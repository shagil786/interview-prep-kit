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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ---------- types ---------- */

interface Req {
  id: string;
  text: string;
  kind: string;
  priority: "must" | "nice";
}
interface Question {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
  difficulty: number;
}
interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}
interface Day {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}
interface Kit {
  source: { company: string; company_url: string; pages_used: string[]; jd_chars: number };
  company_brief: { summary: string; what_they_do: string; sources: string[]; unknowns?: string[] };
  role: { title: string; seniority: string; requirements: Req[]; responsibilities: string[] };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: { days_available: number; days: Day[] };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
}
interface Step {
  stage: string;
  label: string;
  status: string;
  detail?: string;
}
interface KitPayload {
  id: string;
  status: "generating" | "ready" | "failed";
  error?: { code: string; message: string } | null;
  kit: Kit | null;
  job?: { steps?: Step[] };
  overlay?: {
    brief?: { origin: string; edited_by_user: boolean; pinned: boolean };
    questions?: Record<string, { origin: string; edited_by_user: boolean; pinned: boolean }>;
    flashcards?: Record<string, { origin: string; edited_by_user: boolean; pinned: boolean }>;
  };
}
type ItemMeta = { origin: string; edited_by_user: boolean; pinned: boolean };

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;
type Tab = "brief" | "questions" | "flashcards" | "schedule" | "practice" | "weak" | "mock";

/* ---------- debounced save ---------- */

function useDebouncedSave<T>(onSave: (value: T) => void, delay = 800) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onSave(value), delay);
    },
    [onSave],
  );
}

/* ---------- page ---------- */

export default function KitPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [payload, setPayload] = useState<KitPayload | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("brief");
  const [regenTarget, setRegenTarget] = useState<{ scope: string; category?: string } | null>(null);

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
    void load();
  }, [authChecked, load]);

  useEffect(() => {
    if (!payload || payload.status !== "generating") return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [payload, load]);

  const saveEdit = useCallback(
    async (edit: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.patch<{ kit: KitPayload }>(`/kits/${id}`, { edit });
        setPayload(res.kit);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
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
      toast.success("Section regenerated — your edits were preserved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [id, regenTarget]);

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
  const tabs: [Tab, string][] = [
    ["brief", "Brief & role"],
    ["questions", "Questions"],
    ["flashcards", "Flashcards"],
    ["schedule", "Schedule"],
    ["practice", "Practice"],
    ["weak", "Weak spots"],
    ["mock", "Mock interview"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{kit.source.company}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {kit.role.title} · {kit.schedule.days_available}-day plan ·{" "}
            <a href={kit.source.company_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {kit.source.company_url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy && <span className="text-xs text-muted-foreground">saving…</span>}
          {kit.coverage.uncovered_requirement_ids.length > 0 ? (
            <Badge variant="destructive">{kit.coverage.uncovered_requirement_ids.length} uncovered</Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">all musts covered</Badge>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <nav aria-label="Sections" className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

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

/* ---------- generating ---------- */

function GeneratingPanel({ job }: { job: Step[] }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <ol className="space-y-4">
        {job.map((s, i) => (
          <li key={`${s.stage}-${i}`} className="flex items-start gap-3 text-sm">
            <StatusDot status={s.status} />
            <div className="min-w-0">
              <p className="font-medium">{s.label}</p>
              {s.detail && <p className="text-muted-foreground">{s.detail}</p>}
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="mt-1 size-2.5 shrink-0 animate-pulse rounded-full bg-primary/60" aria-hidden />
          Working on it — this usually takes a minute or two.
        </li>
      </ol>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "done"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-destructive"
        : status === "running"
          ? "bg-amber-500"
          : status === "skipped"
            ? "bg-muted-foreground/40"
            : "bg-muted-foreground/30";
  return <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", color)} aria-hidden />;
}

/* ---------- provenance badges ---------- */

function ProvenanceBadges({ meta }: { meta: ItemMeta }) {
  return (
    <>
      {meta.origin === "user" && <Badge variant="default" className="bg-violet-600 hover:bg-violet-600">yours</Badge>}
      {meta.edited_by_user && <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">edited · kept on regen</Badge>}
      {meta.pinned && <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">pinned</Badge>}
    </>
  );
}

/* ---------- brief ---------- */

function BriefTab(props: {
  kit: Kit;
  overlay?: KitPayload["overlay"];
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, saveEdit, askRegen } = props;
  const brief = kit.company_brief;
  const saveBrief = useCallback(
    (patch: { summary?: string; what_they_do?: string }) => {
      void saveEdit({
        type: "updateBrief",
        brief: { summary: patch.summary ?? brief.summary, what_they_do: patch.what_they_do ?? brief.what_they_do },
      });
    },
    [saveEdit, brief.summary, brief.what_they_do],
  );
  const debounceSummary = useDebouncedSave((v: string) => saveBrief({ summary: v }));
  const debounceWhat = useDebouncedSave((v: string) => saveBrief({ what_they_do: v }));

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Company brief</h2>
          <Button variant="outline" size="sm" onClick={() => askRegen({ scope: "brief" })}>
            Regenerate
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-summary">Summary</Label>
          <Textarea id="brief-summary" defaultValue={brief.summary} onChange={(e) => debounceSummary(e.target.value)} rows={4} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-what">What they do</Label>
          <Textarea id="brief-what" defaultValue={brief.what_they_do} onChange={(e) => debounceWhat(e.target.value)} rows={3} />
        </div>
        {(brief.unknowns?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Honest unknowns</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {brief.unknowns!.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">How this was researched</p>
          {kit.source.pages_used.length === 0 ? (
            <p className="mt-1 text-muted-foreground">No company pages could be retrieved — the brief reflects that.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {kit.source.pages_used.map((u) => (
                <li key={u} className="truncate">
                  <a href={u} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="font-semibold">Role &amp; requirements</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {kit.role.title} · {kit.role.seniority} · {kit.source.jd_chars} chars of description
          </p>
          <ul className="mt-3 space-y-2">
            {kit.role.requirements.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-sm">
                <Badge variant={r.priority === "must" ? "default" : "secondary"} className="mt-0.5 shrink-0">
                  {r.priority}
                </Badge>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- questions ---------- */

function QuestionsTab(props: {
  kit: Kit;
  metaOf: (qid: string) => ItemMeta;
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, metaOf, saveEdit, askRegen } = props;
  const [newCat, setNewCat] = useState<string>("technical");

  const upsert = (q: Question, patch: Partial<Question>) => {
    void saveEdit({ type: "upsertQuestion", oldId: q.id, question: { ...q, ...patch } });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Questions ({kit.questions.length})</h2>
        <div className="flex items-center gap-2">
          <Select value={newCat} onValueChange={setNewCat}>
            <SelectTrigger className="h-9 w-44" aria-label="New question category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() =>
              void saveEdit({
                type: "upsertQuestion",
                question: {
                  requirement_ids: [kit.role.requirements[0]?.id ?? ""].filter(Boolean),
                  category: newCat,
                  prompt: "New question — edit me.",
                  answer_outline: "Outline for your answer.",
                  difficulty: 2,
                },
              })
            }
          >
            Add question
          </Button>
        </div>
      </div>

      <ul className="space-y-3">
        {kit.questions.map((q, index) => (
          <QuestionRow
            key={q.id}
            q={q}
            kit={kit}
            meta={metaOf(q.id)}
            canUp={index > 0}
            canDown={index < kit.questions.length - 1}
            onSave={(patch) => upsert(q, patch)}
            onMove={(dir) =>
              void saveEdit({ type: "reorderQuestions", orderedIds: move(kit.questions.map((x) => x.id), index, dir) })
            }
            onDelete={() => void saveEdit({ type: "deleteQuestion", id: q.id })}
            onPin={() => void saveEdit({ type: "pin", kind: "question", id: q.id, pinned: !metaOf(q.id).pinned })}
            onMoveCategory={(category) => void saveEdit({ type: "moveQuestionCategory", id: q.id, category })}
            onRegenCategory={() => askRegen({ scope: "questions-category", category: q.category })}
          />
        ))}
      </ul>
    </section>
  );
}

function move(ids: string[], index: number, dir: -1 | 1): string[] {
  const next = [...ids];
  const target = index + dir;
  if (target < 0 || target >= next.length) return ids;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function QuestionRow(props: {
  q: Question;
  kit: Kit;
  meta: ItemMeta;
  canUp: boolean;
  canDown: boolean;
  onSave: (patch: Partial<Question>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onPin: () => void;
  onMoveCategory: (category: string) => void;
  onRegenCategory: () => void;
}) {
  const { q, kit, meta, canUp, canDown, onSave, onMove, onDelete, onPin, onMoveCategory, onRegenCategory } = props;
  const [showOutline, setShowOutline] = useState(false);
  const debouncePrompt = useDebouncedSave((v: string) => onSave({ prompt: v }));
  const debounceOutline = useDebouncedSave((v: string) => onSave({ answer_outline: v }));
  const covered = q.requirement_ids.map((rid) => kit.role.requirements.find((r) => r.id === rid)?.text ?? rid);

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button variant="outline" size="icon" aria-label="Move down" disabled={!canDown} onClick={() => onMove(1)}>
            ↓
          </Button>
        </div>
        <Select value={q.category} onValueChange={onMoveCategory}>
          <SelectTrigger className="h-8 w-40" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">difficulty {q.difficulty}/3</Badge>
        <ProvenanceBadges meta={meta} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant={meta.pinned ? "secondary" : "ghost"} size="sm" onClick={onPin}>
            {meta.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRegenCategory}>
            Regenerate category
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <Textarea
        aria-label="Question"
        defaultValue={q.prompt}
        onChange={(e) => debouncePrompt(e.target.value)}
        rows={2}
        className="mt-3 font-medium"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {covered.map((c) => (
          <Badge key={c} variant="secondary" className="max-w-full font-normal">{c}</Badge>
        ))}
      </div>
      <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-muted-foreground" onClick={() => setShowOutline((s) => !s)}>
        {showOutline ? "Hide" : "Show"} answer outline
      </Button>
      {showOutline && (
        <Textarea
          aria-label="Answer outline"
          defaultValue={q.answer_outline}
          onChange={(e) => debounceOutline(e.target.value)}
          rows={3}
          className="mt-1 bg-muted/40"
        />
      )}
    </li>
  );
}

/* ---------- flashcards ---------- */

function FlashcardsTab(props: {
  kit: Kit;
  metaOf: (fid: string) => ItemMeta;
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, metaOf, saveEdit, askRegen } = props;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Flashcards ({kit.flashcards.length})</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void saveEdit({
                type: "upsertFlashcard",
                flashcard: {
                  front: "New card front",
                  back: "New card back",
                  requirement_ids: [kit.role.requirements[0]?.id ?? ""].filter(Boolean),
                },
              })
            }
          >
            Add card
          </Button>
          <Button variant="outline" size="sm" onClick={() => askRegen({ scope: "flashcards" })}>
            Regenerate
          </Button>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {kit.flashcards.map((f) => (
          <FlashcardRow key={f.id} f={f} meta={metaOf(f.id)} saveEdit={saveEdit} />
        ))}
      </ul>
    </section>
  );
}

function FlashcardRow(props: {
  f: Flashcard;
  meta: ItemMeta;
  saveEdit: (edit: unknown) => Promise<void>;
}) {
  const { f, meta, saveEdit } = props;
  const debounceFront = useDebouncedSave((v: string) => void saveEdit({ type: "upsertFlashcard", oldId: f.id, flashcard: { ...f, front: v } }));
  const debounceBack = useDebouncedSave((v: string) => void saveEdit({ type: "upsertFlashcard", oldId: f.id, flashcard: { ...f, back: v } }));
  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1"><ProvenanceBadges meta={meta} /></div>
        <div className="flex gap-1">
          <Button variant={meta.pinned ? "secondary" : "ghost"} size="sm" onClick={() => void saveEdit({ type: "pin", kind: "flashcard", id: f.id, pinned: !meta.pinned })}>
            {meta.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void saveEdit({ type: "deleteFlashcard", id: f.id })}>
            Delete
          </Button>
        </div>
      </div>
      <Input aria-label="Front" defaultValue={f.front} onChange={(e) => debounceFront(e.target.value)} className="mt-2 font-medium" />
      <Textarea aria-label="Back" defaultValue={f.back} onChange={(e) => debounceBack(e.target.value)} rows={2} className="mt-2 bg-muted/40" />
    </li>
  );
}

/* ---------- schedule ---------- */

function ScheduleTab(props: {
  kit: Kit;
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, saveEdit, askRegen } = props;
  const dayQuestions = (day: Day) => day.question_ids.map((qid) => kit.questions.find((q) => q.id === qid)?.prompt ?? qid);
  const totalMinutes = kit.schedule.days.reduce((a, d) => a + d.minutes, 0);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Schedule — {kit.schedule.days_available} days{" "}
          <span className="text-sm font-normal text-muted-foreground">· {totalMinutes} min total</span>
        </h2>
        <Button variant="outline" size="sm" onClick={() => askRegen({ scope: "schedule" })}>
          Regenerate
        </Button>
      </div>
      <ol className="space-y-3">
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="text-base font-semibold">Day {d.day}</Badge>
              <FocusEditor day={d} saveEdit={saveEdit} />
              <span className="ml-auto text-muted-foreground">
                {d.question_ids.length} question(s) · {d.minutes} min
              </span>
            </div>
            <Separator className="my-3" />
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {dayQuestions(d).length === 0 ? (
                <li>Review day — revisit your weakest flashcards.</li>
              ) : (
                dayQuestions(d).map((p) => <li key={p}>{p}</li>)
              )}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FocusEditor(props: { day: Day; saveEdit: (edit: unknown) => Promise<void> }) {
  const { day, saveEdit } = props;
  const debounce = useDebouncedSave((focus: string) => void saveEdit({ type: "updateDay", day: day.day, patch: { focus } }));
  return (
    <Input
      aria-label={`Day ${day.day} focus`}
      defaultValue={day.focus}
      onChange={(e) => debounce(e.target.value)}
      className="w-full max-w-xs font-medium"
    />
  );
}

/* ---------- practice ---------- */

function PracticeTab({ kit, id }: { kit: Kit; id: string }) {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [summary, setSummary] = useState<{ covered: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    api
      .get<{ practice: { covered: number; total: number } }>(`/kits/${id}/practice`)
      .then((r) => setSummary(r.practice))
      .catch(() => undefined);
  }, [id]);

  function start() {
    setQueue([...kit.flashcards]);
    setIndex(0);
    setRevealed(false);
    setStarted(true);
  }

  const current = queue[index];

  async function rate(confidence: 1 | 2 | 3) {
    if (!current) return;
    try {
      await api.post(`/kits/${id}/practice`, { card_id: current.id, confidence });
      const r = await api.get<{ practice: { covered: number; total: number } }>(`/kits/${id}/practice`);
      setSummary(r.practice);
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        setRevealed(false);
      } else {
        setStarted(false);
        toast.success("Session complete — nice work.");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!started) {
    const progress = summary ? Math.round((summary.covered / Math.max(summary.total, 1)) * 100) : 0;
    return (
      <section className="rounded-xl border bg-card p-8 text-center">
        <h2 className="font-semibold">Flashcard practice</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary ? `${summary.covered}/${summary.total} cards covered (${progress}%)` : "…"}
        </p>
        <div className="mx-auto mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <Button size="lg" className="mt-5" onClick={start}>
          Start a session
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    );
  }
  if (!current) return null;
  return (
    <section className="mx-auto max-w-xl rounded-xl border bg-card p-8">
      <p className="text-xs text-muted-foreground">
        Card {index + 1} of {queue.length}
      </p>
      <h2 className="mt-3 text-xl font-medium">{current.front}</h2>
      {revealed ? (
        <>
          <Separator className="my-4" />
          <p className="text-muted-foreground">{current.back}</p>
          <p className="mt-5 text-sm font-medium">How confident were you?</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" className="flex-1 border-destructive/40" onClick={() => void rate(1)}>
              Not confident
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => void rate(2)}>
              Almost
            </Button>
            <Button className="flex-1" onClick={() => void rate(3)}>
              Confident
            </Button>
          </div>
        </>
      ) : (
        <Button className="mt-6 w-full" onClick={() => setRevealed(true)}>
          Reveal answer
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}

/* ---------- weak spots ---------- */

function WeakTab({ id }: { id: string }) {
  const [spots, setSpots] = useState<{ requirementId: string; reason: string; score: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ spots: { requirementId: string; reason: string; score: number }[] }>(`/kits/${id}/weak-spots`)
      .then((r) => setSpots(r.spots))
      .catch((e) => setError((e as Error).message));
  }, [id]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!spots)
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  if (spots.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-8 text-center">
        <h2 className="font-semibold">No weak spots right now</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every requirement is covered and practised with good confidence.</p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Close these gaps before the interview</h2>
      <ol className="space-y-2">
        {spots.map((s) => (
          <li key={s.requirementId} className="rounded-xl border border-amber-500/40 bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.requirementId}</span>
              <Badge variant="secondary">priority {s.score}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">{s.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- mock interview ---------- */

function MockTab({ id }: { id: string }) {
  const [session, setSession] = useState<{ sessionId: string; questions: { questionId: string; prompt: string }[] } | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ grade: number; feedback: string; modelAnswer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>("all");

  async function begin() {
    setError(null);
    setResult(null);
    try {
      const s = await api.post<{ sessionId: string; questions: { questionId: string; prompt: string }[] }>(`/kits/${id}/mock/session`, {
        category: category === "all" ? undefined : category,
      });
      setSession(s);
      setIdx(0);
      setAnswer("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const q = session.questions[idx];
      const r = await api.post<{ grade: number; feedback: string; modelAnswer: string }>(`/kits/${id}/mock/answer`, {
        questionId: q.questionId,
        answer,
      });
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const q = session?.questions[idx];

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="font-semibold">Mock interview</h2>
      {!session ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Answer the kit’s own questions in writing; PrepKit scores each answer against the expected outline.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48" aria-label="Category filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void begin()}>Start session</Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      ) : q ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-xs text-muted-foreground">
            Question {idx + 1} of {session.questions.length}
          </p>
          <h3 className="mt-1 font-medium">{q.prompt}</h3>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            placeholder="Write your answer as if speaking it…"
            className="mt-3"
          />
          <Button disabled={busy || !answer.trim()} onClick={() => void submit()} className="mt-3">
            {busy ? "Scoring…" : "Submit answer"}
          </Button>
          {result && (
            <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm">
              <p className="font-medium">
                Grade:{" "}
                <span className="text-primary">{"●".repeat(result.grade)}</span>
                <span className="text-muted-foreground/40">{"○".repeat(5 - result.grade)}</span>{" "}
                {result.grade}/5
              </p>
              <p className="mt-1 text-muted-foreground">{result.feedback}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-primary">Model answer</summary>
                <p className="mt-1 text-muted-foreground">{result.modelAnswer}</p>
              </details>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  if (idx + 1 < session.questions.length) {
                    setIdx(idx + 1);
                    setAnswer("");
                    setResult(null);
                  } else {
                    setSession(null);
                    setResult(null);
                  }
                }}
              >
                {idx + 1 < session.questions.length ? "Next question" : "Finish session"}
              </Button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      ) : null}
    </section>
  );
}
