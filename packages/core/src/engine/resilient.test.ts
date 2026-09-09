import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../llm/fake.js";
import { JsonParseError, ProviderError, type LlmProvider } from "../llm/provider.js";
import { TokenBucketLimiter } from "./rateLimit.js";
import { createResilientProvider } from "./resilient.js";

describe("createResilientProvider", () => {
  it("retries a retryable ProviderError then returns the success", async () => {
    let calls = 0;
    const base: LlmProvider = {
      async generateJson<T>(): Promise<T> {
        calls += 1;
        if (calls < 3) throw new ProviderError("slow down", 429, true);
        return { ok: true } as unknown as T;
      },
    };
    const resilient = createResilientProvider(base, { maxRetries: 4 });
    expect(await resilient.generateJson({ system: "s", prompt: "p" })).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("does not retry a non-retryable ProviderError", async () => {
    let calls = 0;
    const base: LlmProvider = {
      async generateJson<T>(): Promise<T> {
        calls += 1;
        throw new ProviderError("bad request", 400, false);
      },
    };
    const resilient = createResilientProvider(base, { maxRetries: 3 });
    await expect(resilient.generateJson({ system: "s", prompt: "p" })).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("tries one fresh draw after a JsonParseError", async () => {
    let calls = 0;
    const base: LlmProvider = {
      async generateJson<T>(): Promise<T> {
        calls += 1;
        if (calls === 1) throw new JsonParseError("invalid json");
        return { fixed: true } as unknown as T;
      },
    };
    const resilient = createResilientProvider(base, { maxRetries: 2 });
    expect(await resilient.generateJson({ system: "s", prompt: "p" })).toEqual({ fixed: true });
    expect(calls).toBe(2);
  });

  it("acquires a token from the rate limiter before each underlying call", async () => {
    let acquires = 0;
    const limiter = new TokenBucketLimiter({ capacity: 10, refillPerSec: 1000 });
    const origAcquire = limiter.acquire.bind(limiter);
    limiter.acquire = async () => {
      acquires += 1;
      await origAcquire();
    };
    const base: LlmProvider = {
      async generateJson<T>(): Promise<T> {
        return { ok: true } as unknown as T;
      },
    };
    const resilient = createResilientProvider(base, { rateLimiter: limiter });
    await resilient.generateJson({ system: "s", prompt: "p" });
    expect(acquires).toBe(1);
  });

  it("propagates when the fresh draw also fails to parse", async () => {
    const base: LlmProvider = {
      async generateJson<T>(): Promise<T> {
        throw new JsonParseError("nope");
      },
    };
    const resilient = createResilientProvider(base, { maxRetries: 2 });
    await expect(resilient.generateJson({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(JsonParseError);
  });
});
