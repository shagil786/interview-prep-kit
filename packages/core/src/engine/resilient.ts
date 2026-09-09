import { JsonParseError, ProviderError, type LlmGenerateOpts, type LlmProvider } from "../llm/provider.js";
import { withRetry, type RateLimiter } from "./rateLimit.js";

export interface ResilientProviderOptions {
  maxRetries?: number;
  rateLimiter?: RateLimiter;
}

/**
 * Wraps a raw provider so every call gets the free-tier survival layer:
 * token-bucket pacing when a limiter is supplied, exponential backoff on
 * retryable ProviderErrors (429/5xx/timeouts/network), and one fresh attempt
 * when the model returns unparseable JSON (parse failures are usually a
 * transient draw). Everything else propagates for per-case fail-soft handling.
 */
export function createResilientProvider(base: LlmProvider, opts: ResilientProviderOptions = {}): LlmProvider {
  const maxRetries = opts.maxRetries ?? 3;
  return {
    async generateJson<T>(call: LlmGenerateOpts): Promise<T> {
      const attempt = async (): Promise<T> => {
        if (opts.rateLimiter) await opts.rateLimiter.acquire();
        return base.generateJson<T>(call);
      };
      try {
        return await withRetry(attempt, {
          maxRetries,
          baseDelayMs: 1000,
          maxDelayMs: 16_000,
          isRetryable: (e) => e instanceof ProviderError && e.retryable,
        });
      } catch (err) {
        if (err instanceof JsonParseError) {
          if (opts.rateLimiter) await opts.rateLimiter.acquire();
          return base.generateJson<T>(call);
        }
        throw err;
      }
    },
  };
}
