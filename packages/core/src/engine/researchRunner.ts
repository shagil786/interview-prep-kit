import { crawlSite } from "../retrieval/crawler.js";
import { cleanHtml, classifyPage } from "../retrieval/clean.js";
import { isAllowed, crawlDelayFor, type TextFetcher } from "../retrieval/robots.js";
import { researchCompany, isPrivateHostname, type ResearchFinding } from "../stages/research.js";
import type { PipelineDeps } from "./pipeline.js";

type ResearchDeps = Pick<PipelineDeps, "search" | "fetchHtml" | "isAllowed" | "crawlDelayMs" | "isPrivateHost">;

/**
 * Research helper for callers that need the research trail without a full kit
 * run (API regeneration). Robots.txt defaults mirror runPipeline's seams.
 */
export async function runResearch(companyUrl: string, deps: ResearchDeps): Promise<ResearchFinding> {
  let origin: URL;
  try {
    origin = new URL(companyUrl);
  } catch {
    origin = new URL("http://invalid.invalid");
  }
  const textFetcher: TextFetcher = {
    async fetchText(target) {
      const page = await deps.fetchHtml(target);
      return { status: page.status, text: page.error ? "" : page.html, error: page.error };
    },
  };
  const isAllowedFn = deps.isAllowed ?? (async (u: URL) => isAllowed(u, textFetcher));
  const delayFn = deps.crawlDelayMs ?? (async () => crawlDelayFor(origin, textFetcher));
  return researchCompany(
    { company_url: companyUrl },
    {
      crawl: (root) => crawlSite(root, { fetchHtml: deps.fetchHtml, isAllowed: isAllowedFn, crawlDelayMs: delayFn }),
      clean: cleanHtml,
      classify: classifyPage,
      search: deps.search,
      fetchHtml: deps.fetchHtml,
      isPrivateHost: deps.isPrivateHost ?? isPrivateHostname,
    },
  );
}
