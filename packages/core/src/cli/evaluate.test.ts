import { describe, expect, it } from "vitest";
import { main, runBatch } from "./evaluate.js";
import { createFakeProvider } from "../llm/fake.js";
import type { LlmGenerateOpts } from "../llm/provider.js";
import { createFetcher } from "../retrieval/fetch.js";
import { createFakeSearch } from "../retrieval/search.js";
import { clearRobotsCache, isAllowed, type TextFetcher } from "../retrieval/robots.js";
import { companySite, startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { validateKit } from "../validate/validateKit.js";
import type { PipelineDeps } from "../engine/pipeline.js";

const robotsFetcher: TextFetcher = {
  async fetchText(url) {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  },
};

function fakeResponder(_index: number, opts: LlmGenerateOpts): unknown {
  const prompt = opts.prompt;
  if (prompt.includes('"flashcards"')) {
    return { flashcards: [{ front: "Q?", back: "A", requirement_ids: ["r1"] }] };
  }
  if (/Category: (\w+)/.test(prompt)) {
    const category = /Category: (\w+)/.exec(prompt)![1];
    const ids = Array.from(prompt.matchAll(/- (r\d+):/g)).map((m) => m[1]);
    return {
      questions: ids.map((id) => ({
        requirement_ids: [id],
        prompt: `${category} q for ${id}`,
        answer_outline: `outline ${id}`,
        difficulty: 2,
      })),
    };
  }
  const jdMatch = /<untrusted label="job-description">\n([\s\S]*?)\n<\/untrusted>/.exec(prompt);
  if (jdMatch && jdMatch[1].trim().length === 0) {
    return { title: "", requirements: [] };
  }
  return {
    title: "Backend Engineer",
    seniority: "mid",
    location: "",
    requirements: [
      { text: "Runs production services", kind: "technical", priority: "must" },
      { text: "Cross-team communication", kind: "behavioural", priority: "nice" },
    ],
  };
}

describe("main", () => {
  it("exits 2 with a usage error for bad flags", async () => {
    const logs: string[] = [];
    const code = await main(["--wat"], {}, (l) => logs.push(l));
    expect(code).toBe(2);
    expect(logs.join()).toContain("usage");
  });

  it("exits 2 when GEMINI_API_KEY is missing", async () => {
    const logs: string[] = [];
    const code = await main(["--input", "a.json", "--output", "b.json"], {}, (l) => logs.push(l));
    expect(code).toBe(2);
    expect(logs.join()).toContain("GEMINI_API_KEY");
  });
});

describe("runBatch", () => {
  it("writes ok kits for reachable cases and failed entries for unreachable ones", async () => {
    const srv: FixtureServer = await startFixtureServer(companySite());
    try {
      clearRobotsCache();
      const fetcher = createFetcher();
      const provider = createFakeProvider([fakeResponder]);
      const deps: PipelineDeps = {
        provider,
        search: createFakeSearch(() => []),
        fetchHtml: fetcher.fetchHtml,
        isAllowed: async (u) => isAllowed(u, robotsFetcher),
        crawlDelayMs: async () => 0,
      };
      const logs: string[] = [];
      const out = await runBatch(
        [
          { id: "case-01", jd: "Backend engineer needed to run production services reliably.", company_url: srv.url, days: 3 },
          { id: "case-02", jd: "Backend engineer needed to run production services reliably.", company_url: "ftp://acme.example", days: 2 },
        ],
        deps,
        (line) => logs.push(line),
      );

      expect(out.version).toBe("1.0");
      expect(out.kits).toHaveLength(2);
      const ok = out.kits.find((k) => k.id === "case-01");
      expect(ok?.status).toBe("ok");
      expect(ok?.kit && validateKit(ok.kit)).toEqual([]);
      const failed = out.kits.find((k) => k.id === "case-02");
      expect(failed?.status).toBe("failed");
      expect(failed?.kit).toBeNull();
      expect(failed?.error?.code).toBeDefined();
      expect(logs.some((l) => l.includes("[case-01] ok"))).toBe(true);
    } finally {
      await srv.close();
    }
  });
});
