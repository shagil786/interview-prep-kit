import * as cheerio from "cheerio";

export const TEXT_CAP = 12_000;

export interface CleanedPage {
  title: string;
  text: string;
  links: { href: string; text: string }[];
}

export type PageRole = "homepage" | "about" | "careers" | "hiring-process" | "blog" | "other";

const BOILERPLATE = "script, style, nav, footer, form, aside, noscript, svg, template";
const TEXT_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, td, pre, figcaption";

/** Parse HTML into title, main text, and links after stripping boilerplate. */
export function cleanHtml(html: string, url: string): CleanedPage {
  const $ = cheerio.load(html);

  // Links first: navigation links matter for link discovery even though their
  // text is boilerplate we exclude from the reading text below.
  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    links.push({ href: $(el).attr("href") ?? "", text: $(el).text().trim() });
  });

  $(BOILERPLATE).remove();
  const title = $("title").first().text().trim();

  const main = $("main").first();
  const article = $("article").first();
  const scope = main.length > 0 ? main : article.length > 0 ? article : $("body");
  return { title, text: extractBlocks($, scope), links };
}

/**
 * Extract reading text as newline-separated lines from content blocks,
 * collapsing each block to single spaces. Keeps block boundaries so adjacent
 * blocks never merge on minified HTML, drops empty lines and boilerplate that
 * repeats verbatim 3+ times (cookie bars, banners, "share this"), then caps.
 * Nested blocks (e.g. a <p> inside a <blockquote>) emit identical adjacent
 * lines, which are collapsed to one. If the block walk finds nothing at all
 * (prose in bare <div>s or direct text nodes), fall back to the scope's own
 * collapsed text so no content is silently lost.
 */
function extractBlocks($: cheerio.CheerioAPI, scope: ReturnType<cheerio.CheerioAPI>): string {
  const lines: string[] = [];
  scope.find(TEXT_BLOCKS).each((_, el) => {
    const line = $(el).text().replace(/\s+/g, " ").trim();
    if (line.length > 0) lines.push(line);
  });

  // Drop lines repeated verbatim 3+ times (cookie bars, banners)…
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  const filtered = lines.filter((line) => (counts.get(line) ?? 0) < 3);

  // …then collapse adjacent identical lines from nested blocks (<blockquote><p>…).
  let kept = filtered.filter((line, i) => line !== filtered[i - 1]);

  // If no content block matched at all (prose in bare <div>s or text nodes),
  // fall back to the scope's own collapsed text so nothing is silently lost.
  if (kept.length === 0) {
    const raw = scope.text().replace(/\s+/g, " ").trim();
    if (raw) kept = [raw];
  }
  return kept.join("\n").slice(0, TEXT_CAP);
}

const MATCHERS: Array<[PageRole, RegExp]> = [
  ["hiring-process", /\b(interview|how\s?we\s?hire|recruit|hiring|onboarding|process|handbook)\b/i],
  ["careers", /\b(careers?|jobs?|apply|positions?|open\s?roles?|vacancies?)\b/i],
  ["about", /\b(about|team|culture|values|who\s?we\s?are|our\s?story|company|life\b)/i],
  ["blog", /\b(blog|engineering|journal|news|posts?|articles?)\b/i],
];

/** Classify a fetched page by URL + title keywords; hiring-process first. */
export function classifyPage(url: string, title: string): PageRole {
  const pathname = new URL(url).pathname;
  if (pathname === "/" || pathname === "") return "homepage";
  const haystack = `${url} ${title}`;
  for (const [role, re] of MATCHERS) {
    if (re.test(haystack)) return role;
  }
  return "other";
}

/** Collapse all whitespace runs to single spaces and cap length. */
export function extractMainText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, TEXT_CAP);
}
