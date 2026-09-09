import {
  JsonParseError,
  ProviderError,
  type LlmGenerateOpts,
  type LlmProvider,
  type LlmUsage,
} from "../llm/provider.js";
import { withRetry, type RateLimiter } from "./rateLimit.js";

export interface ResilientProviderOptions {
  maxRetries?: number;
  rateLimiter?: RateLimiter;
}

/** Accumulates per-call usage stats reported by providers (observability). */
export class UsageRecorder {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  totalLatencyMs = 0;
  byStage = new Map<string, { calls: number; inputTokens: number; outputTokens: number }>();

  record(stage: string, usage: LlmUsage): void {
    this.calls += 1;
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.totalLatencyMs += usage.latencyMs;
    const s = this.byStage.get(stage) ?? { calls: 0, inputTokens: 0, outputTokens: 0 };
    s.calls += 1;
    s.inputTokens += usage.inputTokens;
    s.outputTokens += usage.outputTokens;
    this.byStage.set(stage, s);
  }

  summary(): string {
    return `${this.calls} call(s), ~${this.inputTokens + this.outputTokens} tokens, ${(this.totalLatencyMs / 1000).toFixed(1)}s LLM time`;
  }

  toJSON() {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      latencyMs: this.totalLatencyMs,
      byStage: Object.fromEntries(this.byStage),
    };
  }
}

export interface StageUsage {
  stage: string;
  recorder: UsageRecorder;
}

/**
 * Wraps a raw provider so every call gets the free-tier survival layer:
 * token-bucket pacing when a limiter is supplied, exponential backoff on
 * retryable ProviderErrors (429/5xx/timeouts/network), and one fresh attempt
 * when the model returns unparseable JSON (parse failures are usually a
 * transient draw). Everything else propagates for per-case fail-soft handling.
 * When a stage usage context is given, completed calls record token/latency
 * stats against the current stage label (mutate `stage` as the pipeline moves).
 */
export function createResilientProvider(
  base: LlmProvider,
  opts: ResilientProviderOptions = {},
  usage?: StageUsage,
): LlmProvider {
  const maxRetries = opts.maxRetries ?? 3;
  return {
    async generateJson<T>(call: LlmGenerateOpts): Promise<T> {
      const wrapped: LlmGenerateOpts = usage
        ? {
            ...call,
            onUsage: (u) => {
              usage.recorder.record(usage.stage, u);
              call.onUsage?.(u);
            },
          }
        : call;
      const attempt = async (): Promise<T> => {
        if (opts.rateLimiter) await opts.rateLimiter.acquire();
        return base.generateJson<T>(wrapped);
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
          return base.generateJson<T>(wrapped);
        }
        throw err;
      }
    },
  };
}
