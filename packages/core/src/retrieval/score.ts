const KEYWORDS: Record<string, number> = {
  careers: 5,
  jobs: 5,
  hiring: 5,
  apply: 5,
  positions: 5,
  recruiting: 5,
  interview: 4,
  process: 4,
  about: 3,
  team: 3,
  culture: 3,
  values: 3,
  life: 3,
  company: 3,
  handbook: 2,
  blog: 2,
  engineering: 2,
  news: 2,
  journal: 2,
  posts: 2,
};

const TOKEN_RE = /[a-z0-9]+/g;

/**
 * Deterministic relevance score for a link, used to rank a crawl frontier.
 * Anchor text counts at full weight; words in the URL count at half weight.
 * No model, no randomness: same inputs always produce the same score.
 */
export function scoreLink(anchorText: string, url: string): number {
  let score = 0;
  for (const word of anchorText.toLowerCase().match(TOKEN_RE) ?? []) {
    score += KEYWORDS[word] ?? 0;
  }
  const seen = new Set<string>();
  for (const word of url.toLowerCase().match(TOKEN_RE) ?? []) {
    if (seen.has(word)) continue;
    seen.add(word);
    score += (KEYWORDS[word] ?? 0) * 0.5;
  }
  return score;
}

/** True when `candidate` resolves to an http(s) URL on `base`'s origin. */
export function isInternal(base: URL, candidate: string): boolean {
  let resolved: URL;
  try {
    resolved = new URL(candidate, base);
  } catch {
    return false;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return false;
  return resolved.origin === base.origin;
}
