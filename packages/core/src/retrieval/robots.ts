import robotsParserCjs, { type Robot } from "robots-parser";

// robots-parser ships CommonJS whose ambient typings use `export default`; under
// NodeNext ESM the default import is typed as the module namespace, so cast to
// the documented call signature (runtime shape is `module.exports = fn`).
const robotsParser = robotsParserCjs as unknown as (url: string, robotsTxt: string) => Robot;

export interface TextFetcher {
  fetchText(url: string): Promise<{ status: number; text: string; error?: string }>;
}

const UA = "PrepKitBot/0.1 (+https://github.com/interview-prep-kit)";
const CACHE_TTL_MS = 10 * 60 * 1000;

type RobotsEntry = { robots: Robot | null; at: number };
const cache = new Map<string, RobotsEntry>();

function cacheKey(origin: string): string {
  return origin.toLowerCase();
}

async function loadRobots(originUrl: URL, fetcher: TextFetcher): Promise<Robot | null> {
  const key = cacheKey(originUrl.origin);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.robots;

  const robotsUrl = new URL("/robots.txt", originUrl.origin).href;
  const res = await fetcher.fetchText(robotsUrl);
  let robots: Robot | null = null;
  if (!res.error && res.status < 400 && res.status > 0) {
    robots = robotsParser(robotsUrl, res.text);
  }
  cache.set(key, { robots, at: Date.now() });
  return robots;
}

/** True when robots.txt does not disallow the URL (missing rules => allowed). */
export async function isAllowed(url: URL, fetcher: TextFetcher): Promise<boolean> {
  const robots = await loadRobots(url, fetcher);
  if (!robots) return true;
  return robots.isAllowed(url.href, UA) !== false;
}

/** Declared Crawl-delay for our user agent in milliseconds (0 when unset). */
export async function crawlDelayFor(origin: URL, fetcher: TextFetcher): Promise<number> {
  const robots = await loadRobots(origin, fetcher);
  if (!robots) return 0;
  const secs = robots.getCrawlDelay(UA);
  return typeof secs === "number" && Number.isFinite(secs) && secs > 0 ? Math.round(secs * 1000) : 0;
}

/** Test hook: drop the per-origin robots cache. */
export function clearRobotsCache(): void {
  cache.clear();
}

