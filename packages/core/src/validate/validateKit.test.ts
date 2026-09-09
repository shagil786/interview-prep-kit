import { describe, expect, it } from "vitest";
import { validateKit } from "./validateKit.js";

// NOTE: the brief's fixture used days_available: 5 with a single scheduled day (day 1),
// which contradicts the strict validator rule "exactly days_available contiguous days".
// Resolved (per plan decision) by making the fixture genuinely valid: days_available 1.
const validKit = {
  source: { company: "Acme", company_url: "https://acme.example", role: "SWE", location: "", jd_chars: 120, researched_at: new Date().toISOString(), pages_used: [] },
  company_brief: { summary: "s", what_they_do: "w", sources: [] },
  role: { title: "SWE", seniority: "senior", responsibilities: [], requirements: [{ id: "r1", text: "React", kind: "technical", priority: "must" }] },
  questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p", answer_outline: "a", difficulty: 2 }],
  flashcards: [{ id: "f1", front: "f", back: "b", requirement_ids: ["r1"] }],
  schedule: { days_available: 1, days: [{ day: 1, focus: "x", question_ids: ["q1"], minutes: 60 }] },
  coverage: { uncovered_requirement_ids: [], passes: 2 },
};

describe("validateKit", () => {
  it("accepts a structurally valid kit", () => expect(validateKit(validKit)).toEqual([]));
  it("rejects duplicate ids", () => {
    const k = structuredClone(validKit); k.questions.push({ ...k.questions[0], prompt: "p2" });
    expect(validateKit(k).join()).toContain("duplicate");
  });
  it("rejects question referencing unknown requirement", () => {
    const k = structuredClone(validKit); k.questions[0].requirement_ids = ["r99"];
    expect(validateKit(k).join()).toContain("r99");
  });
  it("rejects schedule referencing unknown question", () => {
    const k = structuredClone(validKit); k.schedule.days[0].question_ids = ["q99"];
    expect(validateKit(k).join()).toContain("q99");
  });
  it("rejects float minutes and difficulty out of range", () => {
    const k = structuredClone(validKit); k.schedule.days[0].minutes = 60.5;
    expect(validateKit(k).join()).toContain("minutes");
    const k2 = structuredClone(validKit); k2.questions[0].difficulty = 4;
    expect(validateKit(k2).join()).toContain("difficulty");
  });
  it("rejects schedule with wrong day count", () => {
    const k = structuredClone(validKit); k.schedule.days[0].day = 2;
    expect(validateKit(k).join()).toContain("day");
  });
  it("rejects uncovered must-have requirement", () => {
    const k = structuredClone(validKit); k.coverage.uncovered_requirement_ids = [];
    // Point q1 at a non-existent requirement rather than emptying requirement_ids:
    // questionSchema requires >= 1 id (verbatim Appendix A), so an empty array would
    // be rejected by the schema parse before the uncovered-must rule could run.
    k.questions[0].requirement_ids = ["r99"];
    expect(validateKit(k).join()).toContain("uncovered");
  });
});
