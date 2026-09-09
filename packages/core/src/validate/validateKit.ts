import { kitSchema, type Kit } from "../schema/kit.js";
export function validateKit(input: unknown): string[] {
  const out: string[] = [];
  const parsed = kitSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
  const k = parsed.data as Kit;
  const reqIds = new Set(k.role.requirements.map(r => r.id));
  const qIds = new Set(k.questions.map(q => q.id));
  const dups = (a: string[]) => new Set(a.filter((x, i) => a.indexOf(x) !== i));
  if (dups(k.role.requirements.map(r => r.id)).size) out.push("duplicate requirement ids");
  if (dups(k.questions.map(q => q.id)).size) out.push("duplicate question ids");
  if (dups(k.flashcards.map(f => f.id)).size) out.push("duplicate flashcard ids");
  for (const q of k.questions) for (const rid of q.requirement_ids)
    if (!reqIds.has(rid)) out.push(`question ${q.id} references unknown requirement ${rid}`);
  for (const f of k.flashcards) for (const rid of f.requirement_ids)
    if (!reqIds.has(rid)) out.push(`flashcard ${f.id} references unknown requirement ${rid}`);
  for (const d of k.schedule.days) {
    if (d.day < 1 || d.day > k.schedule.days_available) out.push(`schedule day ${d.day} out of range`);
    for (const qid of d.question_ids) if (!qIds.has(qid)) out.push(`day ${d.day} references unknown question ${qid}`);
  }
  const days = new Set(k.schedule.days.map(d => d.day));
  if (days.size !== k.schedule.days_available || Math.min(...days) !== 1 || Math.max(...days) !== k.schedule.days_available)
    out.push(`schedule must have exactly days_available contiguous days`);
  const covered = new Set<string>();
  for (const q of k.questions) for (const rid of q.requirement_ids) covered.add(rid);
  const musts = k.role.requirements.filter(r => r.priority === "must").map(r => r.id);
  for (const rid of musts) if (!covered.has(rid) && !k.coverage.uncovered_requirement_ids.includes(rid))
    out.push(`must-have requirement ${rid} uncovered but not listed as uncovered`);
  for (const rid of k.coverage.uncovered_requirement_ids)
    if (covered.has(rid)) out.push(`coverage lists ${rid} as uncovered but it is covered`);
  return out;
}
