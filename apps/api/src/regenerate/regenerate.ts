import {
  appendId,
  buildSchedule,
  findUncovered,
  generateBrief,
  generateFlashcards,
  generateQuestionsForCategory,
  PipelineError,
  runResearch,
  validateKit,
  type Kit,
  type PipelineDeps,
  type QuestionCategory,
  type RequirementLike,
} from "@prep/core";
import { createResilientProvider, type ResearchFinding } from "@prep/core";
import { pipelineDepsFromEnv } from "../jobs/envDeps.js";
import { isReplaceable, type Overlay } from "../edit/overlay.js";

export type RegenerateScope = "brief" | "questions-category" | "flashcards" | "schedule";

function asRequirementLike(kit: Kit): RequirementLike[] {
  return kit.role.requirements.map((r) => ({ id: r.id, text: r.text, kind: r.kind, priority: r.priority }));
}

/**
 * Edit-preserving regeneration (spec §7). Only items that are generated,
 * untouched by the user and unpinned are replaced. User-written, user-edited
 * and pinned items always survive, as do edits in every other section.
 * References stay consistent because the schedule + coverage are recomputed
 * deterministically from the shipped question set afterwards.
 */
/** Stored research trail shape check — older docs (or partial writes) fall
 * back to a fresh crawl instead of breaking regeneration. */
export function isResearchFinding(value: unknown): value is ResearchFinding {
  const v = value as Partial<ResearchFinding> | null;
  return !!v && Array.isArray(v.pages_used) && Array.isArray(v.what_they_do_excerpts) && Array.isArray(v.unknowns);
}

export async function regenerate(
  kit: Kit,
  overlay: Overlay,
  input: { jd: string; company_url: string; days: number },
  scope: RegenerateScope,
  category?: QuestionCategory,
  deps?: PipelineDeps,
  storedResearch?: unknown,
): Promise<{ kit: Kit; overlay: Overlay }> {
  const next = structuredClone(kit) as Kit;
  const nextOverlay: Overlay = {
    brief: overlay.brief ? { ...overlay.brief } : undefined,
    questions: { ...overlay.questions },
    flashcards: { ...overlay.flashcards },
  };

  if (scope === "schedule") {
    next.schedule = buildSchedule({
      requirements: asRequirementLike(next),
      questions: next.questions,
      days: input.days,
    });
    finish(next);
    return { kit: next, overlay: nextOverlay };
  }

  const services = deps ?? pipelineDepsFromEnv();
  const provider = deps?.rateLimiter ? createResilientProvider(deps.provider, { rateLimiter: deps.rateLimiter }) : services.provider;
  // Reuse the research trail persisted by the generation job; re-crawl only
  // when it is missing (e.g. kits created before trails were stored).
  const research: ResearchFinding = isResearchFinding(storedResearch)
    ? storedResearch
    : await runResearch(input.company_url, services);

  if (scope === "brief") {
    const meta = nextOverlay.brief;
    if (!isReplaceable(meta)) return { kit, overlay }; // user-edited brief survives
    const brief = await generateBrief(research, provider);
    next.company_brief = { ...brief };
    nextOverlay.brief = { origin: "generated", edited_by_user: false, pinned: false };
    finish(next);
    return { kit: next, overlay: nextOverlay };
  }

  if (scope === "questions-category") {
    if (!category) throw new PipelineError("INVALID_INPUT", "category is required for a question regeneration");
    const requirements = asRequirementLike(next);
    const survivors = next.questions.filter((q) => q.category !== category || !isReplaceable(nextOverlay.questions[q.id]));
    const drafts = await generateQuestionsForCategory(
      {
        category,
        requirements,
        hiringProcess: research.hiring_process,
        companyExcerpts: research.what_they_do_excerpts,
      },
      provider,
    );
    const nextIds: string[] = [];
    for (const s of survivors) nextIds.push(s.id);
    for (const q of next.questions) if (!nextIds.includes(q.id)) nextIds.push(q.id);
    const allIds = next.questions.map((q) => q.id);
    const added: Kit["questions"] = [];
    for (const d of drafts) {
      if (d.category !== category) continue;
      const id = appendId(allIds, "q");
      allIds.push(id);
      added.push({ ...d, id });
      nextOverlay.questions[id] = { origin: "generated", edited_by_user: false, pinned: false };
    }
    for (const removed of next.questions.filter((q) => q.category === category && !survivors.includes(q))) {
      delete nextOverlay.questions[removed.id];
    }
    next.questions = [...survivors, ...added];
    finish(next);
    return { kit: next, overlay: nextOverlay };
  }

  if (scope === "flashcards") {
    const survivors = next.flashcards.filter((f) => !isReplaceable(nextOverlay.flashcards[f.id]));
    const drafts = await generateFlashcards(
      { requirements: asRequirementLike(next), questions: next.questions.map((q) => ({ id: q.id, prompt: q.prompt })) },
      provider,
    );
    const allIds = next.flashcards.map((f) => f.id);
    const added: Kit["flashcards"] = [];
    for (const d of drafts) {
      const id = appendId(allIds, "f");
      allIds.push(id);
      added.push({ ...d, id });
      nextOverlay.flashcards[id] = { origin: "generated", edited_by_user: false, pinned: false };
    }
    for (const removed of next.flashcards.filter((f) => !survivors.includes(f))) {
      delete nextOverlay.flashcards[removed.id];
    }
    next.flashcards = [...survivors, ...added];
    finish(next);
    return { kit: next, overlay: nextOverlay };
  }

  throw new PipelineError("INVALID_INPUT", `unknown regenerate scope: ${scope}`);
}

/** Deterministic consistency pass after any structural change. */
function finish(kit: Kit): void {
  kit.schedule = buildSchedule({
    requirements: kit.role.requirements.map((r) => ({ id: r.id, kind: r.kind, priority: r.priority })),
    questions: kit.questions,
    days: kit.schedule.days_available,
  });
  const covered = new Set<string>();
  for (const q of kit.questions) for (const rid of q.requirement_ids) covered.add(rid);
  kit.coverage = {
    uncovered_requirement_ids: findUncovered(
      kit.role.requirements.map((r) => ({ id: r.id, priority: r.priority })),
      kit.questions.map((q) => ({ requirement_ids: q.requirement_ids })),
    ).filter((id) => !covered.has(id)),
    passes: kit.coverage.passes,
  };
  const violations = validateKit(kit);
  if (violations.length > 0) throw new PipelineError("INVALID_KIT", violations.join("; "));
}
