import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../llm/fake.js";
import { generateBrief } from "./brief.js";
import type { ResearchFinding } from "./research.js";

const finding = (overrides: Partial<ResearchFinding> = {}): ResearchFinding => ({
  pages_used: ["https://acme.example/about"],
  what_they_do_excerpts: [{ url: "https://acme.example/about", text: "Acme builds developer tools." }],
  hiring_process: { url: "https://acme.example/handbook", text: "Take-home then system design." },
  discussion: [],
  unknowns: [],
  ...overrides,
});

describe("generateBrief", () => {
  it("keeps only sources the model could actually have used", async () => {
    const provider = createFakeProvider([
      () => ({
        summary: "Developer tools company.",
        what_they_do: "API tooling.",
        sources: ["https://acme.example/about", "https://fake.example/never-fetched"],
        unknowns: [],
      }),
    ]);
    const out = await generateBrief(finding(), provider);
    expect(out.sources).toEqual(["https://acme.example/about"]);
  });

  it("unions research unknowns with model unknowns", async () => {
    const provider = createFakeProvider([
      () => ({ summary: "s", what_they_do: "w", sources: [], unknowns: ["no salary info"] }),
    ]);
    const out = await generateBrief(finding({ unknowns: ["no public hiring page found"] }), provider);
    expect(out.unknowns).toContain("no public hiring page found");
    expect(out.unknowns).toContain("no salary info");
  });

  it("returns an honest stub without calling the provider when nothing was retrieved", async () => {
    const provider = createFakeProvider([() => ({ summary: "should not be used" })]);
    const out = await generateBrief(
      finding({ what_they_do_excerpts: [], hiring_process: null, discussion: [], unknowns: ["site unreachable"] }),
      provider,
    );
    expect(provider.calls).toHaveLength(0);
    expect(out.summary).toContain("No retrievable information");
    expect(out.what_they_do).toBe("");
    expect(out.unknowns).toContain("site unreachable");
  });

  it("falls back to honest summary text if the model returns an empty summary", async () => {
    const provider = createFakeProvider([() => ({ summary: "", what_they_do: "w", sources: [], unknowns: [] })]);
    const out = await generateBrief(finding(), provider);
    expect(out.summary.length).toBeGreaterThan(0);
  });
});
