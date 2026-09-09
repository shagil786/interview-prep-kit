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
 * front/back.
 */
export async function generateFlashcards(
  args: { requirements: RequirementLike[]; questions: { id: string; prompt: string }[] },
  provider: LlmProvider,
): Promise<DraftFlashcard[]> {
  const { system, prompt } = PROMPTS.flashcards(args);
  const raw = await provider.generateJson<{ flashcards?: { front?: unknown; back?: unknown; requirement_ids?: unknown }[] }>({
    system,
    prompt,
  });
  if (!Array.isArray(raw.flashcards)) return [];

  const knownIds = new Set(args.requirements.map((r) => r.id));
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
