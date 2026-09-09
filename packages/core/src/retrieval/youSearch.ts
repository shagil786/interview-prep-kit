import type { SearchLike, SearchResult } from "./search.js";

export interface YouSearchConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function firstString(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string") return v;
  }
  return "";
}

function asArray(rec: Record<string, unknown>, paths: string[]): unknown[] | null {
  for (const path of paths) {
    let cur: unknown = rec;
    let ok = true;
    for (const seg of path.split(".")) {
      if (!cur || typeof cur !== "object") {
        ok = false;
        break;
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
    if (ok && Array.isArray(cur)) return cur as unknown[];
  }
  return null;
}

/**
 * Defensive mapper for You.com-style web search payloads. You.com's response
 * shape has changed across versions, so this accepts the common containers
 * (web.results, results, hits, webResults) and item field spellings
 * (url + title/name + description/snippet/content).
 */
export function mapYouResponse(json: unknown): SearchResult[] {
  if (!json || typeof json !== "object") return [];
  const list = asArray(json as Record<string, unknown>, [
    // verified live: {"results":{"web":[{url,title,description,...}]}}
    "results.web", "web.results", "results", "hits", "webResults", "data.web.results", "data.results",
  ]);
  if (!list) return [];
  const out: SearchResult[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const url = firstString(rec, ["url", "link", "href"]);
    if (!isHttpUrl(url)) continue;
    out.push({
      url,
      title: firstString(rec, ["title", "name"]),
      snippet: firstString(rec, ["description", "snippet", "content", "snippetDescription"]),
    });
  }
  return out;
}

/**
 * You.com web-search REST adapter (v1/search). HTTP errors throw with a
 * `retryable` flag like the Brave adapter. NOTE: You.com's free tier is
 * currently served over MCP (api.you.com/mcp?profile=free, ~100 queries/day);
 * this REST adapter needs a paid API key unless the free REST tier returns.
 */
export function createYouSearch(config: YouSearchConfig): SearchLike {
  const base = (config.baseUrl ?? "https://api.you.com").replace(/\/$/, "");
  const doFetch = config.fetchImpl ?? fetch;
  return {
    async search(query: string): Promise<SearchResult[]> {
      const url = `${base}/v1/search?query=${encodeURIComponent(query)}&count=5&num_web_results=5`;
      const res = await doFetch(url, {
        headers: { "X-API-Key": config.apiKey, accept: "application/json" },
      });
      if (!res.ok) {
        const err = new Error(`you.com search http ${res.status}`) as Error & { status: number; retryable: boolean };
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      return mapYouResponse(await res.json());
    },
  };
}
