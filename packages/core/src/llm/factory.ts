import { createBedrockProvider } from "./bedrock.js";
import { createGeminiProvider } from "./gemini.js";
import { createOpenAICompatibleProvider } from "./openaiCompatible.js";
import type { LlmProvider } from "./provider.js";

export type LlmProviderKind = "gemini" | "openai-compatible" | "bedrock";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
/** Default free model on OpenAI-compatible gateways (config-driven). */
export const DEFAULT_OPENAI_MODEL = "free/gemini-3.8-flash";
export const DEFAULT_BEDROCK_MODEL = "zai.glm-4.7-flash";
export const DEFAULT_BEDROCK_REGION = "ap-south-1";

/**
 * Build the RAW provider from environment variables. The resilient wrapper
 * (retries/backoff/pacing) is applied by the caller (runPipeline or the API's
 * envServices), so this returns the bare adapter.
 *
 *   LLM_PROVIDER=gemini (default)        -> GEMINI_API_KEY (+ GEMINI_MODEL)
 *   LLM_PROVIDER=openai-compatible       -> OPENAI_COMPATIBLE_BASE_URL,
 *                                          OPENAI_COMPATIBLE_API_KEY,
 *                                          LLM_MODEL
 *   LLM_PROVIDER=bedrock                 -> BEDROCK_MODEL (+ BEDROCK_REGION);
 *                                          credentials from AWS env vars (SigV4),
 *                                          else BEDROCK_API_KEY (bearer),
 *                                          else the configured AWS CLI (SSO) profile
 *
 * Throws with a clear message when the selected provider's credentials are
 * missing, so CLI/API can surface a useful config error.
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const kind = (env.LLM_PROVIDER?.trim().toLowerCase() || "gemini") as LlmProviderKind;

  if (kind === "bedrock") {
    return createBedrockProvider({
      model: env.BEDROCK_MODEL?.trim() || DEFAULT_BEDROCK_MODEL,
      region: env.BEDROCK_REGION?.trim() || DEFAULT_BEDROCK_REGION,
    });
  }

  if (kind === "openai-compatible") {
    const baseUrl = env.OPENAI_COMPATIBLE_BASE_URL?.trim();
    const apiKey = env.OPENAI_COMPATIBLE_API_KEY?.trim();
    if (!baseUrl || !apiKey) {
      throw new Error(
        "LLM_PROVIDER=openai-compatible requires OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY (see .env.example)",
      );
    }
    return createOpenAICompatibleProvider({
      baseUrl,
      apiKey,
      model: env.LLM_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    });
  }

  if (kind !== "gemini") {
    throw new Error(`unknown LLM_PROVIDER "${kind}": expected gemini, openai-compatible or bedrock`);
  }
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("LLM_PROVIDER=gemini requires GEMINI_API_KEY (see .env.example)");
  }
  return createGeminiProvider({ apiKey, model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL });
}
