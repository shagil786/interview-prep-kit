import { describe, expect, it } from "vitest";
import { classifyPage, cleanHtml, extractMainText } from "./clean.js";

const SAMPLE = `<!doctype html><html><head><title>Acme - About</title></head>
<body>
<nav><a href="/">Home</a><a href="/careers">Careers</a></nav>
<header>Acme</header>
<main><h1>About Acme</h1><p>We build  pipelines that    move data fast.</p>
<p>Our team values transparency and craft.</p></main>
<footer>© Acme</footer>
<script>window.evil = 1;</script>
</body></html>`;

describe("cleanHtml", () => {
  const out = cleanHtml(SAMPLE, "https://acme.example/about");

  it("extracts the document title", () => {
    expect(out.title).toBe("Acme - About");
  });

  it("removes nav, footer and script boilerplate from the text", () => {
    expect(out.text).not.toContain("Careers");
    expect(out.text).not.toContain("© Acme");
    expect(out.text).not.toContain("window.evil");
    expect(out.text).toContain("transparency and craft");
  });

  it("collapses whitespace", () => {
    expect(out.text).not.toContain("  ");
  });

  it("returns anchor links with their text", () => {
    expect(out.links).toContainEqual({ href: "/careers", text: "Careers" });
    expect(out.links).toContainEqual({ href: "/", text: "Home" });
  });

  it("keeps block boundaries on minified html", () => {
    const minified = cleanHtml("<main><p>A sentence.</p><p>Another one.</p></main>", "https://acme.example/x");
    expect(minified.text).toContain("A sentence.\nAnother one.");
    expect(minified.text).not.toContain("sentence.Another");
  });

  it("drops boilerplate lines repeated three or more times", () => {
    const html =
      "<main><p>Unique content here.</p><p>Sign up for our newsletter</p>" +
      "<p>Sign up for our newsletter</p><p>Sign up for our newsletter</p></main>";
    const out = cleanHtml(html, "https://acme.example/x");
    expect(out.text).toContain("Unique content here.");
    expect(out.text).not.toContain("Sign up");
  });

  it("retains prose wrapped in bare divs (no content blocks)", () => {
    const html =
      "<main><div><div>We move data fast across regions.</div></div>" +
      "<div>Our second paragraph lives in a div too.</div></main>";
    const out = cleanHtml(html, "https://acme.example/x");
    expect(out.text).toContain("We move data fast");
    expect(out.text).toContain("second paragraph");
  });

  it("does not double-count a paragraph nested inside a blockquote", () => {
    const html = "<main><blockquote><p>A single nested quote.</p></blockquote></main>";
    const out = cleanHtml(html, "https://acme.example/x");
    expect(out.text.match(/A single nested quote\./g)).toHaveLength(1);
  });
});

describe("classifyPage", () => {
  it("recognises the homepage", () => {
    expect(classifyPage("https://acme.example/", "Acme")).toBe("homepage");
    expect(classifyPage("https://acme.example", "Acme")).toBe("homepage");
  });

  it("recognises about pages at unpredictable paths", () => {
    expect(classifyPage("https://acme.example/company/team", "Meet the team")).toBe("about");
    expect(classifyPage("https://acme.example/our-story", "Our story")).toBe("about");
  });

  it("recognises careers pages", () => {
    expect(classifyPage("https://acme.example/open-roles", "Careers")).toBe("careers");
    expect(classifyPage("https://acme.example/jobs", "Jobs at Acme")).toBe("careers");
  });

  it("recognises hiring-process pages by content, not path", () => {
    expect(classifyPage("https://acme.example/company/handbook", "The Handbook")).toBe("hiring-process");
    expect(classifyPage("https://acme.example/hiring/process", "How we interview")).toBe("hiring-process");
  });

  it("recognises engineering blogs", () => {
    expect(classifyPage("https://acme.example/blog", "Engineering blog")).toBe("blog");
  });

  it("falls back to other", () => {
    expect(classifyPage("https://acme.example/pricing", "Pricing")).toBe("other");
  });
});

describe("extractMainText", () => {
  it("truncates to the 12k cap", () => {
    const long = "word ".repeat(10000);
    expect(extractMainText(long).length).toBe(12000);
  });
  it("collapses newlines and tabs", () => {
    expect(extractMainText("a\n\n\n b\t\tc")).toBe("a b c");
  });
});
