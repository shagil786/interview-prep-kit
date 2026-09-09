import type { LlmGenerateOpts, LlmProvider } from "./provider.js";

export type FakeScript = Array<(call: number, opts: LlmGenerateOpts) => unknown | Promise<unknown>>;

/**
 * Deterministic provider double. Each call consumes the next script entry; the
 * last entry repeats for any further calls (so tests can tail a sequence with
 * a stable response). Records every call for assertions.
 */
export function createFakeProvider(script: FakeScript): LlmProvider & { calls: LlmGenerateOpts[] } {
  const calls: LlmGenerateOpts[] = [];
  if (script.length === 0) {
    throw new Error("createFakeProvider requires at least one scripted response");
  }
  return {
    calls,
    async generateJson<T>(opts: LlmGenerateOpts): Promise<T> {
      calls.push(opts);
      const index = Math.min(calls.length - 1, script.length - 1);
      return (await script[index](index, opts)) as T;
    },
  };
}
