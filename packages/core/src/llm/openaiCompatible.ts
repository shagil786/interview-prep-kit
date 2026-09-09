import { JsonParseError, ProviderError, type LlmGenerateOpts, type LlmProvider } from "./provider.js";

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Adapter for OpenAI-compatible chat-completions endpoints (OpenRouter, Groq,
 * Mistral, APInex, ...). Requests JSON via response_format json_object — the
 * same structured-output contract every pipeline stage depends on. HTTP
 * 429/5xx/timeouts/network throw retryable ProviderError; empty or unparseable
 * model text throws JsonParseError (callers re-draw or fail-soft).
 */
export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LlmProvider {
  const base = config.baseUrl.replace(/\/$/, "");
  const doFetch = config.fetchImpl ?? fetch;

  return {
    async generateJson<T>(opts: LlmGenerateOpts): Promise<T> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await doFetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.prompt },
            ],
            temperature: opts.temperature ?? 0.2,
            response_format: { type: "json_object" },
          }),
        });
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted) throw new ProviderError("provider request timed out", 0, true);
        throw new ProviderError(`provider network error: ${(err as Error).message}`, 0, true);
      }
      clearTimeout(timer);

      if (!res.ok) {
        throw new ProviderError(`provider http ${res.status}`, res.status, res.status === 429 || res.status >= 500);
      }
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        throw new JsonParseError("provider returned a non-JSON error body");
      }
      const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message
        ?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new JsonParseError("provider returned empty content");
      }
      try {
        return JSON.parse(content) as T;
      } catch (err) {
        throw new JsonParseError(`invalid json in model output: ${(err as Error).message}`);
      }
    },
  };
}
