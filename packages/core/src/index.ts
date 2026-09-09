// Public surface of @prep/core — shared by apps/api and the batch CLI.
export { appendId } from "./types/kit.js";
export * from "./schema/kit.js";
export * from "./schema/case.js";
export { validateKit } from "./validate/validateKit.js";
export { Job, type JobStep, type StageStatus } from "./engine/job.js";
export { TokenBucketLimiter, withRetry, type RateLimiter, type RetryOptions } from "./engine/rateLimit.js";
export { createFetcher, type FetchedPage, type FetchOptions } from "./retrieval/fetch.js";
export { createSearch, createFakeSearch, mapBraveResponse, type SearchLike, type SearchResult } from "./retrieval/search.js";
export { createYouSearch, mapYouResponse, type YouSearchConfig } from "./retrieval/youSearch.js";
export { searchFromEnv, type SearchFromEnv, type SearchProviderKind } from "./retrieval/searchFactory.js";
export { isAllowed, crawlDelayFor, type TextFetcher } from "./retrieval/robots.js";
export { JsonParseError, ProviderError, type LlmGenerateOpts, type LlmProvider } from "./llm/provider.js";
export { createGeminiProvider, type GeminiConfig } from "./llm/gemini.js";
export { createOpenAICompatibleProvider, type OpenAICompatibleConfig } from "./llm/openaiCompatible.js";
export { providerFromEnv, DEFAULT_GEMINI_MODEL, DEFAULT_OPENAI_MODEL, type LlmProviderKind } from "./llm/factory.js";
export { createFakeProvider } from "./llm/fake.js";
export { PROMPTS, dataBlock, UNTRUSTED_PREAMBLE } from "./llm/prompts.js";
export { repairJson } from "./llm/repair.js";
export { runResearch } from "./engine/researchRunner.js";
export { researchCompany, isPrivateHostname, type ResearchFinding } from "./stages/research.js";
export { generateBrief, type BriefResult } from "./stages/brief.js";
export {
  categoriesFor,
  generateQuestionsForCategory,
  QUESTION_CATEGORIES,
  type DraftQuestion,
  type QuestionCategory,
  type RequirementLike,
} from "./stages/questions.js";
export { generateFlashcards, type DraftFlashcard } from "./stages/flashcards.js";
export { runCoverageLoop, type CoverageLoopResult, type GapGenerator } from "./stages/cover.js";
export { balanceEmptyCategories, findDuplicatePairs, pickKeep } from "./stages/balance.js";
export { extractRequirements, type ExtractResult, type ExtractedRequirement } from "./stages/extract.js";
export { buildSchedule, type Schedule, type ScheduleDay, type ScheduleInput } from "./schedule/schedule.js";
export { findUncovered } from "./coverage/coverage.js";
export { createResilientProvider, type ResilientProviderOptions } from "./engine/resilient.js";
export { PipelineError, runPipeline, type CaseInput, type PipelineDeps, type PipelineErrorCode } from "./engine/pipeline.js";
