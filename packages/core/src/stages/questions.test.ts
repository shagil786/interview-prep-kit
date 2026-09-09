import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../llm/fake.js";
import { generateFlashcards } from "./flashcards.js";
import { categoriesFor, generateQuestionsForCategory, type RequirementLike } from "./questions.js";

const REQS: RequirementLike[] = [
  { id: "r1", text: "5+ years building Node.js services", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentor junior engineers", kind: "behavioural", priority: "nice" },
  { id: "r3", text: "Fintech domain knowledge", kind: "domain", priority: "nice" },
];

describe("categoriesFor", () => {
  it("derives categories purely from evidence", () => {
    expect(categoriesFor(REQS, { hiring_process: null, what_they_do_excerpts: [] })).toEqual([
      "technical",
      "behavioural",
    ]);
    expect(
      categoriesFor(REQS, { hiring_process: null, what_they_do_excerpts: [{ url: "u", text: "t" }] }),
    ).toEqual(["technical", "behavioural", "company-fit"]);
  });

  it("adds behavioural and system-design from requirement text", () => {
    const senior = [{ text: "Design distributed systems at senior level", kind: "technical" }];
    const finding = {
      hiring_process: { text: "Candidates do a system design round." },
      what_they_do_excerpts: [],
    };
    const out = categoriesFor(
      [{ text: "Lead a team of five", kind: "behavioural" }, ...senior],
      finding,
    );
    expect(out).toContain("behavioural");
    expect(out).toContain("system-design");
    expect(out).toContain("technical");
  });

  it("never invents company-fit without research", () => {
    const out = categoriesFor([{ text: "React", kind: "technical" }], {
      hiring_process: null,
      what_they_do_excerpts: [],
    });
    expect(out).not.toContain("company-fit");
  });
});

describe("generateQuestionsForCategory", () => {
  it("filters out unknown requirement ids, clamps difficulty, drops empty rows", async () => {
    const provider = createFakeProvider([
      () => ({
        questions: [
          { requirement_ids: ["r1", "r99"], prompt: "How do you scale Node?", answer_outline: "Profiling", difficulty: 9 },
          { requirement_ids: ["r2"], prompt: "Tell me about a conflict.", answer_outline: "STAR", difficulty: 2 },
          { requirement_ids: ["r1"], prompt: "", answer_outline: "x", difficulty: 1 },
        ],
      }),
    ]);
    const out = await generateQuestionsForCategory({ category: "technical", requirements: REQS }, provider);
    expect(out).toHaveLength(2);
    expect(out[0].requirement_ids).toEqual(["r1"]);
    expect(out[0].difficulty).toBe(3); // 9 clamped
    expect(out[0].category).toBe("technical");
    expect(out[1].requirement_ids).toEqual(["r2"]);
  });

  it("returns [] when the model returns nothing usable", async () => {
    const provider = createFakeProvider([() => ({ questions: [] })]);
    const out = await generateQuestionsForCategory({ category: "technical", requirements: REQS }, provider);
    expect(out).toEqual([]);
  });
});

describe("generateFlashcards", () => {
  it("keeps only cards referencing known requirements", async () => {
    const provider = createFakeProvider([
      () => ({
        flashcards: [
          { front: "Node event loop?", back: "Single-threaded", requirement_ids: ["r1"] },
          { front: "Ghost?", back: "No", requirement_ids: ["r99"] },
        ],
      }),
    ]);
    const out = await generateFlashcards(
      { requirements: REQS, questions: [{ id: "q1", prompt: "scale node?" }] },
      provider,
    );
    expect(out).toHaveLength(1);
    expect(out[0].front).toBe("Node event loop?");
    expect(out[0].requirement_ids).toEqual(["r1"]);
  });
});
