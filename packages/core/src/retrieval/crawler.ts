import * as cheerio from "cheerio";
import type { FetchedPage } from "./fetch.js";
import { isInternal, scoreLink } from "./score.js";

export interface CrawledPage {
  url: string;
  title: string;
  html: string;
  score: number;
  depth: number;
}

export interface CrawlerDeps {
  fetchHtml(url: string): Promise<FetchedPage>;
  isAllowed(url: URL): Promise<boolean>;
  /** Wait before the next request; the caller controls politeness/robots delay. */
  crawlDelayMs(): Promise<number>;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
}

const DEFAULTS: Required<CrawlOptions> = { maxPages: 40, maxDepth: 3 };

interface FrontierItem {
  url: string;
  score: number;
  depth: number;
}

function normalized(href: string): string {
  const u = new URL(href);
  u.hash = "";
  return u.href;
}

/**
 * BFS crawl of one origin. The frontier is re-ranked by link score at every
 * level, so relevant pages (careers/hiring/about) are fetched early even when
 * the site buries them at unpredictable paths. robots.txt is respected via
 * `isAllowed`; fetch errors skip the page rather than aborting the crawl.
 * Deterministic: same inputs + same server state => same output order.
 */
export async function crawlSite(root: string, deps: CrawlerDeps, opts: CrawlOptions = {}): Promise<CrawledPage[]> {
  const { maxPages, maxDepth } = { ...DEFAULTS, ...opts };
  const rootUrl = new URL(root);
  if (rootUrl.protocol !== "http:" && rootUrl.protocol !== "https:") {
    throw new TypeError("crawlSite requires an http(s) root URL");
  }

  const pages: CrawledPage[] = [];
  const seen = new Set<string>();
  const frontier: FrontierItem[] = [{ url: rootUrl.href, score: 0, depth: 0 }];

  while (frontier.length > 0 && pages.length < maxPages) {
    frontier.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    const item = frontier.shift()!;
    const key = normalized(item.url);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!(await deps.isAllowed(new URL(key)))) continue;
    await deps.crawlDelayMs();
    const page = await deps.fetchHtml(key);
    if (page.error || !page.html) continue;

    const $ = cheerio.load(page.html);
    pages.push({
      url: key,
      title: $("title").first().text().trim(),
      html: page.html,
      score: item.score,
      depth: item.depth,
    });
    if (item.depth >= maxDepth) continue;

    const queued = new Set(frontier.map((f) => normalized(f.url)));
    const children: FrontierItem[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (!isInternal(rootUrl, href)) return;
      let abs: URL;
      try {
        abs = new URL(href, rootUrl);
      } catch {
        return;
      }
      const childKey = normalized(abs.href);
      if (seen.has(childKey) || queued.has(childKey)) return;
      children.push({
        url: childKey,
        score: scoreLink($(el).text().trim(), childKey),
        depth: item.depth + 1,
      });
    });
    // Deterministic: push children sorted by score so the stable sort above is enough.
    children.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    frontier.push(...children);
  }

  return pages;
}
