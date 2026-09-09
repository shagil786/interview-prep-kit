import type { Kit } from "@prep/core";

export interface PracticeEntry {
  card_id: string;
  confidence: 1 | 2 | 3;
  at: string;
}

export interface WeakSpot {
  requirementId: string;
  reason: string;
  questionIds: string[];
  score: number;
}

/**
 * Weak-spots report (creative feature): ranks requirements by how much they
 * need work before the interview. Uncovered musts dominate; then uncovered
 * nice requirements; then requirements whose practice confidence is lowest.
 * Pure and deterministic; tie-break by the hardest attached question.
 */
export function computeWeakSpots(kit: Kit, practice: PracticeEntry[]): { spots: WeakSpot[] } {
  const covered = new Set<string>();
  for (const q of kit.questions) for (const rid of q.requirement_ids) covered.add(rid);

  const lastConfidence = new Map<string, number>();
  const cardReqs = new Map<string, string[]>(); // card_id -> requirement ids
  for (const f of kit.flashcards) cardReqs.set(f.id, f.requirement_ids);
  const byCard: Record<string, PracticeEntry[]> = {};
  for (const p of practice) (byCard[p.card_id] ??= []).push(p);
  for (const [cardId, entries] of Object.entries(byCard)) {
    const last = entries[entries.length - 1];
    for (const rid of cardReqs.get(cardId) ?? []) lastConfidence.set(rid, last.confidence);
  }

  const questionIdsFor = (rid: string): string[] => kit.questions.filter((q) => q.requirement_ids.includes(rid)).map((q) => q.id);
  const hardest = (rid: string): number =>
    Math.max(0, ...kit.questions.filter((q) => q.requirement_ids.includes(rid)).map((q) => q.difficulty));

  const spots: WeakSpot[] = [];
  for (const r of kit.role.requirements) {
    const questions = questionIdsFor(r.id);
    const conf = lastConfidence.get(r.id);
    let score = 0;
    let reason = "";
    if (r.priority === "must" && !covered.has(r.id)) {
      score = 100;
      reason = "Must-have requirement with no question covering it";
    } else if (!covered.has(r.id)) {
      score = 60;
      reason = "Requirement with no question covering it";
    } else if (conf !== undefined && conf <= 1.5) {
      score = 50 + Math.round((3 - conf) * 10);
      reason = `Lowest practice confidence (${conf}/3)`;
    } else if (conf === undefined) {
      score = 20 + Math.min(20, questions.length * 5);
      reason = "No practice attempt recorded";
    } else {
      score = 10;
      reason = "Practised with reasonable confidence";
    }
    if (score >= 40) {
      spots.push({ requirementId: r.id, reason, questionIds: questions, score: score + hardest(r.id) });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  return { spots };
}
