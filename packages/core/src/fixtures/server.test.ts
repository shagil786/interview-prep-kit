import { describe, expect, it } from "vitest";
import { createFetcher } from "../retrieval/fetch.js";
import { clearRobotsCache, isAllowed, type TextFetcher } from "../retrieval/robots.js";
import { crawlSite } from "../retrieval/crawler.js";
import { companySiteWithHandbook, startFixtureServer } from "./server.js";

const robotsFetcher: TextFetcher = {
  async fetchText(url) {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  },
};

describe("fixture server", () => {
  it("serves a crawlable company site with a buried hiring handbook", async () => {
    const srv = await startFixtureServer(companySiteWithHandbook());
    try {
      clearRobotsCache();
      const fetcher = createFetcher();
      const pages = await crawlSite(srv.url, {
        fetchHtml: fetcher.fetchHtml,
        isAllowed: async (u) => isAllowed(u, robotsFetcher),
        crawlDelayMs: async () => 0,
      });
      const urls = pages.map((p) => p.url);
      expect(urls).toContain(`${srv.url}/company/handbook`);
      expect(urls.some((u) => u.includes("/private"))).toBe(false);
    } finally {
      await srv.close();
    }
  });
});
