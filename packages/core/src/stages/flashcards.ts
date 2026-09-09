import type { LlmProvider } from "../llm/provider.js";
import { PROMPTS } from "../llm/prompts.js";
import type { RequirementLike } from "./questions.js";

export interface DraftFlashcard {
  front: string;
  back: string;
  requirement_ids: string[];
}

/**
 * One call: flashcards covering must-have requirements and key facts behind the
 * generated questions. Output filtered to known requirement ids and non-empty
 * front/back. A single empty result is retried once (a model hiccup must not
 * hollow out a kit); a genuinely empty second result passes through.
 */
export async function generateFlashcards(
  args: { requirements: RequirementLike[]; questions: { id: string; prompt: string }[] },
  provider: LlmProvider,
): Promise<DraftFlashcard[]> {
  const { system, prompt } = PROMPTS.flashcards(args);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await provider.generateJson<{ flashcards?: { front?: unknown; back?: unknown; requirement_ids?: unknown }[] }>({
      system,
      prompt,
      maxTokens: 2500,
    });
    const out = normalize(raw, args.requirements);
    if (out.length > 0 || args.requirements.length === 0) return out;
  }
  return [];
}

function normalize(
  raw: { flashcards?: { front?: unknown; back?: unknown; requirement_ids?: unknown }[] },
  requirements: RequirementLike[],
): DraftFlashcard[] {
  if (!Array.isArray(raw.flashcards)) return [];
  const knownIds = new Set(requirements.map((r) => r.id));
  const out: DraftFlashcard[] = [];
  for (const f of raw.flashcards) {
    const front = typeof f?.front === "string" ? f.front.trim() : "";
    const back = typeof f?.back === "string" ? f.back.trim() : "";
    if (!front || !back) continue;
    const reqs = Array.isArray(f.requirement_ids)
      ? (f.requirement_ids.filter((id): id is string => typeof id === "string" && knownIds.has(id)) as string[])
      : [];
    if (reqs.length === 0) continue;
    out.push({ front, back, requirement_ids: Array.from(new Set(reqs)) });
  }
  return out.slice(0, 40);
}
