export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchLike {
  search(query: string): Promise<SearchResult[]>;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/** Map a Brave Search API web response to our SearchResult shape (pure). */
export function mapBraveResponse(json: unknown): SearchResult[] {
  if (!json || typeof json !== "object") return [];
  const web = (json as { web?: { results?: unknown } }).web;
  if (!web || !Array.isArray(web.results)) return [];
  return web.results
    .filter((r): r is BraveWebResult & { url: string } => {
      if (!r || typeof r !== "object") return false;
      const u = (r as BraveWebResult).url;
      return typeof u === "string" && isHttpUrl(u);
    })
    .map((r) => ({
      title: String(r.title ?? ""),
      url: r.url,
      snippet: String(r.description ?? ""),
    }));
}

export interface SearchAdapterOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Brave Search API client. HTTP errors throw with a `retryable` flag. */
export function createSearch(apiKey: string, opts: SearchAdapterOptions = {}) {
  const base = opts.baseUrl ?? "https://api.search.brave.com/res/v1/web/search";
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async search(query: string): Promise<SearchResult[]> {
      const url = `${base}?q=${encodeURIComponent(query)}&count=5`;
      const res = await doFetch(url, {
        headers: { "X-Subscription-Token": apiKey, accept: "application/json" },
      });
      if (!res.ok) {
        const err = new Error(`brave search http ${res.status}`) as Error & {
          status: number;
          retryable: boolean;
        };
        err.status = res.status;
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      return mapBraveResponse(await res.json());
    },
  };
}

/** Deterministic search double for tests; records every query issued. */
export function createFakeSearch(
  results: (query: string) => SearchResult[] | Promise<SearchResult[]>,
): SearchLike & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async search(query: string) {
      queries.push(query);
      return results(query);
    },
  };
}
