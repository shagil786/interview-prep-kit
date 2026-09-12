"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, type Flashcard, type Kit } from "./types";

export function PracticeTab({ kit, id }: { kit: Kit; id: string }) {
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
        <p className="mt-1 text-sm text-muted-foreground" role="status">
          {summary ? `${summary.covered}/${summary.total} cards covered (${progress}%)` : "Loading progress…"}
        </p>
        <div className="mx-auto mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="img" aria-label={`${progress}% covered`}>
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <Button size="lg" className="mt-5" onClick={start} disabled={kit.flashcards.length === 0}>
          Start a session
        </Button>
        {kit.flashcards.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Add flashcards first to practise.</p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    );
  }
  if (!current) return null;
  return (
    <section className="mx-auto max-w-xl rounded-xl border bg-card p-8" aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Card {index + 1} of {queue.length}
        </p>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((index + 1) / queue.length) * 100)}%` }} />
        </div>
      </div>
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

export function WeakTab({ id }: { id: string }) {
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
        {spots.map((s, i) => (
          <li key={s.requirementId} className="flex gap-3 rounded-xl border border-amber-500/40 bg-card p-4 text-sm">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700 dark:text-amber-400">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.requirementId}</span>
                <Badge variant="secondary">priority {s.score}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{s.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MockTab({ id }: { id: string }) {
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Question {idx + 1} of {session.questions.length}
            </p>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((idx + 1) / session.questions.length) * 100)}%` }} />
            </div>
          </div>
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
