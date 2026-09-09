import { createSearch, createFakeSearch, type SearchLike } from "./search.js";
import { createYouSearch } from "./youSearch.js";

export type SearchProviderKind = "brave" | "you" | "none";

export interface SearchFromEnv {
  search: SearchLike;
  /** Human-readable note about the provider chosen, for CLI warnings. */
  providerLabel: string;
}

/**
 * Build the public-discussion search backend from env:
 *   SEARCH_PROVIDER=brave (default) -> BRAVE_API_KEY
 *   SEARCH_PROVIDER=you            -> YOU_API_KEY (REST; free tier is MCP-only, see youSearch.ts)
 * When the selected provider's key is missing we return an honest no-op search
 * (records nothing found) rather than failing the run — the pipeline treats an
 * absent key as "public discussion not searched", matching the CLI's previous
 * behaviour for a missing Brave key.
 */
export function searchFromEnv(env: NodeJS.ProcessEnv = process.env): SearchFromEnv {
  const kind = (env.SEARCH_PROVIDER?.trim().toLowerCase() || "brave") as SearchProviderKind;

  if (kind === "you") {
    const key = env.YOU_API_KEY?.trim();
    if (!key) {
      return { search: createFakeSearch(() => []), providerLabel: "none (YOU_API_KEY not set — public discussion not searched)" };
    }
    return { search: createYouSearch({ apiKey: key }), providerLabel: "you.com" };
  }

  if (kind === "none") {
    return { search: createFakeSearch(() => []), providerLabel: "none (SEARCH_PROVIDER=none)" };
  }

  const key = env.BRAVE_API_KEY?.trim();
  if (!key) {
    return { search: createFakeSearch(() => []), providerLabel: "none (BRAVE_API_KEY not set — public discussion not searched)" };
  }
  return { search: createSearch(key), providerLabel: "brave" };
}
