"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedSave } from "./use-debounced-save";
import { ProvenanceBadges } from "./shared";
import type { Flashcard, ItemMeta, Kit } from "./types";

export function FlashcardsTab(props: {
  kit: Kit;
  metaOf: (fid: string) => ItemMeta;
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, metaOf, saveEdit, askRegen } = props;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          Flashcards{" "}
          <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {kit.flashcards.length}
          </span>
        </h2>
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
      {kit.flashcards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No flashcards yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add one by hand or regenerate the set.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kit.flashcards.map((f) => (
            <FlashcardRow key={f.id} f={f} meta={metaOf(f.id)} saveEdit={saveEdit} />
          ))}
        </ul>
      )}
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
    <li className="group rounded-xl border bg-gradient-to-b from-card to-muted/30 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Card</span>
        <div className="flex items-center gap-1">
          <div className="flex flex-wrap gap-1"><ProvenanceBadges meta={meta} /></div>
          <Button variant={meta.pinned ? "secondary" : "ghost"} size="sm" onClick={() => void saveEdit({ type: "pin", kind: "flashcard", id: f.id, pinned: !meta.pinned })}>
            {meta.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void saveEdit({ type: "deleteFlashcard", id: f.id })}>
            Delete
          </Button>
        </div>
      </div>
      <Input aria-label="Front" defaultValue={f.front} onChange={(e) => debounceFront(e.target.value)} className="mt-2 border-0 bg-transparent px-0 font-medium shadow-none focus-visible:ring-1" />
      <div className="my-2 h-px bg-border" aria-hidden />
      <Textarea aria-label="Back" defaultValue={f.back} onChange={(e) => debounceBack(e.target.value)} rows={2} className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-1" />
    </li>
  );
}
