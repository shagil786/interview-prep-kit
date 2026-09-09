export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LlmGenerateOpts {
  system: string;
  prompt: string;
  /** Provider-specific schema hint (Gemini REST path ignores it; kept for portability). */
  jsonSchema?: unknown;
  temperature?: number;
  /** Cap on generated tokens; providers default to a sane bound for JSON stages. */
  maxTokens?: number;
  /** Optional observability hook: invoked with token/latency stats after the call. */
  onUsage?: (usage: LlmUsage) => void;
}

export interface LlmProvider {
  generateJson<T>(opts: LlmGenerateOpts): Promise<T>;
}

/** Transport-level failure carrying whether a retry could succeed. */
export class ProviderError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}

/** The provider responded, but its text was not parseable JSON or was empty. */
export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonParseError";
  }
}
