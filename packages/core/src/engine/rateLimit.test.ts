import { describe, expect, it } from "vitest";
import { TokenBucketLimiter, withRetry } from "./rateLimit.js";

describe("TokenBucketLimiter", () => {
  it("allows up to `capacity` acquisitions without waiting", async () => {
    const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSec: 1000 });
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - t0).toBeLessThan(150);
  });

  it("waits for a refill when tokens are exhausted", async () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSec: 200 }); // 1 token per 5ms
    await limiter.acquire(); // consume the only token
    const t0 = Date.now();
    await limiter.acquire(); // must wait ~5ms for a refill
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4);
  });
});

describe("withRetry", () => {
  it("retries retryable failures and returns the eventual success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("boom");
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5, jitter: false },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("propagates non-retryable errors immediately", async () => {
    const err = new Error("nope");
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw err;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          maxDelayMs: 5,
          isRetryable: (e) => (e as Error).message !== "nope",
        },
      ),
    ).rejects.toBe(err);
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error(`x${calls}`);
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5, jitter: false },
      ),
    ).rejects.toThrow("x3");
    expect(calls).toBe(3);
  });
});
