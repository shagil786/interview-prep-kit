// Deterministic id helpers for question regeneration (spec §7).
// remapKitQuestions rewires ONLY schedule.days[].question_ids against a
// replacement map; every other kit section (questions, flashcards, coverage,
// requirements, ...) is left untouched. Rebuilding kit.questions from the
// remapped schedule is the caller's job.
import type { Kit } from "../schema/kit.js";
import { appendId } from "../types/kit.js";

/** Next id in a `prefix`+counter sequence; delegates to appendId. */
export function nextId(ids: string[], prefix: string): string {
  return appendId(ids, prefix);
}

/**
 * Returns a shallow copy of `kit` whose schedule day arrays have old question
 * ids replaced (`{newId}`) or dropped (`null`). Pure: the input `kit` is never
 * mutated, and if no day references any mapped id the input is returned as-is.
 */
export function remapKitQuestions(
  kit: Kit,
  replacements: Map<string, { oldId: string; newId: string } | null>,
): Kit {
  // The map key is the authoritative oldId (required for null deletions, whose
  // value carries no id). Drop takes precedence over rename on a conflict.
  const rename = new Map<string, string>();
  const drop = new Set<string>();
  for (const [oldId, rep] of replacements) {
    if (rep === null) drop.add(oldId);
    else rename.set(oldId, rep.newId);
  }

  const touched = (ids: readonly string[]) => ids.some((id) => rename.has(id) || drop.has(id));
  if (!kit.schedule.days.some((d) => touched(d.question_ids))) return kit;

  const days = kit.schedule.days.map((day) => {
    if (!touched(day.question_ids)) return day;
    const question_ids: string[] = [];
    for (const id of day.question_ids) {
      if (drop.has(id)) continue;
      question_ids.push(rename.get(id) ?? id);
    }
    return { ...day, question_ids };
  });

  return { ...kit, schedule: { ...kit.schedule, days } };
}
