import { findUncovered } from "../coverage/coverage.js";
import type { DraftQuestion, QuestionCategory, RequirementLike } from "./questions.js";

export type GapGenerator = (
  category: QuestionCategory,
  targets: { id: string; text: string; kind: "technical" | "behavioural" | "domain" }[],
  pass: number,
) => Promise<DraftQuestion[]>;

export interface CoverageLoopArgs {
  requirements: RequirementLike[];
  questions: DraftQuestion[];
  /** Gap-fill generator; injected so tests can drive it without a provider. */
  generate: GapGenerator;
  maxRepairPasses?: number;
}

export interface CoverageLoopResult {
  questions: DraftQuestion[];
  passes: number;
  uncovered: string[];
}

const KIND_TO_CATEGORY: Record<"technical" | "behavioural" | "domain", QuestionCategory> = {
  technical: "technical",
  domain: "technical",
  behavioural: "behavioural",
};

/**
 * Second-pass loop (spec §4/§5.1 step 7): after the draft, code computes which
 * must-have requirements have no question; each repair pass makes one targeted
 * generation call per affected category. Stops when no must is uncovered or the
 * max repair passes are exhausted — remaining gaps are reported honestly.
 */
export async function runCoverageLoop(args: CoverageLoopArgs): Promise<CoverageLoopResult> {
  const maxRepair = args.maxRepairPasses ?? 2;
  const requirements = args.requirements;
  const questions = [...args.questions];
  const musts = requirements.filter((r) => r.priority === "must");

  let passes = 1; // the draft generation round
  let uncovered = findUncovered(musts, questions);

  while (uncovered.length > 0 && passes - 1 < maxRepair) {
    passes += 1;
    // Group uncovered musts by the category their kind maps to.
    const byCategory = new Map<QuestionCategory, { id: string; text: string; kind: "technical" | "behavioural" | "domain" }[]>();
    for (const id of uncovered) {
      const req = musts.find((m) => m.id === id);
      if (!req) continue;
      const cat = KIND_TO_CATEGORY[req.kind] ?? "technical";
      const list = byCategory.get(cat) ?? [];
      list.push({ id: req.id, text: req.text, kind: req.kind });
      byCategory.set(cat, list);
    }
    for (const [category, targets] of byCategory) {
      const fresh = await args.generate(category, targets, passes);
      questions.push(...fresh);
    }
    uncovered = findUncovered(musts, questions);
  }

  const uncoveredAll = findUncovered(requirements, questions);
  return { questions, passes, uncovered: uncoveredAll };
}
