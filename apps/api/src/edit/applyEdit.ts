import { appendId, type Kit } from "@prep/core";
import { ensureFlashcard, ensureQuestion, type Overlay } from "./overlay.js";

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;

export type KitEdit =
  | { type: "upsertQuestion"; question: { requirement_ids: string[]; category: string; prompt: string; answer_outline: string; difficulty: number }; oldId?: string }
  | { type: "deleteQuestion"; id: string }
  | { type: "moveQuestionCategory"; id: string; category: string }
  | { type: "reorderQuestions"; orderedIds: string[] }
  | { type: "upsertFlashcard"; flashcard: { front: string; back: string; requirement_ids: string[] }; oldId?: string }
  | { type: "deleteFlashcard"; id: string }
  | { type: "updateBrief"; brief: { summary: string; what_they_do: string } }
  | { type: "updateDay"; day: number; patch: { focus?: string; minutes?: number } }
  | { type: "pin"; kind: "question" | "flashcard"; id: string; pinned: boolean };

export interface ApplyResult {
  kit: Kit;
  overlay: Overlay;
}

const qId = (ids: string[]) => appendId(ids, "q");
const fId = (ids: string[]) => appendId(ids, "f");

function updateInPlace<T extends { id: string }>(items: T[], id: string, patch: Partial<T>): boolean {
  const item = items.find((x) => x.id === id);
  if (!item) return false;
  Object.assign(item, patch);
  return true;
}

/**
 * Apply one builder edit to the canonical kit + provenance overlay. Editing a
 * question marks it edited_by_user so regeneration never replaces it; deleting
 * a question removes it from every schedule day (spec §6.3 remap by deletion).
 */
const EDIT_TYPES = new Set([
  "upsertQuestion", "deleteQuestion", "moveQuestionCategory", "reorderQuestions",
  "upsertFlashcard", "deleteFlashcard", "updateBrief", "updateDay", "pin",
]);

export function isKitEdit(value: unknown): value is KitEdit {
  const v = value as { type?: unknown } | null;
  return !!v && typeof v.type === "string" && EDIT_TYPES.has(v.type);
}

export function applyEdit(kit: Kit, overlay: Overlay, edit: KitEdit): ApplyResult {
  const nextOverlay: Overlay = {
    brief: overlay.brief,
    questions: { ...overlay.questions },
    flashcards: { ...overlay.flashcards },
  };
  const qIdsNow = kit.questions.map((x) => x.id);
  const fIdsNow = kit.flashcards.map((x) => x.id);

  switch (edit.type) {
    case "upsertQuestion": {
      if (edit.oldId) {
        const exists = kit.questions.some((x) => x.id === edit.oldId);
        if (!exists) return { kit, overlay };
        updateInPlace(kit.questions, edit.oldId, edit.question as Kit["questions"][number]);
        const meta = ensureQuestion(nextOverlay, edit.oldId, "generated");
        meta.edited_by_user = true;
      } else {
        const id = qId(qIdsNow);
        qIdsNow.push(id);
        kit.questions.push({ id, ...(edit.question as Omit<Kit["questions"][number], "id">) });
        ensureQuestion(nextOverlay, id, "user");
      }
      break;
    }
    case "deleteQuestion": {
      const before = kit.questions.length;
      kit.questions = kit.questions.filter((x) => x.id !== edit.id);
      if (kit.questions.length === before) return { kit, overlay };
      for (const day of kit.schedule.days) {
        day.question_ids = day.question_ids.filter((x) => x !== edit.id);
      }
      delete nextOverlay.questions[edit.id];
      break;
    }
    case "moveQuestionCategory": {
      const q = kit.questions.find((x) => x.id === edit.id);
      if (!q || !(CATEGORIES as readonly string[]).includes(edit.category)) return { kit, overlay };
      q.category = edit.category as Kit["questions"][number]["category"];
      ensureQuestion(nextOverlay, edit.id, "generated").edited_by_user = true;
      break;
    }
    case "reorderQuestions": {
      const byId = new Map(kit.questions.map((x) => [x.id, x]));
      const asSet = new Set(edit.orderedIds);
      if (asSet.size !== edit.orderedIds.length || edit.orderedIds.some((id) => !byId.has(id))) {
        return { kit, overlay }; // not a permutation of the kit's ids
      }
      kit.questions = edit.orderedIds.map((id) => byId.get(id)!);
      break;
    }
    case "upsertFlashcard": {
      if (edit.oldId) {
        const exists = kit.flashcards.some((x) => x.id === edit.oldId);
        if (!exists) return { kit, overlay };
        updateInPlace(kit.flashcards, edit.oldId, edit.flashcard as Kit["flashcards"][number]);
        ensureFlashcard(nextOverlay, edit.oldId, "generated").edited_by_user = true;
      } else {
        const id = fId(fIdsNow);
        fIdsNow.push(id);
        kit.flashcards.push({ id, ...(edit.flashcard as Omit<Kit["flashcards"][number], "id">) });
        ensureFlashcard(nextOverlay, id, "user");
      }
      break;
    }
    case "deleteFlashcard": {
      const before = kit.flashcards.length;
      kit.flashcards = kit.flashcards.filter((x) => x.id !== edit.id);
      if (kit.flashcards.length === before) return { kit, overlay };
      delete nextOverlay.flashcards[edit.id];
      break;
    }
    case "updateBrief": {
      kit.company_brief.summary = edit.brief.summary;
      kit.company_brief.what_they_do = edit.brief.what_they_do;
      nextOverlay.brief = { origin: "generated", edited_by_user: true, pinned: false };
      break;
    }
    case "updateDay": {
      const day = kit.schedule.days.find((d) => d.day === edit.day);
      if (!day) return { kit, overlay };
      if (typeof edit.patch.focus === "string" && edit.patch.focus.trim()) day.focus = edit.patch.focus;
      if (typeof edit.patch.minutes === "number" && Number.isInteger(edit.patch.minutes) && edit.patch.minutes > 0) {
        day.minutes = edit.patch.minutes;
      }
      break;
    }
    case "pin": {
      const target = edit.kind === "question" ? nextOverlay.questions[edit.id] : nextOverlay.flashcards[edit.id];
      if (!target) return { kit, overlay };
      target.pinned = edit.pinned;
      break;
    }
  }
  return { kit, overlay: nextOverlay };
}
