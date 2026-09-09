import { describe, expect, it } from "vitest";
import { isInternal, scoreLink } from "./score.js";

describe("scoreLink", () => {
  it("scores careers/jobs/hiring links above about links above the homepage", () => {
    const careers = scoreLink("Careers at Acme", "https://acme.example/careers");
    const about = scoreLink("About us", "https://acme.example/about");
    const home = scoreLink("Home", "https://acme.example/");
    expect(careers).toBeGreaterThan(about);
    expect(about).toBeGreaterThan(home);
  });

  it("treats a hiring-process page as highly relevant", () => {
    const process = scoreLink("How we hire - interview process", "https://acme.example/life/hiring");
    const blog = scoreLink("Engineering blog", "https://acme.example/blog");
    expect(process).toBeGreaterThan(blog);
  });

  it("counts url path keywords at half weight", () => {
    const textOnly = scoreLink("plain anchor", "https://acme.example/");
    const withPath = scoreLink("plain anchor", "https://acme.example/careers");
    expect(withPath).toBeGreaterThan(textOnly);
  });

  it("is deterministic", () => {
    expect(scoreLink("Careers", "https://acme.example/jobs")).toBe(
      scoreLink("Careers", "https://acme.example/jobs"),
    );
  });

  it("is case-insensitive and ignores punctuation", () => {
    expect(scoreLink("CAREERS!", "https://acme.example/")).toBe(scoreLink("careers", "https://acme.example/"));
  });
});

describe("isInternal", () => {
  const base = new URL("https://acme.example/");
  it("accepts relative links", () => {
    expect(isInternal(base, "/careers")).toBe(true);
    expect(isInternal(base, "careers/engineer")).toBe(true);
  });
  it("accepts absolute links on the same origin", () => {
    expect(isInternal(base, "https://acme.example/about")).toBe(true);
  });
  it("rejects other origins", () => {
    expect(isInternal(base, "https://evil.example/careers")).toBe(false);
  });
  it("rejects non-http schemes", () => {
    expect(isInternal(base, "mailto:jobs@acme.example")).toBe(false);
    expect(isInternal(base, "javascript:alert(1)")).toBe(false);
    expect(isInternal(base, "ftp://acme.example/file")).toBe(false);
  });
  it("rejects unparsable candidates", () => {
    expect(isInternal(base, "http://")).toBe(false);
  });
});
