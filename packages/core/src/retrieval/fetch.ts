export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  contentType: string;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  /** Content-type prefixes allowed, e.g. ["text/html", "text/plain"]. */
  allowedTypes?: string[];
}

const DEFAULTS = {
  timeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
  userAgent: "PrepKitBot/0.1 (+https://github.com/interview-prep-kit)",
  allowedTypes: ["text/html", "text/plain"],
};

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Fetch one page with hard caps. Never throws for a page-level problem:
 * HTTP errors, disallowed content types, oversized bodies, and timeouts are
 * returned as an `error`-bearing FetchedPage so callers can record-and-skip
 * a source without aborting the run.
 */
export function createFetcher(opts: FetchOptions = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  async function fetchHtml(url: string): Promise<FetchedPage> {
    const bad = (error: string, partial: Partial<FetchedPage> = {}): FetchedPage => ({
      url,
      finalUrl: url,
      status: 0,
      html: "",
      contentType: "",
      error,
      ...partial,
    });

    if (!isHttpUrl(url)) return bad("invalid url: must be absolute http(s)");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": cfg.userAgent, accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        redirect: "follow",
        signal: controller.signal,
      });
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!cfg.allowedTypes.includes(contentType)) {
        return bad(`unsupported content-type: ${contentType || "(none)"}`, {
          status: res.status,
          finalUrl: res.url,
          contentType,
        });
      }
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > cfg.maxBytes) {
        return bad("content too large (content-length exceeds cap)", {
          status: res.status,
          finalUrl: res.url,
          contentType,
        });
      }
      if (!res.ok) {
        return bad(`http ${res.status}`, { status: res.status, finalUrl: res.url, contentType });
      }
      const body = res.body;
      let html = "";
      if (body) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          if (html.length > cfg.maxBytes) {
            await reader.cancel().catch(() => undefined);
            return bad("content too large (stream exceeded cap)", {
              status: res.status,
              finalUrl: res.url,
              contentType,
            });
          }
        }
        html += decoder.decode();
      }
      return { url, finalUrl: res.url, status: res.status, html, contentType };
    } catch (err) {
      const aborted = controller.signal.aborted;
      return bad(aborted ? "request timed out" : `fetch failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return { fetchHtml };
}
