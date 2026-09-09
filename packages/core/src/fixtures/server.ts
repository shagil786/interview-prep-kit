import { createServer, type Server } from "node:http";

export interface Route {
  status?: number;
  type?: string;
  body: string;
}

export interface FixtureServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Minimal HTTP fixture server for tests + the batch smoke run: a route map of
 * path -> {status, type, body}. Company fixtures built on this exercise the
 * real fetch/crawl/robots path against localhost (which the batch CLI allows).
 */
export function startFixtureServer(routes: Record<string, Route>): Promise<FixtureServer> {
  const server: Server = createServer((req, res) => {
    const route = routes[req.url ?? "/"] ?? { status: 404, type: "text/plain", body: "not found" };
    res.writeHead(route.status ?? 200, { "content-type": route.type ?? "text/html; charset=utf-8" });
    res.end(route.body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        reject(new Error("fixture server failed to bind"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

export function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

/** A small company site: homepage, about, careers (no hiring-process page). */
export function companySite(): Record<string, Route> {
  return {
    "/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /private\n" },
    "/": { body: htmlPage("Acme Inc - Home", `<p>Acme builds developer tools for API teams.</p><a href="/about">About</a><a href="/careers">Careers</a>`) },
    "/about": { body: htmlPage("About Acme", `<p>Founded in 2015, Acme serves 400 API teams worldwide.</p>`) },
    "/careers": { body: htmlPage("Careers at Acme", `<p>Open roles in engineering and design. Apply by email.</p>`) },
    "/private": { status: 500, body: "never fetched" },
  };
}

/** Same site plus a buried hiring-process handbook. */
export function companySiteWithHandbook(): Record<string, Route> {
  const base = companySite();
  base["/"] = { body: htmlPage("Acme Inc - Home", `<p>Acme builds developer tools for API teams.</p><a href="/about">About</a><a href="/inside">Inside Acme</a>`) };
  base["/inside"] = { body: htmlPage("Inside Acme", `<a href="/company/handbook">The Handbook</a>`) };
  base["/company/handbook"] = {
    body: htmlPage("The Handbook", `<p>Our interview process is a take-home project followed by a system design round.</p>`),
  };
  return base;
}
