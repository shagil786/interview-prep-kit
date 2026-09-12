import { afterEach, describe, expect, it } from "vitest";
import { createBedrockProvider, signBedrockRequest } from "./bedrock.js";

function converseResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      output: { message: { content: [{ text }] } },
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const AWS_VARS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"] as const;

afterEach(() => {
  delete process.env.BEDROCK_API_KEY;
  for (const v of AWS_VARS) delete process.env[v];
});

describe("createBedrockProvider bearer auth", () => {
  it("sends Authorization: Bearer and no SigV4 headers when only BEDROCK_API_KEY is set", async () => {
    process.env.BEDROCK_API_KEY = "bedrock-api-key-test";
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return converseResponse('{"ok":true}');
    }) as typeof fetch;

    const provider = createBedrockProvider({ model: "m1", region: "ap-south-1", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).resolves.toEqual({ ok: true });

    expect(captured?.url).toBe("https://bedrock-runtime.ap-south-1.amazonaws.com/model/m1/converse");
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer bedrock-api-key-test");
    expect(headers["x-amz-date"]).toBeUndefined();
  });

  it("prefers SigV4 env credentials over BEDROCK_API_KEY when both are set", async () => {
    process.env.BEDROCK_API_KEY = "bedrock-api-key-test";
    process.env.AWS_ACCESS_KEY_ID = "AKID";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    let captured: { init?: RequestInit } | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init };
      return converseResponse('{"ok":true}');
    }) as typeof fetch;

    const provider = createBedrockProvider({ model: "m1", region: "ap-south-1", fetchImpl });
    await provider.generateJson({ system: "s", prompt: "p" });
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("marks a bearer 403 as non-retryable (wrong key, nothing to refresh)", async () => {
    process.env.BEDROCK_API_KEY = "bedrock-api-key-test";
    const fetchImpl = (async () =>
      new Response("forbidden", { status: 403 })) as typeof fetch;
    const provider = createBedrockProvider({ model: "m1", region: "ap-south-1", fetchImpl });
    await expect(provider.generateJson({ system: "s", prompt: "p" })).rejects.toMatchObject({
      name: "ProviderError",
      status: 403,
      retryable: false,
    });
  });

  it("signBedrockRequest still produces SigV4 headers (pure function unchanged)", () => {
    const headers = signBedrockRequest(
      { accessKeyId: "AKID", secretAccessKey: "secret" },
      "ap-south-1",
      "/model/m/converse",
      "{}",
      "20260101T000000Z",
    );
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
    expect(headers["x-amz-date"]).toBe("20260101T000000Z");
  });
});
