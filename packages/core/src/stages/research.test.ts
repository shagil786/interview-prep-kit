import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanHtml, classifyPage } from "../retrieval/clean.js";
import { crawlSite } from "../retrieval/crawler.js";
import { createFetcher } from "../retrieval/fetch.js";
import { clearRobotsCache, isAllowed, type TextFetcher } from "../retrieval/robots.js";
import { createFakeSearch } from "../retrieval/search.js";
import { researchCompany, type ResearchDeps } from "./research.js";

let server: Server;
let origin = "";
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
      send("Acme Inc - Home", `<p>Acme builds developer tools for API teams.</p><a href="/about">About</a><a href="/inside">Inside</a>`);
    } else if (u === "/about") {
      send("About Acme", `<p>Founded in 2015, Acme helps 400 companies ship faster.</p>`);
    } else if (u === "/inside") {
      send("Inside Acme", `<a href="/company/handbook">The Handbook</a>`);
    } else if (u === "/company/handbook") {
      send("The Handbook", `<p>Our interview process is a take-home project followed by a system design round.</p>`);
    } else if (u.startsWith("/private")) {
      res.writeHead(500);
      res.end("never");
    } else if (u === "/discussion") {
      send("Forum post", `<p>Candidates report the take-home takes about six hours.</p>`);
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

function makeDeps(overrides: Partial<ResearchDeps> = {}): ResearchDeps {
  const search = createFakeSearch(() => [{ title: "Discussion", url: `${origin}/discussion`, snippet: "s" }]);
  return {
    crawl: (root) => crawlSite(root, { fetchHtml: fetcher.fetchHtml, isAllowed: (u) => isAllowed(u, robotsFetcher), crawlDelayMs: async () => 0 }),
    clean: cleanHtml,
    classify: classifyPage,
    search,
    fetchHtml: fetcher.fetchHtml,
    isPrivateHost: () => false,
    ...overrides,
  };
}

describe("researchCompany", () => {
  it("crawls, finds the buried hiring-process page, and grounds excerpts", async () => {
    const finding = await researchCompany({ company_url: origin }, makeDeps());
    expect(finding.hiring_process?.url).toContain("/company/handbook");
    expect(finding.hiring_process?.text).toContain("take-home");
    expect(finding.what_they_do_excerpts.length).toBeGreaterThan(0);
    expect(finding.what_they_do_excerpts[0].text).toContain("Acme");
    expect(finding.pages_used).toContain(finding.hiring_process!.url);
  });

  it("skips the public-discussion search for a local fixture host and records it", async () => {
    const search = createFakeSearch(() => [{ title: "x", url: "https://example.test/1", snippet: "" }]);
    const finding = await researchCompany({ company_url: origin }, makeDeps({ search, isPrivateHost: () => true }));
    expect(search.queries).toEqual([]);
    expect(finding.discussion).toEqual([]);
    expect(finding.unknowns.join()).toContain("local/private fixture");
  });

  it("records an unreachable discussion source instead of failing", async () => {
    const search = createFakeSearch(() => [{ title: "x", url: `${origin}/missing`, snippet: "" }]);
    const finding = await researchCompany({ company_url: origin }, makeDeps({ search }));
    expect(finding.discussion).toEqual([]);
    expect(finding.unknowns.join()).toContain("discussion source unreachable");
    // The run still produced a kit-level finding.
    expect(finding.hiring_process).not.toBeNull();
  });

  it("filters generic non-company discussion results and records none-found honestly", async () => {
    // 127.0.0.1 host -> company token "127"; a career-centre URL lacks it.
    const search = createFakeSearch(() => [
      { title: "General interview tips", url: "https://careercentre.example/tips", snippet: "how to interview well" },
      { title: "Another generic", url: "https://blog.example/50-questions", snippet: "top questions" },
    ]);
    const finding = await researchCompany({ company_url: origin }, makeDeps({ search }));
    expect(finding.discussion).toEqual([]);
    expect(finding.unknowns.join()).toContain("no company-specific results");
  });
});
