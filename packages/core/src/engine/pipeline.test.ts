import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeProvider } from "../llm/fake.js";
import type { LlmGenerateOpts } from "../llm/provider.js";
import { createFetcher } from "../retrieval/fetch.js";
import { clearRobotsCache, isAllowed, type TextFetcher } from "../retrieval/robots.js";
import { createFakeSearch } from "../retrieval/search.js";
import { validateKit } from "../validate/validateKit.js";
import { PipelineError, runPipeline, type PipelineDeps } from "./pipeline.js";

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
      send("Acme Inc - Home", `<p>Acme builds developer tools for API teams.</p><a href="/about">About</a><a href="/careers">Careers</a>`);
    } else if (u === "/about") {
      send("About Acme", `<p>Founded in 2015, Acme serves 400 API teams worldwide.</p>`);
    } else if (u === "/careers") {
      send("Careers at Acme", `<p>Open roles in engineering and design. Apply by email.</p>`);
    } else if (u === "/discussion") {
      send("Forum: Acme", `<p>Recent candidates enjoyed the take-home exercise.</p>`);
    } else if (u.startsWith("/private")) {
      res.writeHead(500);
      res.end("never");
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

/** Prompt-aware double: same shape as real stage calls, driven by prompt markers. */
function responder(_index: number, opts: LlmGenerateOpts): unknown {
  const prompt = opts.prompt;
  if (prompt.includes('"flashcards"')) {
    return { flashcards: [{ front: "Orchestrating containers?", back: "Kubernetes", requirement_ids: ["r1"] }] };
  }
  if (/Category: (technical|behavioural|system-design|company-fit)/.test(prompt)) {
    const category = /Category: (\w+)/.exec(prompt)![1];
    const ids = Array.from(prompt.matchAll(/- (r\d+):/g)).map((m) => m[1]);
    return {
      questions: ids.map((id) => ({
        requirement_ids: [id],
        prompt: `${category} question about ${id}`,
        answer_outline: `outline for ${id}`,
        difficulty: 2,
      })),
    };
  }
  // Extract branch: reflect a genuinely empty job description as no requirements.
  const jdMatch = /<untrusted label="job-description">\n([\s\S]*?)\n<\/untrusted>/.exec(prompt);
  const jdText = jdMatch ? jdMatch[1].trim() : prompt;
  if (jdText.length === 0) {
    return { title: "", seniority: "", location: "", requirements: [] };
  }
  return {
    title: "Senior Backend Engineer",
    seniority: "senior",
    location: "Remote",
    requirements: [
      { text: "Kubernetes expertise", kind: "technical", priority: "must" },
      { text: "GraphQL API design", kind: "technical", priority: "must" },
    ],
  };
}

function deps(): PipelineDeps {
  const search = createFakeSearch(() => [{ title: "Discussion", url: `${origin}/discussion`, snippet: "s" }]);
  const provider = createFakeProvider([responder]);
  return {
    provider,
    search,
    fetchHtml: fetcher.fetchHtml,
    isAllowed: async (u) => isAllowed(u, robotsFetcher),
    crawlDelayMs: async () => 0,
  };
}

const JD =
  "Senior Backend Engineer. We need someone with deep Kubernetes expertise to run our platform and " +
  "strong GraphQL API design skills. You will own services end to end.";

describe("runPipeline", () => {
  it("produces a valid, fully scheduled kit from a live fixture site", async () => {
    const snapshots: unknown[] = [];
    const d = deps();
    d.onProgress = (job) => snapshots.push(job.toJSON());
    const { kit, job } = await runPipeline(
      { id: "case-01", jd: JD, company_url: origin, days: 4 },
      d,
    );

    expect(validateKit(kit)).toEqual([]);
    expect(kit.schedule.days_available).toBe(4);
    expect(kit.schedule.days).toHaveLength(4);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBe(1);
    expect(kit.source.jd_chars).toBe(JD.length);
    expect(kit.source.pages_used.length).toBeGreaterThan(0);
    expect(kit.source.researched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kit.role.title).toBe("Senior Backend Engineer");
    const categories = new Set(kit.questions.map((q) => q.category));
    expect(categories.has("technical")).toBe(true);
    // every requirement referenced by at least one question
    for (const r of kit.role.requirements) {
      expect(kit.questions.some((q) => q.requirement_ids.includes(r.id))).toBe(true);
    }
    const stageStatuses = job.steps.map((s) => s.status);
    expect(stageStatuses).not.toContain("failed");
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("throws COMPANY_UNREACHABLE for a non-http scheme", async () => {
    await expect(
      runPipeline({ id: "case-02", jd: JD, company_url: "ftp://acme.example", days: 2 }, deps()),
    ).rejects.toMatchObject({ code: "COMPANY_UNREACHABLE" });
  });

  it("still produces an honest kit when the company site is unreachable", async () => {
    const { kit } = await runPipeline(
      { id: "case-03", jd: JD, company_url: "http://127.0.0.1:1/", days: 2 },
      deps(),
    );
    expect(validateKit(kit)).toEqual([]);
    expect(kit.company_brief.unknowns?.length).toBeGreaterThan(0);
    expect(kit.company_brief.summary).toContain("No retrievable information");
    expect(kit.source.pages_used).toEqual([]);
    // The schedule still spans the requested days.
    expect(kit.schedule.days).toHaveLength(2);
  });

  it("fails cleanly for a structurally empty job description", async () => {
    await expect(
      runPipeline({ id: "case-04", jd: "   ", company_url: origin, days: 3 }, deps()),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it("second pass: closes a must-gap the draft left and records passes 2", async () => {
    // Responder that, on the broad DRAFT call (several requirements listed),
    // only writes a question for the FIRST requirement — deliberately leaving
    // r2 uncovered. On a targeted gap-fill call (exactly one requirement
    // listed), it answers that requirement. Code, not the model, decides the
    // gap and the repair round.
    const gapResponder = (_index: number, opts: LlmGenerateOpts): unknown => {
      const prompt = opts.prompt;
      if (prompt.includes('"flashcards"')) {
        return { flashcards: [{ front: "Q?", back: "A", requirement_ids: ["r1", "r2"] }] };
      }
      if (/Category: (\w+)/.test(prompt)) {
        const ids = Array.from(prompt.matchAll(/^- (r\d+):/gm)).map((m) => m[1]);
        const targets = ids.length === 1 ? ids : ids.slice(0, 1);
        return {
          questions: targets.map((id) => ({
            requirement_ids: [id],
            prompt: `question for ${id}`,
            answer_outline: "outline",
            difficulty: 2,
          })),
        };
      }
      return {
        title: "Engineer",
        seniority: "mid",
        location: "",
        requirements: [
          { text: "Kubernetes", kind: "technical", priority: "must" },
          { text: "GraphQL", kind: "technical", priority: "must" },
        ],
      };
    };
    const fetcher = createFetcher();
    const provider = createFakeProvider([gapResponder]);
    const { kit } = await runPipeline(
      { id: "case-gap", jd: "Engineer with Kubernetes and GraphQL, both required.", company_url: origin, days: 2 },
      {
        provider,
        search: createFakeSearch(() => []),
        fetchHtml: fetcher.fetchHtml,
        isAllowed: async (u) => isAllowed(u, robotsFetcher),
        crawlDelayMs: async () => 0,
      },
    );
    expect(kit.coverage.passes).toBe(2);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    for (const rid of ["r1", "r2"]) {
      expect(kit.questions.some((q) => q.requirement_ids.includes(rid))).toBe(true);
    }
    expect(validateKit(kit)).toEqual([]);
    expect(kit.schedule.days).toHaveLength(2);
  });

  it("weak-model resilience: a provider that ignores requirement_ids still yields covered musts", async () => {
    // Bedrock GLM-4.7-flash showed this in a live run: well-formed objects but
    // no/loose requirement_ids, which sanitize-to-nothing. Code's deterministic
    // fallback must close every must afterwards.
    const weakResponder = (_index: number, opts: LlmGenerateOpts): unknown => {
      const prompt = opts.prompt;
      if (prompt.includes('"flashcards"')) {
        return { flashcards: [{ front: "Q?", back: "A", requirement_ids: ["r1"] }] };
      }
      if (/Category: (\w+)/.test(prompt)) {
        return { questions: [{ requirement_ids: [], prompt: "generic question", answer_outline: "outline", difficulty: 2 }] };
      }
      return {
        title: "Engineer", seniority: "mid", location: "",
        requirements: [
          { text: "Distributed systems", kind: "technical", priority: "must" },
          { text: "Stakeholder communication", kind: "behavioural", priority: "must" },
        ],
      };
    };
    const fetcher = createFetcher();
    const provider = createFakeProvider([weakResponder]);
    const { kit } = await runPipeline(
      { id: "case-weak", jd: "Engineer with distributed systems and stakeholder communication, both required.", company_url: origin, days: 2 },
      {
        provider,
        search: createFakeSearch(() => []),
        fetchHtml: fetcher.fetchHtml,
        isAllowed: async (u) => isAllowed(u, robotsFetcher),
        crawlDelayMs: async () => 0,
      },
    );
    expect(validateKit(kit)).toEqual([]);
    // every must is covered by *some* question (deterministic fallbacks)
    for (const rid of ["r1", "r2"]) {
      expect(kit.questions.some((q) => q.requirement_ids.includes(rid))).toBe(true);
    }
    expect(kit.coverage.uncovered_requirement_ids.filter((id) => ["r1", "r2"].includes(id))).toEqual([]);
  });
});
