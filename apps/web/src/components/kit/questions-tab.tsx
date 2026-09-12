"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedSave } from "./use-debounced-save";
import { DifficultyDots, ProvenanceBadges } from "./shared";
import { CATEGORIES, type ItemMeta, type Kit, type Question } from "./types";

export function QuestionsTab(props: {
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

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: kit.questions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => q.category === cat),
  })).filter((g) => g.items.length > 0);
  const ungrouped = kit.questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => !(CATEGORIES as readonly string[]).includes(q.category));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Questions{" "}
          <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {kit.questions.length}
          </span>
        </h2>
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

      {[...grouped, ...(ungrouped.length ? [{ cat: "other", items: ungrouped }] : [])].map((group) => (
        <div key={group.cat}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold capitalize text-muted-foreground">{group.cat}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {group.items.length}
            </span>
            <div className="h-px flex-1 bg-border" aria-hidden />
            <Button variant="ghost" size="sm" onClick={() => askRegen({ scope: "questions-category", category: group.cat })}>
              Regenerate category
            </Button>
          </div>
          <ul className="space-y-3">
            {group.items.map(({ q, index }) => (
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
              />
            ))}
          </ul>
        </div>
      ))}
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
}) {
  const { q, kit, meta, canUp, canDown, onSave, onMove, onDelete, onPin, onMoveCategory } = props;
  const [showOutline, setShowOutline] = useState(false);
  const debouncePrompt = useDebouncedSave((v: string) => onSave({ prompt: v }));
  const debounceOutline = useDebouncedSave((v: string) => onSave({ answer_outline: v }));
  const covered = q.requirement_ids.map((rid) => kit.role.requirements.find((r) => r.id === rid)?.text ?? rid);

  return (
    <li className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
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
        <DifficultyDots level={q.difficulty} />
        <ProvenanceBadges meta={meta} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant={meta.pinned ? "secondary" : "ghost"} size="sm" onClick={onPin}>
            {meta.pinned ? "Unpin" : "Pin"}
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
