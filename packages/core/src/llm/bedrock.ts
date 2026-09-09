import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { JsonParseError, ProviderError, type LlmGenerateOpts, type LlmProvider } from "./provider.js";
import { extractJsonText } from "./openaiCompatible.js";

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number;
}

export interface BedrockConfig {
  model: string;
  region?: string;
  /** Explicit credentials (deploy). When omitted, resolved from env or the AWS CLI (dev). */
  credentials?: BedrockCredentials;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to `aws configure export-credentials`. */
  cliCredentials?: () => BedrockCredentials;
}

const SERVICE = "bedrock";
const CRED_SKEW_MS = 60_000;

function hmac(key: string | Uint8Array, data: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", key).update(data).digest());
}

function hex(bytes: Uint8Array | string): string {
  return typeof bytes === "string"
    ? Buffer.from(bytes).toString("hex")
    : Buffer.from(bytes).toString("hex");
}

const sha256hex = (data: string) => createHash("sha256").update(data).digest("hex");

/** SigV4-signed POST to the Bedrock Converse API (no AWS SDK dependency). */
export function signBedrockRequest(
  creds: BedrockCredentials,
  region: string,
  path: string,
  body: string,
  amzDate: string,
): Record<string, string> {
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
  };
  if (creds.sessionToken) headers["x-amz-security-token"] = creds.sessionToken;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]!.trim()}\n`)
    .join("");
  const payloadHash = sha256hex(body);
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonicalRequest)}`;

  let key: Uint8Array = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  key = hmac(key, region);
  key = hmac(key, SERVICE);
  key = hmac(key, "aws4_request");
  const signature = hex(hmac(key, stringToSign));

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

function credsFromEnv(env: NodeJS.ProcessEnv): BedrockCredentials | null {
  const id = env.AWS_ACCESS_KEY_ID?.trim();
  const secret = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!id || !secret) return null;
  return { accessKeyId: id, secretAccessKey: secret, sessionToken: env.AWS_SESSION_TOKEN?.trim() || undefined };
}

function credsFromCli(): BedrockCredentials {
  const out = execFileSync("aws", ["configure", "export-credentials", "--format", "process"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  const parsed = JSON.parse(out) as {
    AccessKeyId: string;
    SecretAccessKey: string;
    SessionToken?: string;
    Expiration?: string;
  };
  return {
    accessKeyId: parsed.AccessKeyId,
    secretAccessKey: parsed.SecretAccessKey,
    sessionToken: parsed.SessionToken,
    expiresAt: parsed.Expiration ? Date.parse(parsed.Expiration) : undefined,
  };
}

/**
 * AWS Bedrock Converse adapter. Credential resolution order: explicit config ->
 * standard AWS env vars -> `aws configure export-credentials` (SSO dev login).
 * CLI credentials are cached until 60s before expiry and refreshed on demand.
 */
export function createBedrockProvider(config: BedrockConfig): LlmProvider {
  const region = config.region ?? process.env.BEDROCK_REGION ?? "ap-south-1";
  const doFetch = config.fetchImpl ?? fetch;
  const getCli = config.cliCredentials ?? credsFromCli;
  let cached: BedrockCredentials | null = config.credentials ?? credsFromEnv(process.env) ?? null;
  const cliMode = !cached;

  async function resolveCredentials(): Promise<BedrockCredentials> {
    if (!cliMode && cached) return cached;
    if (cached?.expiresAt && Date.now() < cached.expiresAt - CRED_SKEW_MS) return cached;
    cached = getCli();
    return cached;
  }

  return {
    async generateJson<T>(opts: LlmGenerateOpts): Promise<T> {
      const startedAt = Date.now();
      const path = `/model/${encodeURIComponent(config.model)}/converse`;
      const body = JSON.stringify({
        messages: [
          // Converse has one system field, not per-message system roles.
          { role: "user", content: [{ text: `${opts.system}\n\n${opts.prompt}` }] },
        ],
        inferenceConfig: {
          maxTokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.2,
        },
      });
      let creds: BedrockCredentials;
      try {
        creds = await resolveCredentials();
      } catch (err) {
        throw new ProviderError(`bedrock credentials unavailable: ${(err as Error).message}`, 0, true);
      }
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const headers = signBedrockRequest(creds, region, path, body, amzDate);

      let res: Response;
      try {
        res = await doFetch(`https://bedrock-runtime.${region}.amazonaws.com${path}`, {
          method: "POST",
          headers,
          body,
        });
      } catch (err) {
        // Expired CLI session surfaces here as 403 later; network errors retry.
        throw new ProviderError(`bedrock network error: ${(err as Error).message}`, 0, true);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // A stale CLI session -> refresh once and flag retryable so withRetry re-runs.
        if (res.status === 403 && cliMode) cached = null;
        throw new ProviderError(`bedrock http ${res.status}: ${text.slice(0, 200)}`, res.status, res.status === 429 || res.status >= 500 || res.status === 403);
      }
      let payload: {
        output?: { message?: { content?: { text?: string }[] } };
        usage?: { inputTokens?: unknown; outputTokens?: unknown };
      };
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        throw new JsonParseError("bedrock returned a non-JSON body");
      }
      const text = payload?.output?.message?.content?.map((c) => c.text ?? "").join("").trim();
      if (!text) {
        throw new JsonParseError("bedrock returned empty model text");
      }
      opts.onUsage?.({
        model: config.model,
        inputTokens: typeof payload.usage?.inputTokens === "number" ? payload.usage.inputTokens : 0,
        outputTokens: typeof payload.usage?.outputTokens === "number" ? payload.usage.outputTokens : 0,
        latencyMs: Date.now() - startedAt,
      });
      try {
        return JSON.parse(extractJsonText(text)) as T;
      } catch (err) {
        throw new JsonParseError(`invalid json in model output: ${(err as Error).message}`);
      }
    },
  };
}
