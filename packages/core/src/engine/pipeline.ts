import type { LlmProvider } from "../llm/provider.js";
import type { FetchedPage } from "../retrieval/fetch.js";
import { crawlSite } from "../retrieval/crawler.js";
import { cleanHtml, classifyPage } from "../retrieval/clean.js";
import type { SearchLike } from "../retrieval/search.js";
import { isAllowed, crawlDelayFor, type TextFetcher } from "../retrieval/robots.js";
import { appendId } from "../types/kit.js";
import type { Kit } from "../schema/kit.js";
import { validateKit } from "../validate/validateKit.js";
import { extractRequirements, type ExtractedRequirement } from "../stages/extract.js";
import { researchCompany, isPrivateHostname, type ResearchFinding } from "../stages/research.js";
import { generateBrief, type BriefResult } from "../stages/brief.js";
import {
  categoriesFor,
  generateQuestionsForCategory,
  type DraftQuestion,
  type QuestionCategory,
  type RequirementLike,
} from "../stages/questions.js";
import { generateFlashcards } from "../stages/flashcards.js";
import { runCoverageLoop } from "../stages/cover.js";
import { balanceEmptyCategories, findDuplicatePairs, pickKeep } from "../stages/balance.js";
import { buildSchedule } from "../schedule/schedule.js";
import { Job } from "./job.js";
import { createResilientProvider } from "./resilient.js";
import type { RateLimiter } from "./rateLimit.js";

