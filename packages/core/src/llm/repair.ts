import type { LlmProvider } from "./provider.js";

/**
 * One repair attempt: send the schema description, the offending output, and
 * the parse error back to the model asking for corrected JSON only.
 */
export async function repairJson<T>(
  provider: LlmProvider,
  schemaDesc: string,
  bad: string,
  error: string,
): Promise<T> {
  const system =
    "You repair malformed JSON produced by another model. Return ONLY the corrected JSON object " +
    "matching the schema description — no prose, no markdown fences.";
  const prompt = `Schema description:\n${schemaDesc}\n\nInvalid JSON received:\n${bad}\n\nParse error: ${error}\n\nReturn the corrected JSON only.`;
  return provider.generateJson<T>({ system, prompt, temperature: 0 });
}
