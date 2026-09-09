import type { CrawledPage } from "../retrieval/crawler.js";
import type { FetchedPage } from "../retrieval/fetch.js";
import type { CleanedPage, PageRole } from "../retrieval/clean.js";
import type { SearchLike, SearchResult } from "../retrieval/search.js";

export interface ResearchFinding {
  pages_used: string[];
  what_they_do_excerpts: { url: string; text: string }[];
  hiring_process: { url: string; text: string } | null;
  discussion: { url: string; text: string }[];
  unknowns: string[];
}

export interface ResearchDeps {
  crawl(root: string): Promise<CrawledPage[]>;
  clean(html: string, url: string): CleanedPage;
  classify(url: string, title: string): PageRole;
  search: SearchLike;
  fetchHtml(url: string): Promise<FetchedPage>;
  /** True when the company host is private/loopback (nothing public exists). */
  isPrivateHost(hostname: string): boolean;
  excerptCapChars?: number;
}

const EXCERPT_CAP = 6000;
const MAX_DISCUSSION_FETCHES = 3;

function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, "").split(".")[0];
  } catch {
    return "";
  }
}

function shortExcerpt(text: string, cap: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, cap);
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return h === "::1" || h === "[::1]";
}

/**
 * Research stage (spec §5.1 steps 2-4): crawl the site, classify pages, pick
 * about/homepage excerpts and any hiring-process page, then search for public
 * discussion. Every failure is recorded in `unknowns`, never thrown — a page
 * that cannot be retrieved is skipped, not fatal. Search is skipped entirely
 * for private/loopback fixture hosts.
 */
export async function researchCompany(input: { company_url: string }, deps: ResearchDeps): Promise<ResearchFinding> {
  const cap = deps.excerptCapChars ?? EXCERPT_CAP;
  const unknowns: string[] = [];
  const pages_used: string[] = [];
  const what_they_do_excerpts: { url: string; text: string }[] = [];
  let hiring_process: { url: string; text: string } | null = null;

  let crawled: CrawledPage[] = [];
  try {
    crawled = await deps.crawl(input.company_url);
  } catch (err) {
    unknowns.push(`site crawl failed: ${(err as Error).message}`);
  }

  if (crawled.length === 0) {
    unknowns.push("company site yielded no retrievable pages");
  }

  // Classify and pick: what_they_do (homepage/about) and hiring process.
  const classified = crawled.map((p) => ({ page: p, role: deps.classify(p.url, p.title) }));
  const aboutish = classified
    .filter((c) => c.role === "homepage" || c.role === "about")
    .sort((a, b) => (a.role === "about" ? 1 : 0) - (b.role === "about" ? 1 : 0));
  for (const c of aboutish.slice(0, 2)) {
    const text = shortExcerpt(deps.clean(c.page.html, c.page.url).text, cap);
    if (!text) continue;
    what_they_do_excerpts.push({ url: c.page.url, text });
    pages_used.push(c.page.url);
  }
  const hiring = classified.find((c) => c.role === "hiring-process");
  if (hiring) {
    const text = shortExcerpt(deps.clean(hiring.page.html, hiring.page.url).text, cap);
    if (text) {
      hiring_process = { url: hiring.page.url, text };
      pages_used.push(hiring.page.url);
    }
  }

  // Public discussion of the company's interview process.
  const discussion: { url: string; text: string }[] = [];
  let hostname = "";
  try {
    hostname = new URL(input.company_url).hostname;
  } catch {
    /* recorded below via crawl failure */
  }
  if (hostname && (deps.isPrivateHost ? deps.isPrivateHost(hostname) : isPrivateHostname(hostname))) {
    unknowns.push("skipped public-discussion search for a local/private fixture host");
  } else {
    const company = hostLabel(input.company_url);
    const queries = company ? [`${company} interview process`, `${company} interview`] : [];
    for (const q of queries) {
      let results: SearchResult[] = [];
      try {
        results = await deps.search.search(q);
      } catch (err) {
        unknowns.push(`public discussion search failed: ${(err as Error).message}`);
        continue;
      }
      const known = new Set(crawled.map((p) => p.url));
      let fetches = 0;
      for (const r of results) {
        if (fetches >= MAX_DISCUSSION_FETCHES) break;
        if (known.has(r.url)) continue;
        known.add(r.url);
        const page = await deps.fetchHtml(r.url);
        if (page.error || !page.html) {
          unknowns.push(`discussion source unreachable: ${r.url}`);
          continue;
        }
        const text = shortExcerpt(deps.clean(page.html, r.url).text, cap);
        if (!text) continue;
        discussion.push({ url: r.url, text });
        pages_used.push(r.url);
        fetches += 1;
      }
    }
  }

  return { pages_used, what_they_do_excerpts, hiring_process, discussion, unknowns };
}

export { isPrivateHostname };
