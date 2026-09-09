import type { DraftQuestion, QuestionCategory, RequirementLike } from "./questions.js";

/** Deterministic duplicate detection + category-balance for a question draft. */

function normalizedText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(s: string): Set<string> {
  return new Set(s.length ? s.split(" ") : []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Near-duplicate generated questions: same requirement set + ≥0.9 text overlap. */
export function findDuplicatePairs(
  questions: { id: string; requirement_ids: string[]; prompt: string }[],
): [string, string][] {
  const sig = (ids: string[]) => Array.from(new Set(ids)).sort().join("|");
  const words = new Map<string, Set<string>>();
  for (const q of questions) words.set(q.id, wordSet(normalizedText(q.prompt)));

  const pairs: [string, string][] = [];
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const a = questions[i];
      const b = questions[j];
      if (sig(a.requirement_ids) !== sig(b.requirement_ids)) continue;
      if (jaccard(words.get(a.id)!, words.get(b.id)!) >= 0.9) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/** Keep the higher-difficulty question; ties keep the first in array order. */
export function pickKeep(pair: [string, string], questions: { id: string; difficulty: number }[]): string {
  const diff = (id: string) => questions.find((q) => q.id === id)?.difficulty ?? 0;
  return diff(pair[0]) >= diff(pair[1]) ? pair[0] : pair[1];
}

/** Best-fit requirements to target a category (deterministic: must first, then longer text). */
function targetsFor(
  category: QuestionCategory,
  requirements: RequirementLike[],
): { id: string; text: string; kind: "technical" | "behavioural" | "domain" }[] {
  const eligible = requirements.filter((r) => {
    if (category === "behavioural") return r.kind === "behavioural";
    if (category === "company-fit") return true;
    // technical + system-design serve technical/domain requirements.
    return r.kind === "technical" || r.kind === "domain";
  });
  const ranked = [...eligible].sort((a, b) => {
    const pa = a.priority === "must" ? 1 : 0;
    const pb = b.priority === "must" ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.text.length - a.text.length;
  });
  return ranked.slice(0, 3);
}

/**
 * Balance pass (spec §5.4): for each justified category that ended with zero
 * questions, make one targeted generation call against its best-fit
 * requirements. Categories that are NOT justified are never created here (the
 * caller passes the `categoriesFor` output); a still-empty result is left
 * empty — a thin honest kit beats a padded one.
 */
export async function balanceEmptyCategories(args: {
  categories: QuestionCategory[];
  questions: DraftQuestion[];
  requirements: RequirementLike[];
  hiringProcess?: { url: string; text: string } | null;
  companyExcerpts?: { url: string; text: string }[];
  generate: (
    category: QuestionCategory,
    targets: { id: string; text: string; kind: "technical" | "behavioural" | "domain" }[],
  ) => Promise<DraftQuestion[]>;
}): Promise<DraftQuestion[]> {
  const present = new Set(args.questions.map((q) => q.category));
  const missing = args.categories.filter((c) => !present.has(c));
  const added: DraftQuestion[] = [];
  for (const category of missing) {
    const generated = await args.generate(category, targetsFor(category, args.requirements));
    for (const q of generated) {
      if (q.category === category) added.push(q);
    }
  }
  return added;
}
