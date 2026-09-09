import { JsonParseError, ProviderError, type LlmGenerateOpts, type LlmProvider } from "./provider.js";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini generateContent REST adapter (no SDK). Requests JSON output via
 * responseMimeType; HTTP 429/5xx throw retryable ProviderError; non-JSON or
 * empty model text throws JsonParseError (callers repair or fail-soft).
 */
export function createGeminiProvider(config: GeminiConfig): LlmProvider {
  const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const doFetch = config.fetchImpl ?? fetch;

  return {
    async generateJson<T>(opts: LlmGenerateOpts): Promise<T> {
      const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: opts.temperature ?? 0.2,
            },
          }),
        });
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted) throw new ProviderError("gemini request timed out", 0, true);
        throw new ProviderError(`gemini network error: ${(err as Error).message}`, 0, true);
      }
      clearTimeout(timer);
      if (!res.ok) {
        throw new ProviderError(`gemini http ${res.status}`, res.status, res.status === 429 || res.status >= 500);
      }
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        throw new JsonParseError("gemini returned a non-JSON error body");
      }
      const text = (payload as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })
        ?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new JsonParseError("gemini returned empty candidate text");
      }
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        throw new JsonParseError(`invalid json in model output: ${(err as Error).message}`);
      }
    },
  };
}
