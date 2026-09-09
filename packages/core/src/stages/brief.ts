import type { LlmProvider } from "../llm/provider.js";
import { PROMPTS } from "../llm/prompts.js";
import type { ResearchFinding } from "./research.js";

export interface BriefResult {
  summary: string;
  what_they_do: string;
  sources: string[];
  unknowns: string[];
}

const HONEST_STUB: BriefResult = {
  summary: "No retrievable information about this company.",
  what_they_do: "",
  sources: [],
  unknowns: ["company site and public discussion could not be retrieved"],
};

interface RawBrief {
  summary?: unknown;
  what_they_do?: unknown;
  sources?: unknown;
  unknowns?: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Grounded company brief. Only excerpts actually fetched are handed to the
 * model; model-declared sources are intersected with those real URLs so the
 * brief can never cite a page that was not used. If nothing was retrievable
 * at all, an honest stub is returned without calling the provider.
 */
export async function generateBrief(finding: ResearchFinding, provider: LlmProvider): Promise<BriefResult> {
  const pages = [
    ...finding.what_they_do_excerpts,
    ...(finding.hiring_process ? [finding.hiring_process] : []),
    ...finding.discussion,
  ];
  if (pages.length === 0) {
    return {
      ...HONEST_STUB,
      unknowns: finding.unknowns.length > 0 ? finding.unknowns : HONEST_STUB.unknowns,
    };
  }

  const { system, prompt } = PROMPTS.companyBrief(pages);
  const raw = await provider.generateJson<RawBrief>({ system, prompt });

  const realUrls = new Set(pages.map((p) => p.url));
  const sources = Array.isArray(raw.sources)
    ? (raw.sources.filter((s): s is string => typeof s === "string" && realUrls.has(s)) as string[])
    : [];

  const modelUnknowns = Array.isArray(raw.unknowns)
    ? raw.unknowns.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  const unknowns = Array.from(new Set([...finding.unknowns, ...modelUnknowns]));

  const summary = isNonEmptyString(raw.summary) ? raw.summary.trim() : HONEST_STUB.summary;
  const what_they_do = isNonEmptyString(raw.what_they_do) ? raw.what_they_do.trim() : "";

  return { summary, what_they_do, sources, unknowns };
}
