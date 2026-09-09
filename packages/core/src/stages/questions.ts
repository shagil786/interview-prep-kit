import type { LlmProvider } from "../llm/provider.js";
import { PROMPTS } from "../llm/prompts.js";

export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export const QUESTION_CATEGORIES: QuestionCategory[] = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];

export interface DraftQuestion {
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: number;
}

export interface RequirementLike {
  id: string;
  text: string;
  kind: "technical" | "behavioural" | "domain";
  priority: "must" | "nice";
}

const SYSTEM_DESIGN_HINTS = /\b(system design|architecture|scalab|distributed|senior|staff|principal)\b/i;

/**
 * Deterministic evidence rule (spec §5.1 step 5): which question categories a
 * kit deserves. Never invents a category the requirements + research do not
 * support — a marketing JD does not get system-design questions.
 */
export function categoriesFor(
  requirements: { text: string; kind: string }[],
  finding: { hiring_process: { text: string } | null; what_they_do_excerpts: unknown[] },
): QuestionCategory[] {
  const wanted = new Set<QuestionCategory>();
  const kinds = new Set(requirements.map((r) => r.kind));
  if (kinds.has("technical") || kinds.has("domain")) wanted.add("technical");
  if (kinds.has("behavioural")) wanted.add("behavioural");
  const hintText = requirements.map((r) => r.text).join(" ") + " " + (finding.hiring_process?.text ?? "");
  if (SYSTEM_DESIGN_HINTS.test(hintText)) wanted.add("system-design");
  if (finding.hiring_process !== null || finding.what_they_do_excerpts.length > 0) {
    wanted.add("company-fit");
  }
  return QUESTION_CATEGORIES.filter((c) => wanted.has(c));
}

interface RawQuestion {
  requirement_ids?: unknown;
  prompt?: unknown;
  answer_outline?: unknown;
  difficulty?: unknown;
}

function normalizeDifficulty(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : 2;
}

/**
 * One LLM call per category, seeded by the relevant requirements (verbatim ids)
 * and, where evidence exists, the hiring process + company excerpts. Output is
 * filtered to the known requirement ids and cleaned: no invented targets, no
 * empty prompts/outlines, difficulty clamped to 1-3.
 */
export async function generateQuestionsForCategory(
  args: {
    category: QuestionCategory;
    requirements: RequirementLike[];
    seniority?: string;
    hiringProcess?: { url: string; text: string } | null;
    companyExcerpts?: { url: string; text: string }[];
  },
  provider: LlmProvider,
): Promise<DraftQuestion[]> {
  const { system, prompt } = PROMPTS.questionsFor({
    category: args.category,
    requirements: args.requirements,
    seniority: args.seniority,
    hiringProcessText: args.hiringProcess?.text,
    companyExcerpts: args.companyExcerpts,
  });
  const raw = await provider.generateJson<{ questions?: RawQuestion[] }>({ system, prompt });
  if (!Array.isArray(raw.questions)) return [];

  const knownIds = new Set(args.requirements.map((r) => r.id));
  const out: DraftQuestion[] = [];
  for (const q of raw.questions) {
    const promptText = typeof q?.prompt === "string" ? q.prompt.trim() : "";
    const outline = typeof q?.answer_outline === "string" ? q.answer_outline.trim() : "";
    if (!promptText || !outline) continue;
    const reqs = Array.isArray(q.requirement_ids)
      ? (q.requirement_ids.filter((id): id is string => typeof id === "string" && knownIds.has(id)) as string[])
      : [];
    if (reqs.length === 0) continue;
    out.push({
      requirement_ids: Array.from(new Set(reqs)),
      category: args.category,
      prompt: promptText,
      answer_outline: outline,
      difficulty: normalizeDifficulty(q.difficulty),
    });
  }
  return out.slice(0, 12);
}
