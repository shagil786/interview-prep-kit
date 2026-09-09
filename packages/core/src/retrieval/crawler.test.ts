import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FetchedPage } from "./fetch.js";
import { createFetcher } from "./fetch.js";
import { clearRobotsCache, isAllowed, type TextFetcher } from "./robots.js";
import { crawlSite } from "./crawler.js";

let server: Server;
let origin = "";
const fetched: string[] = [];

const fetcher = createFetcher();
const robotsFetcher: TextFetcher = {
  async fetchText(url) {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = req.url ?? "/";
    const send = (title: string, body: string) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);
    };
    if (u === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow: /private\n");
    } else if (u === "/") {
      send("Acme - Home", `<a href="/about">About</a><a href="/blog">Engineering blog</a><a href="/inside">Inside Acme</a><a href="/company/">Company</a>`);
    } else if (u === "/inside") {
      send("Inside Acme", `<a href="/careers">Careers</a><a href="/about">About</a>`);
    } else if (u === "/company/") {
      send("Company", `<a href="handbook">The Handbook</a>`);
    } else if (u === "/company/handbook") {
      send("Handbook", `<p>Interview process: take-home then system design.</p>`);
    } else if (u === "/careers") {
      send("Careers", `<a href="/about">About</a>`);
    } else if (u === "/about") {
      send("About", `<a href="/private">Secret</a><a href="/careers">Careers</a>`);
    } else if (u === "/blog") {
      send("Blog", `<a href="/about">About</a>`);
    } else if (u.startsWith("/private")) {
      res.writeHead(500);
      res.end("should never be fetched");
    } else {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") origin = `http://127.0.0.1:${addr.port}`;
  clearRobotsCache();
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function deps() {
  return {
    fetchHtml: async (url: string): Promise<FetchedPage> => {
      fetched.push(url);
      return fetcher.fetchHtml(url);
    },
    isAllowed: async (url: URL) => isAllowed(url, robotsFetcher),
    crawlDelayMs: async () => 0,
  };
}

describe("crawlSite", () => {
  it("finds a hiring page buried two levels deep, past an unpredictable path", async () => {
    fetched.length = 0;
    const pages = await crawlSite(`${origin}/`, deps());
    const urls = pages.map((p) => p.url);
    expect(urls).toContain(`${origin}/`);
    expect(urls).toContain(`${origin}/company/handbook`);
    expect(urls).toContain(`${origin}/careers`);
    const handbook = pages.find((p) => p.url.endsWith("/company/handbook"));
    expect(handbook?.html).toContain("take-home");
  });

  it("finds a hiring page reachable only through a bare relative link on a subdirectory page", async () => {
    fetched.length = 0;
    const pages = await crawlSite(`${origin}/`, deps());
    const urls = pages.map((p) => p.url);
    // `/company/` links `handbook` (relative); only per-page resolution reaches `/company/handbook`.
    expect(urls).toContain(`${origin}/company/`);
    expect(urls).toContain(`${origin}/company/handbook`);
    expect(fetched.some((u) => u.endsWith("/handbook"))).toBe(true);
    expect(fetched.some((u) => u === `${origin}/handbook`)).toBe(false);
  });

  it("never fetches a robots-disallowed path even when linked", async () => {
    fetched.length = 0;
    await crawlSite(`${origin}/`, deps());
    expect(fetched.some((u) => u.includes("/private"))).toBe(false);
  });

  it("respects maxPages", async () => {
    fetched.length = 0;
    const pages = await crawlSite(`${origin}/`, deps(), { maxPages: 3 });
    expect(pages.length).toBeLessThanOrEqual(3);
  });

  it("extracts titles and records depth", async () => {
    fetched.length = 0;
    const pages = await crawlSite(`${origin}/`, deps());
    const home = pages.find((p) => new URL(p.url).pathname === "/");
    expect(home?.title).toBe("Acme - Home");
    expect(home?.depth).toBe(0);
  });
});
