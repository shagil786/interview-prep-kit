import {
  createFakeSearch,
  createFetcher,
  createGeminiProvider,
  createResilientProvider,
  createSearch,
  TokenBucketLimiter,
  type LlmProvider,
  type PipelineDeps,
  type RateLimiter,
  type SearchLike,
} from "@prep/core";

export interface EnvServices {
  provider: LlmProvider;
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
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const braveKey = env.BRAVE_API_KEY?.trim();
  const rawProvider: LlmProvider = createGeminiProvider({
    apiKey: geminiKey ?? "",
    model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  });
  const provider = createResilientProvider(rawProvider, { rateLimiter: sharedLimiter });
  const search: SearchLike = braveKey ? createSearch(braveKey) : createFakeSearch(() => []);
  return {
    provider,
    search,
    fetchHtml: createFetcher().fetchHtml,
    rateLimiter: sharedLimiter,
  };
}

export function pipelineDepsFromEnv(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  const services = envServices(env);
  return { provider: services.provider, search: services.search, fetchHtml: services.fetchHtml, rateLimiter: services.rateLimiter };
}
