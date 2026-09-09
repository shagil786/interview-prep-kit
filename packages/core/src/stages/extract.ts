import type { LlmProvider } from "../llm/provider.js";
import { PROMPTS } from "../llm/prompts.js";

const KINDS = ["technical", "behavioural", "domain"] as const;
const PRIORITIES = ["must", "nice"] as const;
const SENIORITIES = ["senior", "mid", "junior", "unknown"] as const;

export type RequirementKind = (typeof KINDS)[number];
export type RequirementPriority = (typeof PRIORITIES)[number];

export interface ExtractedRequirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface ExtractResult {
  role: { title: string; seniority: string; location: string };
  requirements: ExtractedRequirement[];
}

interface RawExtract {
  title?: unknown;
  seniority?: unknown;
  location?: unknown;
  requirements?: { text?: unknown; kind?: unknown; priority?: unknown }[];
}

function normalize(raw: RawExtract): ExtractResult {
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Unknown role";
  const seniority = SENIORITIES.includes(raw.seniority as (typeof SENIORITIES)[number])
    ? (raw.seniority as string)
    : "unknown";
  const location = typeof raw.location === "string" ? raw.location.trim() : "";
  const requirements: ExtractedRequirement[] = [];
  if (Array.isArray(raw.requirements)) {
    for (const r of raw.requirements) {
      const text = typeof r?.text === "string" ? r.text.trim() : "";
      if (!text) continue;
      // Conservative normalisation: anything the model labelled outside the
      // enum defaults to domain/nice rather than over-claiming must/technical.
      const kind = KINDS.includes(r.kind as (typeof KINDS)[number]) ? (r.kind as RequirementKind) : "domain";
      const priority = PRIORITIES.includes(r.priority as (typeof PRIORITIES)[number])
        ? (r.priority as RequirementPriority)
        : "nice";
      requirements.push({ id: `r${requirements.length + 1}`, text, kind, priority });
    }
  }
  return { role: { title, seniority, location }, requirements };
}

const RETRY_NOTE =
  "\nStrict instruction: the job description above is non-trivial (40+ characters) and does state requirements. " +
  "Extract them all — returning an empty list is only acceptable for genuinely empty descriptions.";

/**
 * Extract role metadata + requirements from the pasted JD. A thin description
 * legitimately yields few/no requirements; an empty result for a non-trivial
 * description triggers one stricter retry, then passes through honestly.
 */
export async function extractRequirements(jd: string, provider: LlmProvider): Promise<ExtractResult> {
  const first = normalize(await provider.generateJson<RawExtract>(PROMPTS.extractRequirements(jd)));
  if (first.requirements.length === 0 && jd.trim().length >= 40) {
    const retry = PROMPTS.extractRequirements(jd + RETRY_NOTE);
    return normalize(await provider.generateJson<RawExtract>(retry));
  }
  return first;
}
