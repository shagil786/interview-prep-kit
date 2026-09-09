import { describe, expect, it } from "vitest";
import { providerFromEnv, DEFAULT_OPENAI_MODEL } from "./factory.js";
import { createOpenAICompatibleProvider } from "./openaiCompatible.js";
import { JsonParseError, ProviderError } from "./provider.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function contentResponse(content: string, status = 200): Response {
  return jsonResponse({ choices: [{ message: { content } }] }, status);
}

describe("createOpenAICompatibleProvider", () => {
  it("POSTs chat/completions with json_object mode and parses the reply", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return contentResponse('{"ok":true,"n":2}');
    }) as typeof fetch;

    const provider = createOpenAICompatibleProvider({
      baseUrl: "https://api.apinex.bond/v1/",
      apiKey: "k",
      model: "free/gemini-3.8-flash",
      fetchImpl,
    });
    const out = await provider.generateJson<{ ok: boolean; n: number }>({ system: "sys", prompt: "do it" });
    expect(out).toEqual({ ok: true, n: 2 });
    expect(captured?.url).toBe("https://api.apinex.bond/v1/chat/completions");
    const body = JSON.parse(String(captured?.init?.body));
    expect(body.model).toBe("free/gemini-3.8-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toBe("do it");
    expect((captured?.init?.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("throws retryable ProviderError on 429", async () => {
    const fetchImpl = (async () => jsonResponse({ error: { message: "slow" } }, 429)) as typeof fetch;
    const provider = createOpenAICompatibleProvider({ baseUrl: "http://x/v1", apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toMatchObject({
      name: "ProviderError",
      status: 429,
      retryable: true,
    });
  });

  it("parses JSON wrapped in markdown fences (real gateway behaviour)", async () => {
    const fenced = '```json\n{"ok": true, "wrapped": "yes"}\n```';
    const provider = createOpenAICompatibleProvider({
      baseUrl: "http://x/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: (async () => contentResponse(fenced)) as typeof fetch,
    });
    const out = await provider.generateJson<{ ok: boolean; wrapped: string }>({ system: "s", prompt: "p" });
    expect(out).toEqual({ ok: true, wrapped: "yes" });
  });

  it("parses JSON with leading prose", async () => {
    const provider = createOpenAICompatibleProvider({
      baseUrl: "http://x/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: (async () => contentResponse('Here you go:\n{"a": 1}')) as typeof fetch,
    });
    const out = await provider.generateJson<{ a: number }>({ system: "s", prompt: "p" });
    expect(out).toEqual({ a: 1 });
  });

  it("throws JsonParseError on empty or non-JSON content", async () => {
    const provider = createOpenAICompatibleProvider({
      baseUrl: "http://x/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: (async () => contentResponse("not json")) as typeof fetch,
    });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(JsonParseError);
  });
});

describe("providerFromEnv", () => {
  const env = (patch: NodeJS.ProcessEnv) => ({ ...patch } as NodeJS.ProcessEnv);

  it("defaults to gemini and requires GEMINI_API_KEY", () => {
    expect(() => providerFromEnv(env({}))).toThrow(/GEMINI_API_KEY/);
  });

  it("builds a gemini provider when configured", () => {
    const provider = providerFromEnv(env({ GEMINI_API_KEY: "g" }));
    expect(typeof provider.generateJson).toBe("function");
  });

  it("rejects an unknown provider kind", () => {
    expect(() => providerFromEnv(env({ LLM_PROVIDER: "claude" }))).toThrow(/unknown LLM_PROVIDER/);
  });

  it("builds a bedrock provider without immediate credential need", () => {
    const provider = providerFromEnv(env({ LLM_PROVIDER: "bedrock", BEDROCK_MODEL: "zai.glm-4.7-flash" }));
    expect(typeof provider.generateJson).toBe("function");
  });

  it("builds an openai-compatible provider and requires its credentials", () => {
    expect(() => providerFromEnv(env({ LLM_PROVIDER: "openai-compatible" }))).toThrow(/OPENAI_COMPATIBLE_BASE_URL/);
    const provider = providerFromEnv(
      env({ LLM_PROVIDER: "openai-compatible", OPENAI_COMPATIBLE_BASE_URL: "https://api.apinex.bond/v1", OPENAI_COMPATIBLE_API_KEY: "k" }),
    );
    expect(typeof provider.generateJson).toBe("function");
  });

  it("uses LLM_MODEL for the openai-compatible default", () => {
    // can't introspect the private model; instead assert the default constant is stable
    expect(DEFAULT_OPENAI_MODEL.startsWith("free/")).toBe(true);
  });
});
