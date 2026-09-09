"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, currentUser } from "@/lib/api";

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

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;
const TABS = ["brief", "questions", "flashcards", "schedule", "practice", "weak", "mock"] as const;
type Tab = (typeof TABS)[number];

/* ---------- debounced field ---------- */

function useDebouncedSave<T>(onSave: (value: T) => void, delay = 700) {
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
  const [notice, setNotice] = useState<string | null>(null);

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

  // Poll while generating.
  useEffect(() => {
    if (!payload || payload.status !== "generating") return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [payload, load]);

  const saveEdit = useCallback(
    async (edit: unknown, message?: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.patch<{ kit: KitPayload }>(`/kits/${id}`, { edit });
        setPayload(res.kit);
        if (message) setNotice(message);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [id],
  );

  const regenerate = useCallback(
    async (scope: string, category?: string) => {
      if (!window.confirm("Regenerate this section? Your edits and pinned items in other sections are kept.")) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.post<{ kit: KitPayload }>(`/kits/${id}/regenerate`, { scope, category });
        setPayload(res.kit);
        setNotice("Section regenerated — your edits were preserved.");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [id],
  );

  const overlay = payload?.overlay;
  const metaOf = (kind: "questions" | "flashcards", qid: string) =>
    overlay?.[kind]?.[qid] ?? { origin: "generated", edited_by_user: false, pinned: false };

  if (!authChecked) return <p className="text-slate-500">Loading…</p>;
  if (!payload) return <p className="text-slate-500">{error ?? "Loading kit…"}</p>;

  if (payload.status === "failed") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Generation failed</h1>
        <p className="mt-2 text-sm text-red-600">{payload.error?.message ?? "Unknown error"}</p>
        <button
          onClick={async () => {
            await api.post(`/kits/${id}/retry`, {}).catch((e) => setError((e as Error).message));
            void load();
          }}
          className="mt-4 rounded-md bg-red-700 px-4 py-2 text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      {busy && <p className="mb-4 text-sm text-slate-500">Saving…</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{payload.kit?.source.company ?? "Generating…"}</h1>
        <span className="text-sm text-slate-500">{payload.status}</span>
      </div>

      {payload.status === "generating" ? (
        <GeneratingPanel job={payload.job?.steps ?? []} />
      ) : payload.kit ? (
        <>
          <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-1">
            {(
              [
                ["brief", "Brief"],
                ["questions", "Questions"],
                ["flashcards", "Flashcards"],
                ["schedule", "Schedule"],
                ["practice", "Practice"],
                ["weak", "Weak spots"],
                ["mock", "Mock interview"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={
                  tab === key
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
                    : "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                }
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "brief" && <BriefTab kit={payload.kit} overlay={overlay} saveEdit={saveEdit} regenerate={regenerate} />}
          {tab === "questions" && (
            <QuestionsTab
              kit={payload.kit}
              metaOf={(qid) => metaOf("questions", qid)}
              saveEdit={saveEdit}
              regenerate={regenerate}
            />
          )}
          {tab === "flashcards" && (
            <FlashcardsTab
              kit={payload.kit}
              metaOf={(fid) => metaOf("flashcards", fid)}
              saveEdit={saveEdit}
              regenerate={regenerate}
            />
          )}
          {tab === "schedule" && <ScheduleTab kit={payload.kit} saveEdit={saveEdit} regenerate={regenerate} />}
          {tab === "practice" && <PracticeTab kit={payload.kit} id={id} />}
          {tab === "weak" && <WeakTab id={id} />}
          {tab === "mock" && <MockTab kit={payload.kit} id={id} />}
        </>
      ) : null}
    </div>
  );
}

function GeneratingPanel({ job }: { job: Step[] }) {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-medium">Building your kit…</h2>
      <ol className="mt-4 space-y-3">
        {job.map((s, i) => (
          <li key={`${s.stage}-${i}`} className="flex items-start gap-3 text-sm">
            <StatusDot status={s.status} />
            <div>
              <p className="font-medium text-slate-800">{s.label}</p>
              {s.detail && <p className="text-slate-500">{s.detail}</p>}
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          Finishing up…
        </li>
      </ol>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "done" ? "bg-emerald-500" : status === "failed" ? "bg-red-500" : status === "running" ? "bg-amber-500" : "bg-slate-300";
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}

/* ---------- brief ---------- */

function BriefTab(props: {
  kit: Kit;
  overlay?: KitPayload["overlay"];
  saveEdit: (edit: unknown, message?: string) => Promise<void>;
  regenerate: (scope: string) => Promise<void>;
}) {
  const { kit, overlay, saveEdit, regenerate } = props;
  const brief = kit.company_brief;
  const saveBrief = useCallback(
    (patch: { summary?: string; what_they_do?: string }) => {
      void saveEdit({ type: "updateBrief", brief: { summary: patch.summary ?? brief.summary, what_they_do: patch.what_they_do ?? brief.what_they_do } });
    },
    [saveEdit, brief.summary, brief.what_they_do],
  );
  const debounceSummary = useDebouncedSave((v: string) => saveBrief({ summary: v }), 900);
  const debounceWhat = useDebouncedSave((v: string) => saveBrief({ what_they_do: v }), 900);

  return (
    <section className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Company brief</h2>
        <button type="button" onClick={() => void regenerate("brief")} className="rounded-md border px-3 py-1 text-sm">
          Regenerate brief
        </button>
      </div>
      <Field label="Summary" value={brief.summary} onChange={debounceSummary} />
      <Field label="What they do" value={brief.what_they_do} onChange={debounceWhat} />
      {(brief.unknowns?.length ?? 0) > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Honest unknowns</p>
          <ul className="mt-1 list-inside list-disc">
            {brief.unknowns!.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      )}
      <div className="rounded-md border border-slate-200 p-4 text-sm">
        <p className="font-medium">How this was researched</p>
        {kit.source.pages_used.length === 0 ? (
          <p className="mt-1 text-slate-500">No company pages could be retrieved — the brief reflects that.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc text-slate-600">
            {kit.source.pages_used.map((u) => (
              <li key={u}><a href={u} target="_blank" rel="noreferrer" className="underline">{u}</a></li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-semibold">Role</h2>
        <p className="mt-1 text-sm text-slate-600">
          {kit.role.title} · {kit.role.seniority}
        </p>
        <ul className="mt-2 space-y-1">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className={`rounded px-1.5 py-0.5 text-xs ${r.priority === "must" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}>
                {r.priority}
              </span>
              <span className="text-slate-600">{r.text}</span>
            </li>
          ))}
        </ul>
        {overlay?.brief && <p className="mt-1 text-xs text-slate-400">brief provenance: {JSON.stringify(overlay.brief)}</p>}
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

/* ---------- questions ---------- */

function QuestionsTab(props: {
  kit: Kit;
  metaOf: (qid: string) => { origin: string; edited_by_user: boolean; pinned: boolean };
  saveEdit: (edit: unknown, message?: string) => Promise<void>;
  regenerate: (scope: string, category?: string) => Promise<void>;
}) {
  const { kit, metaOf, saveEdit, regenerate } = props;
  const [showOutline, setShowOutline] = useState<Record<string, boolean>>({});
  const [newCat, setNewCat] = useState<string>("technical");

  const upsert = (q: Question, patch: Partial<Question>) => {
    void saveEdit({ type: "upsertQuestion", oldId: q.id, question: { ...q, ...patch } });
  };
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Questions ({kit.questions.length})</h2>
        <div className="flex items-center gap-2 text-sm">
          <select value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="New question category" className="rounded border px-2 py-1">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            onClick={() =>
              void saveEdit({
                type: "upsertQuestion",
                question: { requirement_ids: [kit.role.requirements[0]?.id ?? ""].filter(Boolean), category: newCat, prompt: "New question — edit me.", answer_outline: "Outline for your answer.", difficulty: 2 },
              })
            }
            className="rounded-md bg-slate-900 px-3 py-1 text-white"
          >
            Add question
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">Keyboard: Tab to a question then Alt+↑/↓ to reorder.</p>

      <ul className="mt-4 space-y-3">
        {kit.questions.map((q, index) => {
          const meta = metaOf(q.id);
          return (
            <QuestionRow
              key={q.id}
              q={q}
              kit={kit}
              meta={meta}
              canUp={index > 0}
              canDown={index < kit.questions.length - 1}
              showOutline={!!showOutline[q.id]}
              onToggleOutline={() => setShowOutline((s2) => ({ ...s2, [q.id]: !s2[q.id] }))}
              onSave={(patch) => upsert(q, patch)}
              onMove={(dir) =>
                void saveEdit({ type: "reorderQuestions", orderedIds: move(kit.questions.map((x) => x.id), index, dir) })
              }
              onDelete={() => void saveEdit({ type: "deleteQuestion", id: q.id })}
              onPin={() => void saveEdit({ type: "pin", kind: "question", id: q.id, pinned: !meta.pinned })}
              onMoveCategory={(category) => void saveEdit({ type: "moveQuestionCategory", id: q.id, category })}
              onRegenCategory={() => void regenerate("questions-category", q.category)}
            />
          );
        })}
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
  meta: { origin: string; edited_by_user: boolean; pinned: boolean };
  canUp: boolean;
  canDown: boolean;
  showOutline: boolean;
  onToggleOutline: () => void;
  onSave: (patch: Partial<Question>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onPin: () => void;
  onMoveCategory: (category: string) => void;
  onRegenCategory: () => void;
}) {
  const { q, kit, meta, canUp, canDown, showOutline, onToggleOutline, onSave, onMove, onDelete, onPin, onMoveCategory, onRegenCategory } = props;
  const debouncePrompt = useDebouncedSave((v: string) => onSave({ prompt: v }), 900);
  const debounceOutline = useDebouncedSave((v: string) => onSave({ answer_outline: v }), 900);
  const covered = q.requirement_ids.map((rid) => kit.role.requirements.find((r) => r.id === rid)?.text ?? rid);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <button
          type="button"
          aria-label="Move up"
          disabled={!canUp}
          onClick={() => onMove(-1)}
          className="rounded border border-slate-300 px-1.5 py-0.5 disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={!canDown}
          onClick={() => onMove(1)}
          className="rounded border border-slate-300 px-1.5 py-0.5 disabled:opacity-40"
        >
          ↓
        </button>
        <select
          aria-label="Category"
          value={q.category}
          onChange={(e) => onMoveCategory(e.target.value)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span>{q.difficulty}/3</span>
        {meta.origin === "user" && <span className="text-indigo-600">yours</span>}
        {meta.edited_by_user && <span className="text-emerald-600">edited · kept on regen</span>}
        {meta.pinned && <span className="text-amber-600">pinned</span>}
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onPin} className="underline">
            {meta.pinned ? "unpin" : "pin"}
          </button>
          <button type="button" onClick={onRegenCategory} className="underline">
            regenerate category
          </button>
          <button type="button" onClick={onDelete} className="underline text-red-600">
            delete
          </button>
        </span>
      </div>
      <textarea
        aria-label="Question"
        defaultValue={q.prompt}
        onChange={(e) => debouncePrompt(e.target.value)}
        rows={2}
        className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <div className="mt-1 flex flex-wrap gap-1">
        {covered.map((c) => (
          <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{c}</span>
        ))}
      </div>
      <button type="button" onClick={onToggleOutline} className="mt-1 text-xs underline">
        {showOutline ? "Hide" : "Show"} answer outline
      </button>
      {showOutline && (
        <textarea
          aria-label="Answer outline"
          defaultValue={q.answer_outline}
          onChange={(e) => debounceOutline(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm"
        />
      )}
    </li>
  );
}

/* ---------- flashcards ---------- */

function FlashcardsTab(props: {
  kit: Kit;
  metaOf: (fid: string) => { origin: string; edited_by_user: boolean; pinned: boolean };
  saveEdit: (edit: unknown, message?: string) => Promise<void>;
  regenerate: (scope: string) => Promise<void>;
}) {
  const { kit, metaOf, saveEdit, regenerate } = props;
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Flashcards ({kit.flashcards.length})</h2>
        <button type="button" onClick={() => void regenerate("flashcards")} className="rounded-md border px-3 py-1 text-sm">
          Regenerate flashcards
        </button>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {kit.flashcards.map((f) => (
          <FlashcardRow key={f.id} f={f} meta={metaOf(f.id)} saveEdit={saveEdit} />
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
        onClick={() =>
          void saveEdit({
            type: "upsertFlashcard",
            flashcard: { front: "New card front", back: "New card back", requirement_ids: [kit.role.requirements[0]?.id ?? ""].filter(Boolean) },
          })
        }
      >
        Add flashcard
      </button>
    </section>
  );
}

/* ---------- schedule ---------- */

function ScheduleTab(props: { kit: Kit; saveEdit: (edit: unknown, message?: string) => Promise<void>; regenerate: (scope: string) => Promise<void> }) {
  const { kit, saveEdit, regenerate } = props;
  const dayQuestions = (day: Day) =>
    day.question_ids.map((qid) => kit.questions.find((q) => q.id === qid)?.prompt ?? qid);
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Schedule — {kit.schedule.days_available} day(s)</h2>
        <button type="button" onClick={() => void regenerate("schedule")} className="rounded-md border px-3 py-1 text-sm">
          Regenerate schedule
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">Day {d.day}</span>
              <FocusEditor day={d} saveEdit={saveEdit} />
              <span className="ml-auto text-slate-500">{d.question_ids.length} question(s) · {d.minutes} min</span>
            </div>
            <ul className="mt-2 list-inside list-disc text-slate-600">
              {dayQuestions(d).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FocusEditor(props: { day: Day; saveEdit: (edit: unknown) => Promise<void> }) {
  const { day, saveEdit } = props;
  const debounce = useDebouncedSave((focus: string) => void saveEdit({ type: "updateDay", day: day.day, patch: { focus } }), 900);
  return (
    <input
      aria-label={`Day ${day.day} focus`}
      defaultValue={day.focus}
      onChange={(e) => debounce(e.target.value)}
      className="w-56 rounded border border-slate-200 px-2 py-1 text-sm"
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
    // unseen first, then least confident — confidence-weighted ordering
    const entries = [...kit.flashcards];
    setQueue(entries);
    setIndex(0);
    setRevealed(false);
    setStarted(true);
  }

  const current = queue[index];

  async function rate(confidence: 1 | 2 | 3) {
    if (!current) return;
    try {
      await api.post(`/kits/${id}/practice`, { card_id: current.id, confidence });
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        setRevealed(false);
      } else {
        setStarted(false);
      }
      const r = await api.get<{ practice: { covered: number; total: number } }>(`/kits/${id}/practice`);
      setSummary(r.practice);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!started) {
    return (
      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h2 className="font-semibold">Flashcard practice</h2>
        <p className="mt-1 text-sm text-slate-500">
          {summary ? `${summary.covered}/${summary.total} covered` : "…"}
        </p>
        <button type="button" onClick={start} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-white">
          Start a session
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );
  }
  if (!current) return null;
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6">
      <p className="text-xs text-slate-400">
        Card {index + 1} of {queue.length}
      </p>
      <h2 className="mt-2 text-lg font-medium">{current.front}</h2>
      {revealed ? (
        <>
          <p className="mt-3 text-slate-700">{current.back}</p>
          <div className="mt-5 flex gap-2">
            {([1, 2, 3] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void rate(c)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm"
              >
                {c === 1 ? "Not confident" : c === 2 ? "Almost" : "Confident"}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setRevealed(true)} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-white">
          Reveal answer
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
  if (error) return <p className="mt-5 text-sm text-red-600">{error}</p>;
  if (!spots) return <p className="mt-5 text-sm text-slate-500">Loading weak spots…</p>;
  if (spots.length === 0) {
    return (
      <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="font-semibold text-emerald-800">No weak spots right now</h2>
        <p className="mt-1 text-sm text-emerald-700">Every requirement is covered and practised with good confidence.</p>
      </section>
    );
  }
  return (
    <section className="mt-5">
      <h2 className="font-semibold">Close these gaps before the interview</h2>
      <ol className="mt-3 space-y-2">
        {spots.map((s) => (
          <li key={s.requirementId} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{s.requirementId}</span>
              <span className="text-slate-400">score {s.score}</span>
            </div>
            <p className="mt-1 text-slate-600">{s.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- mock interview ---------- */

function MockTab({ kit, id }: { kit: Kit; id: string }) {
  const [session, setSession] = useState<{ sessionId: string; questions: { questionId: string; prompt: string }[] } | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ grade: number; feedback: string; modelAnswer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>("");

  async function begin() {
    setError(null);
    setResult(null);
    try {
      const s = await api.post<{ sessionId: string; questions: { questionId: string; prompt: string }[] }>(`/kits/${id}/mock/session`, {
        category: category || undefined,
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
    <section className="mt-5 space-y-4">
      <h2 className="font-semibold">Mock interview</h2>
      {!session ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">Answer the kit’s own questions in writing; PrepKit scores you against the answer outline.</p>
          <div className="mt-3 flex items-center gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border px-2 py-1 text-sm" aria-label="Category filter">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={() => void begin()} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
              Start session
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      ) : q ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-400">Question {idx + 1} of {session.questions.length}</p>
          <h3 className="mt-1 font-medium">{q.prompt}</h3>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} placeholder="Write your answer as if speaking it…" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" disabled={busy || !answer.trim()} onClick={() => void submit()} className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Scoring…" : "Submit answer"}
          </button>
          {result && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-medium">Grade: {"●".repeat(result.grade)}{"○".repeat(5 - result.grade)}</p>
              <p className="mt-1 text-slate-700">{result.feedback}</p>
              <details className="mt-2">
                <summary className="cursor-pointer underline">Model answer</summary>
                <p className="mt-1 text-slate-600">{result.modelAnswer}</p>
              </details>
              <button
                type="button"
                className="mt-3 rounded-md border px-3 py-1 text-sm"
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
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      ) : null}
    </section>
  );
}

function FlashcardRow(props: {
  f: Flashcard;
  meta: { origin: string; edited_by_user: boolean; pinned: boolean };
  saveEdit: (edit: unknown, message?: string) => Promise<void>;
}) {
  const { f, meta, saveEdit } = props;
  const debounceFront = useDebouncedSave((v: string) => void saveEdit({ type: "upsertFlashcard", oldId: f.id, flashcard: { ...f, front: v } }), 900);
  const debounceBack = useDebouncedSave((v: string) => void saveEdit({ type: "upsertFlashcard", oldId: f.id, flashcard: { ...f, back: v } }), 900);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {meta.origin === "user" && "yours "}
          {meta.edited_by_user && "· edited"}
          {meta.pinned && "· pinned"}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            className="underline"
            onClick={() => void saveEdit({ type: "pin", kind: "flashcard", id: f.id, pinned: !meta.pinned })}
          >
            {meta.pinned ? "unpin" : "pin"}
          </button>
          <button type="button" className="underline text-red-600" onClick={() => void saveEdit({ type: "deleteFlashcard", id: f.id })}>
            delete
          </button>
        </span>
      </div>
      <input aria-label="Front" defaultValue={f.front} onChange={(e) => debounceFront(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm font-medium" />
      <textarea aria-label="Back" defaultValue={f.back} onChange={(e) => debounceBack(e.target.value)} rows={2} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm text-slate-600" />
    </li>
  );
}
