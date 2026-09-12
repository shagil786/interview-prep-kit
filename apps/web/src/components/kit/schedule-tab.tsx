"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useDebouncedSave } from "./use-debounced-save";
import type { Day, Kit } from "./types";

export function ScheduleTab(props: {
  kit: Kit;
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, saveEdit, askRegen } = props;
  const dayQuestions = (day: Day) => day.question_ids.map((qid) => kit.questions.find((q) => q.id === qid)?.prompt ?? qid);
  const totalMinutes = kit.schedule.days.reduce((a, d) => a + d.minutes, 0);
  const maxMinutes = Math.max(1, ...kit.schedule.days.map((d) => d.minutes));
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
      <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[27px] before:w-px before:bg-border">
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="relative rounded-xl border bg-card p-4 pl-14 text-sm">
            <span
              aria-hidden
              className="absolute top-4 left-4 grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >
              {d.day}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <FocusEditor day={d} saveEdit={saveEdit} />
              <span className="ml-auto text-muted-foreground">
                {d.question_ids.length} question(s) · {d.minutes} min
              </span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`Day ${d.day}: ${d.minutes} minutes`}
            >
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round((d.minutes / maxMinutes) * 100)}%` }} />
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
      className="w-full max-w-xs border-0 bg-transparent px-0 font-medium shadow-none focus-visible:ring-1"
    />
  );
}

export function ScheduleEmpty() {
  return (
    <Badge variant="secondary">No schedule yet</Badge>
  );
}