export type PipelineErrorCode =
  | "COMPANY_UNREACHABLE"
  | "GENERATION_FAILED"
  | "INVALID_KIT"
  | "PROVIDER_RATE_LIMITED";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  constructor(code: PipelineErrorCode, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

export interface CaseInput {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface PipelineDeps {
  provider: LlmProvider;
  search: SearchLike;
  fetchHtml(url: string): Promise<FetchedPage>;
  /** Optional overrides (tests inject stubs). Defaults respect robots.txt. */
  isAllowed?: (url: URL) => Promise<boolean>;
  crawlDelayMs?: () => Promise<number>;
  isPrivateHost?: (hostname: string) => boolean;
  /** Shared free-tier pacing. When supplied, every LLM call first acquires a token. */
  rateLimiter?: RateLimiter;
  onProgress?: (job: Job) => void;
}

function companyLabel(companyUrl: string): string {
  try {
    const host = new URL(companyUrl).hostname.toLowerCase().replace(/^www\./, "");
    const first = host.split(".")[0] || "unknown-company";
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return "Unknown company";
  }
}

function toRequirementLike(r: ExtractedRequirement): RequirementLike {
  return { id: r.id, text: r.text, kind: r.kind, priority: r.priority };
}

/**
 * The full kit pipeline: extract -> research -> brief -> per-category questions
 * -> coverage loop -> duplicate trim -> balance -> schedule -> validate.
 * The exact same function powers the API job runner and `npm run evaluate`.
 */
export async function runPipeline(input: CaseInput, deps: PipelineDeps): Promise<{ kit: Kit; job: Job }> {
  const job = new Job();
  const progress = () => deps.onProgress?.(job);

  let url: URL;
  try {
    url = new URL(input.company_url);
  } catch {
    throw new PipelineError("COMPANY_UNREACHABLE", `invalid company url: ${input.company_url}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PipelineError("COMPANY_UNREACHABLE", `unsupported company url scheme: ${url.protocol}`);
  }

  // Default retrieval seams honour robots.txt (per-origin cached by the robots module).
  const textFetcher: TextFetcher = {
    async fetchText(target) {
      const page = await deps.fetchHtml(target);
      return { status: page.status, text: page.error ? "" : page.html, error: page.error };
    },
  };
  const isAllowedFn = deps.isAllowed ?? (async (u: URL) => isAllowed(u, textFetcher));
  const delayFn = deps.crawlDelayMs ?? (async () => crawlDelayFor(url, textFetcher));
  const isPrivate = deps.isPrivateHost ?? isPrivateHostname;

  // Free-tier survival layer: pacing + backoff on retryable errors + one fresh
  // draw on parse failures — applied to every LLM call in this pipeline.
  const provider = createResilientProvider(deps.provider, { rateLimiter: deps.rateLimiter });

  job.begin("extract", "Extracting requirements from the job description");
  const extracted = await extractRequirements(input.jd, provider);
  const requirements = extracted.requirements.map(toRequirementLike);
  job.succeed(`${requirements.length} requirement(s) extracted`);
  progress();

  job.begin("research", "Crawling the company site and searching public discussion");
  const research: ResearchFinding = await researchCompany(
    { company_url: input.company_url },
    {
      crawl: (root) =>
        crawlSite(root, { fetchHtml: deps.fetchHtml, isAllowed: isAllowedFn, crawlDelayMs: delayFn }),
      clean: cleanHtml,
      classify: classifyPage,
      search: deps.search,
      fetchHtml: deps.fetchHtml,
      isPrivateHost: isPrivate,
    },
  );
  const hiringNote = research.hiring_process
    ? `found hiring process at ${research.hiring_process.url}`
    : "no hiring-process page found";
  job.succeed(`${research.pages_used.length} page(s) used; ${hiringNote}`);
  progress();

  job.begin("brief", "Writing the company brief");
  const brief: BriefResult = await generateBrief(research, provider);
  job.succeed();
  progress();

  job.begin("questions", "Generating questions per category");
  const categories = categoriesFor(requirements, research);
  const adapter = (category: QuestionCategory, targets: RequirementLike[]) =>
    generateQuestionsForCategory(
      {
        category,
        requirements: targets.length > 0 ? targets : requirements,
        seniority: extracted.role.seniority,
        hiringProcess: research.hiring_process,
        companyExcerpts: research.what_they_do_excerpts,
      },
      provider,
    );

  let questions: DraftQuestion[] = [];
  for (const category of categories) {
    questions.push(...(await adapter(category, [])));
  }

  // Second pass: close must-coverage gaps with targeted calls (code decides).
  const loop = await runCoverageLoop({
    requirements,
    questions,
    generate: async (category, targets) => {
      const full = targets
        .map((t) => requirements.find((r) => r.id === t.id))
        .filter((r): r is RequirementLike => r !== undefined);
      return adapter(category, full);
    },
  });
  questions = loop.questions;

  // Trim generated duplicates (same requirement set + near-identical text).
  const tmpId = (i: number) => `tmp${i}`;
  const pairs = findDuplicatePairs(
    questions.map((q, i) => ({ id: tmpId(i), requirement_ids: q.requirement_ids, prompt: q.prompt })),
  );
  const difficulties = questions.map((q, i) => ({ id: tmpId(i), difficulty: q.difficulty }));
  const dropIndexes = new Set<number>();
  for (const [a, b] of pairs) {
    const keep = pickKeep([a, b], difficulties);
    const loser = keep === a ? b : a;
    dropIndexes.add(Number(loser.slice(3)));
  }
  questions = questions.filter((_, i) => !dropIndexes.has(i));

  // Balance: one targeted call per justified-but-empty category.
  const balanced = await balanceEmptyCategories({
    categories,
    questions,
    requirements,
    hiringProcess: research.hiring_process,
    companyExcerpts: research.what_they_do_excerpts,
    generate: (category, targets) => {
      const full = targets
        .map((t) => requirements.find((r) => r.id === t.id))
        .filter((r): r is RequirementLike => r !== undefined);
      return adapter(category, full);
    },
  });
  questions = [...questions, ...balanced];
  job.succeed(`${questions.length} question(s) generated`);
  progress();

  // Assign stable ids; flashcards and schedule reference them afterwards.
  const qIds: string[] = [];
  const questionsWithIds = questions.map((q) => {
    const id = appendId(qIds, "q");
    qIds.push(id);
    return { ...q, id };
  });

  const covered = new Set<string>();
  for (const q of questionsWithIds) for (const rid of q.requirement_ids) covered.add(rid);
  const coverageUncovered = requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);

  job.begin("flashcards", "Generating flashcards");
  const draftFlashcards = await generateFlashcards(
    { requirements, questions: questionsWithIds.map((q) => ({ id: q.id, prompt: q.prompt })) },
    provider,
  );
  const fIds: string[] = [];
  const flashcards = draftFlashcards.map((f) => {
    const id = appendId(fIds, "f");
    fIds.push(id);
    return { ...f, id };
  });
  job.succeed(`${flashcards.length} flashcard(s)`);
  progress();

  job.begin("schedule", "Allocating the study schedule");
  const schedule = buildSchedule({ requirements, questions: questionsWithIds, days: input.days });
  job.succeed(`${schedule.days.length} day(s) allocated`);
  progress();

  const kit: Kit = {
    source: {
      company: companyLabel(input.company_url),
      company_url: input.company_url,
      role: extracted.role.title,
      location: extracted.role.location,
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: research.pages_used,
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: brief.sources,
      unknowns: brief.unknowns,
    },
    role: {
      title: extracted.role.title,
      seniority: extracted.role.seniority,
      responsibilities: [],
      requirements: requirements.map((r) => ({ id: r.id, text: r.text, kind: r.kind, priority: r.priority })),
    },
    questions: questionsWithIds.map((q) => ({
      id: q.id,
      requirement_ids: q.requirement_ids,
      category: q.category,
      prompt: q.prompt,
      answer_outline: q.answer_outline,
      difficulty: q.difficulty,
    })),
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverageUncovered,
      passes: loop.passes,
    },
  };

  job.begin("validate", "Validating kit structure");
  const violations = validateKit(kit);
  if (violations.length > 0) {
    job.fail(violations.join("; "));
    progress();
    throw new PipelineError("INVALID_KIT", violations.join("; "));
  }
  job.succeed("kit valid");
  progress();

  return { kit, job };
}
