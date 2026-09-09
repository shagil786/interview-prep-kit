import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "./gemini.js";
import { createFakeProvider } from "./fake.js";
import { JsonParseError, ProviderError, type LlmGenerateOpts } from "./provider.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createGeminiProvider", () => {
  it("POSTs the prompt and parses the JSON from the first candidate part", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"ok":true,"n":3}' }] } }],
      });
    }) as typeof fetch;

    const provider = createGeminiProvider({ apiKey: "k", model: "m1", fetchImpl, baseUrl: "https://api.example/v1beta/" });
    const out = await provider.generateJson<{ ok: boolean; n: number }>({
      system: "sys",
      prompt: "hello",
    });
    expect(out).toEqual({ ok: true, n: 3 });
    expect(captured?.url).toContain("/models/m1:generateContent?key=k");
    const body = JSON.parse(String(captured?.init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[0].text).toBe("hello");
  });

  it("throws a retryable ProviderError on 429", async () => {
    const fetchImpl = (async () => jsonResponse({ error: { message: "slow down" } }, 429)) as typeof fetch;
    const provider = createGeminiProvider({ apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toMatchObject({
      name: "ProviderError",
      status: 429,
      retryable: true,
    });
  });

  it("throws a non-retryable ProviderError on 400", async () => {
    const fetchImpl = (async () => jsonResponse({ error: { message: "bad" } }, 400)) as typeof fetch;
    const provider = createGeminiProvider({ apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toMatchObject({
      name: "ProviderError",
      retryable: false,
    });
  });

  it("throws JsonParseError when the model text is not JSON", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: "not json at all" }] } }] })) as typeof fetch;
    const provider = createGeminiProvider({ apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(JsonParseError);
  });

  it("throws JsonParseError when there is no candidate text", async () => {
    const fetchImpl = (async () => jsonResponse({ candidates: [] })) as typeof fetch;
    const provider = createGeminiProvider({ apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(JsonParseError);
  });
});

describe("createFakeProvider", () => {
  it("consumes the script in order and repeats the last entry", async () => {
    const provider = createFakeProvider([
      () => ({ step: 1 }),
      () => ({ step: 2 }),
      () => ({ step: "tail" }),
    ]);
    expect(await provider.generateJson({ system: "", prompt: "a" })).toEqual({ step: 1 });
    expect(await provider.generateJson({ system: "", prompt: "b" })).toEqual({ step: 2 });
    expect(await provider.generateJson({ system: "", prompt: "c" })).toEqual({ step: "tail" });
    expect(await provider.generateJson({ system: "", prompt: "d" })).toEqual({ step: "tail" });
    expect(provider.calls.map((c: LlmGenerateOpts) => c.prompt)).toEqual(["a", "b", "c", "d"]);
  });
});
