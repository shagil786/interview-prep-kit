import {
  createFakeSearch,
  createFetcher,
  createResilientProvider,
  createSearch,
  providerFromEnv,
  TokenBucketLimiter,
  type LlmProvider,
  type PipelineDeps,
  type RateLimiter,
  type SearchLike,
} from "@prep/core";

export interface EnvServices {
  /** Resilient provider for standalone stage calls (e.g. mock scoring). */
  provider: LlmProvider;
  /** Raw provider; runPipeline applies its own resilient wrapper + rateLimiter. */
  rawProvider: LlmProvider;
  search: SearchLike;
  fetchHtml: PipelineDeps["fetchHtml"];
  rateLimiter: RateLimiter;
}

/** Single app-wide rate limiter so every job shares the free-tier budget. */
const sharedLimiter = new TokenBucketLimiter({
  capacity: 8,
  refillPerSec: (Number(process.env.PREP_RPM ?? 12) || 12) / 60,
});

/** Build provider/search/fetch from env, mirroring the CLI's defaults. */
export function envServices(env: NodeJS.ProcessEnv = process.env): EnvServices {
  const braveKey = env.BRAVE_API_KEY?.trim();
  const rawProvider: LlmProvider = providerFromEnv(env);
  const provider = createResilientProvider(rawProvider, { rateLimiter: sharedLimiter });
  const search: SearchLike = braveKey ? createSearch(braveKey) : createFakeSearch(() => []);
  return {
    provider,
    rawProvider,
    search,
    fetchHtml: createFetcher().fetchHtml,
    rateLimiter: sharedLimiter,
  };
}

export function pipelineDepsFromEnv(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  const services = envServices(env);
  // Raw provider: runPipeline wraps it once with the resilient layer + limiter.
  return { provider: services.rawProvider, search: services.search, fetchHtml: services.fetchHtml, rateLimiter: services.rateLimiter };
}
