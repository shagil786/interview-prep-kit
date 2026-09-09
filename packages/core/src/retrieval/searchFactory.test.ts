import { describe, expect, it } from "vitest";
import { mapYouResponse, createYouSearch } from "./youSearch.js";
import { searchFromEnv } from "./searchFactory.js";

describe("mapYouResponse", () => {
  it("maps the you.com 'web.results' container", () => {
    const out = mapYouResponse({
      web: { results: [{ title: "Acme interviews", url: "https://glassdoor.example/x", description: "details" }] },
    });
    expect(out).toEqual([{ title: "Acme interviews", url: "https://glassdoor.example/x", snippet: "details" }]);
  });

  it("maps the verified live shape results.web[]", () => {
    const out = mapYouResponse({
      results: {
        web: [
          {
            url: "https://dev.to/x/my-journey-to-gitlab",
            title: "My journey to GitLab",
            description: "my interview process at GitLab",
            thumbnail_url: "https://img.example/t.png",
          },
        ],
      },
    });
    expect(out).toEqual([
      { title: "My journey to GitLab", url: "https://dev.to/x/my-journey-to-gitlab", snippet: "my interview process at GitLab" },
    ]);
  });

  it("accepts alternative containers and field spellings", () => {
    const out = mapYouResponse({
      hits: [{ name: "Blog", link: "https://blog.example/a", content: "text" }],
    });
    expect(out[0]).toMatchObject({ title: "Blog", url: "https://blog.example/a", snippet: "text" });
  });

  it("drops non-http entries and tolerates garbage", () => {
    const out = mapYouResponse({ results: [{ title: "x", url: "not-http", description: "" }, "junk", null] });
    expect(out).toEqual([]);
  });
});

describe("createYouSearch", () => {
  it("calls v1/search with X-API-Key and maps results", async () => {
    let captured: { url: string; headers?: Record<string, string> } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, headers: init?.headers as Record<string, string> };
      return new Response(JSON.stringify({ web: { results: [{ title: "T", url: "https://x.example", description: "D" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const search = createYouSearch({ apiKey: "yk", baseUrl: "https://api.you.com", fetchImpl });
    const out = await search.search("acme interview");
    expect(out).toEqual([{ title: "T", url: "https://x.example", snippet: "D" }]);
    expect(captured?.url).toContain("/v1/search?query=acme%20interview");
    expect(captured?.headers?.["X-API-Key"]).toBe("yk");
  });

  it("throws a retryable error on 429", async () => {
    const fetchImpl = (async () => new Response("slow", { status: 429 })) as typeof fetch;
    const search = createYouSearch({ apiKey: "k", fetchImpl });
    await expect(search.search("q")).rejects.toMatchObject({ retryable: true });
  });
});

describe("searchFromEnv", () => {
  const env = (patch: NodeJS.ProcessEnv) => ({ ...patch } as NodeJS.ProcessEnv);

  it("defaults to brave and falls back to an honest no-op without a key", () => {
    const r = searchFromEnv(env({}));
    expect(r.providerLabel).toContain("BRAVE_API_KEY not set");
  });

  it("selects you.com when configured", () => {
    const r = searchFromEnv(env({ SEARCH_PROVIDER: "you", YOU_API_KEY: "k" }));
    expect(r.providerLabel).toBe("you.com");
  });

  it("honours SEARCH_PROVIDER=none", () => {
    const r = searchFromEnv(env({ SEARCH_PROVIDER: "none", BRAVE_API_KEY: "k" }));
    expect(r.providerLabel).toContain("SEARCH_PROVIDER=none");
  });
});
