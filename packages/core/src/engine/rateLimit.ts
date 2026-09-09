export interface RateLimiter {
  acquire(): Promise<void>;
}

export interface TokenBucketOptions {
  capacity: number;
  refillPerSec: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket. `acquire()` resolves once a token is available, refilling
 * continuously at `refillPerSec` up to `capacity`. Waiting callers that wake
 * together re-check and re-wait, so concurrent acquirers cannot over-consume.
 */
export class TokenBucketLimiter implements RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly opts: TokenBucketOptions) {
    this.tokens = opts.capacity;
    this.lastRefillMs = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsedSec = (now - this.lastRefillMs) / 1000;
      this.lastRefillMs = now;
      this.tokens = Math.min(this.opts.capacity, this.tokens + elapsedSec * this.opts.refillPerSec);
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.opts.refillPerSec) * 1000;
      await sleep(Math.max(1, waitMs));
    }
  }
}

export interface RetryOptions {
  /** Number of retries after the first attempt (total attempts = maxRetries + 1). */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Default true. Set false for fully deterministic tests. */
  jitter?: boolean;
  isRetryable?: (err: unknown) => boolean;
}

/** Exponential backoff with optional jitter around each delay. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const retryable = opts.isRetryable ? opts.isRetryable(err) : true;
      if (!retryable || attempt >= opts.maxRetries) throw err;
      const exponent = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
      const jitter = opts.jitter === false ? 0 : Math.random() * exponent * 0.3;
      await sleep(exponent + jitter);
      attempt += 1;
    }
  }
}
