import * as cheerio from "cheerio";

export const TEXT_CAP = 12_000;

export interface CleanedPage {
  title: string;
  text: string;
  links: { href: string; text: string }[];
}

export type PageRole = "homepage" | "about" | "careers" | "hiring-process" | "blog" | "other";

const BOILERPLATE = "script, style, nav, footer, form, aside, noscript, svg, template";

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

  const container = $("main").first();
  const scope = container.length > 0 ? container : $("article").first();
  const body = scope.length > 0 ? scope : $("body");
  return { title, text: extractMainText(body.text()), links };
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
