import { describe, expect, it } from "vitest";
import { createFakeSearch, createSearch, mapBraveResponse } from "./search.js";

describe("mapBraveResponse", () => {
  it("maps web results to SearchResult", () => {
    const out = mapBraveResponse({
      web: {
        results: [
          { title: "Acme Interview", url: "https://glassdoor.example/review", description: "Process details" },
          { title: "No url", url: "not-http", description: "skip me" },
          { title: "Second", url: "https://blog.example/acme", description: "" },
        ],
      },
    });
    expect(out).toEqual([
      { title: "Acme Interview", url: "https://glassdoor.example/review", snippet: "Process details" },
      { title: "Second", url: "https://blog.example/acme", snippet: "" },
    ]);
  });

  it("returns [] for unexpected shapes", () => {
    expect(mapBraveResponse(null)).toEqual([]);
    expect(mapBraveResponse({})).toEqual([]);
    expect(mapBraveResponse({ web: { results: "nope" } })).toEqual([]);
  });
});

describe("createFakeSearch", () => {
  it("records queries and serves canned results", async () => {
    const fake = createFakeSearch((q) => [{ title: q, url: "https://example.test/1", snippet: "" }]);
    const results = await fake.search("acme interview process");
    expect(fake.queries).toEqual(["acme interview process"]);
    expect(results[0].url).toBe("https://example.test/1");
  });
});

describe("createSearch", () => {
  it("calls the Brave endpoint with the subscription token and maps results", async () => {
    let calledWith: { url: string; headers: Record<string, string> } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledWith = { url, headers: init?.headers as Record<string, string> };
      return new Response(JSON.stringify({ web: { results: [{ title: "T", url: "https://x.example", description: "D" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const search = createSearch("secret-key", { fetchImpl });
    const out = await search.search("acme interview");
    expect(out).toEqual([{ title: "T", url: "https://x.example", snippet: "D" }]);
    expect(calledWith?.url).toContain("q=acme%20interview");
    expect(calledWith?.headers["X-Subscription-Token"]).toBe("secret-key");
  });

  it("throws a retryable error on 429", async () => {
    const fetchImpl = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const search = createSearch("k", { fetchImpl });
    await expect(search.search("q")).rejects.toMatchObject({ retryable: true });
  });

  it("throws a non-retryable error on 400", async () => {
    const fetchImpl = (async () => new Response("bad", { status: 400 })) as typeof fetch;
    const search = createSearch("k", { fetchImpl });
    await expect(search.search("q")).rejects.toMatchObject({ retryable: false });
  });
});
