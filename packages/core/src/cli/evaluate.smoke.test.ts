/**
 * Real-LLM timing smoke test. Skipped unless RUN_SMOKE=1 (needs GEMINI_API_KEY
 * + BRAVE_API_KEY). Validates that the full evaluate path completes against
 * real local fixture sites and that every ok kit validates — the acceptance
 * bar for the assessment's 5-cases-in-15-minutes requirement.
 */
import { describe, expect, it } from "vitest";
import { runBatch } from "./evaluate.js";
import { createGeminiProvider } from "../llm/gemini.js";
import { createSearch } from "../retrieval/search.js";
import { createFetcher } from "../retrieval/fetch.js";
import { TokenBucketLimiter } from "../engine/rateLimit.js";
import { companySite, companySiteWithHandbook, startFixtureServer } from "../fixtures/server.js";
import { validateKit } from "../validate/validateKit.js";
import type { PipelineDeps } from "../engine/pipeline.js";

const enabled = process.env.RUN_SMOKE === "1";
describe.skipIf(!enabled)("evaluate smoke (real LLM, RUN_SMOKE=1)", () => {
  it(
    "runs several cases end-to-end and returns only valid kits",
    async () => {
      expect(process.env.GEMINI_API_KEY, "GEMINI_API_KEY required").toBeTruthy();
      const srvA = await startFixtureServer(companySiteWithHandbook());
      const srvB = await startFixtureServer(companySite());
      try {
        const provider = createGeminiProvider({
          apiKey: process.env.GEMINI_API_KEY!,
          model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        });
        const rpm = Number(process.env.PREP_RPM ?? 12) || 12;
        const limiter = new TokenBucketLimiter({ capacity: Math.max(4, Math.floor(rpm / 3)), refillPerSec: rpm / 60 });
        const fetcher = createFetcher();
        const deps: PipelineDeps = {
          provider,
          search: createSearch(process.env.BRAVE_API_KEY ?? ""),
          fetchHtml: fetcher.fetchHtml,
          rateLimiter: limiter,
        };
        const startedAt = Date.now();
        const out = await runBatch(
          [
            {
              id: "case-smoke-a",
              jd: "Senior Backend Engineer. Kubernetes expertise to run our platform, GraphQL API design, and ownership of services end to end. Bonus for mentoring.",
              company_url: srvA.url,
              days: 5,
            },
            {
              id: "case-smoke-b",
              jd: "Two lines: we need a React developer who cares about testing and works well with product managers.",
              company_url: srvB.url,
              days: 2,
            },
          ],
          deps,
          (line) => console.log(line),
        );
        const elapsed = Date.now() - startedAt;
        console.log(`smoke run took ${Math.round(elapsed / 1000)}s`);
        expect(elapsed).toBeLessThan(15 * 60 * 1000);
        for (const entry of out.kits) {
          expect(entry.status, JSON.stringify(entry.error)).toBe("ok");
          if (entry.kit) expect(validateKit(entry.kit)).toEqual([]);
        }
      } finally {
        await srvA.close();
        await srvB.close();
      }
    },
    20 * 60 * 1000,
  );
});
