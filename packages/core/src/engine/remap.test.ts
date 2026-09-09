import { describe, expect, it } from "vitest";
import type { Kit } from "../schema/kit.js";
import { appendId } from "../types/kit.js";
import { nextId, remapKitQuestions } from "./remap.js";

function makeKit(scheduleDays: Kit["schedule"]["days"]): Kit {
  return {
    source: {
      company: "Acme", company_url: "https://acme.example", role: "SWE",
      location: "Remote", jd_chars: 120, researched_at: "2026-01-01", pages_used: [],
    },
    company_brief: { summary: "s", what_they_do: "w", sources: ["https://acme.example"], unknowns: [] },
    role: {
      title: "SWE", seniority: "mid", responsibilities: [],
      requirements: [{ id: "r1", text: "req", kind: "technical", priority: "must" }],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p1", answer_outline: "a1", difficulty: 1 },
      { id: "q2", requirement_ids: ["r1"], category: "technical", prompt: "p2", answer_outline: "a2", difficulty: 2 },
      { id: "q3", requirement_ids: ["r1"], category: "behavioural", prompt: "p3", answer_outline: "a3", difficulty: 1 },
    ],
    flashcards: [{ id: "f1", front: "f", back: "b", requirement_ids: ["r1"] }],
    schedule: { days_available: 3, days: scheduleDays },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("nextId", () => {
  it("delegates to appendId and continues a sequence", () => {
    expect(nextId(["q1", "q2"], "q")).toBe(appendId(["q1", "q2"], "q"));
    expect(nextId(["q1", "q2"], "q")).toBe("q3");
    expect(nextId([], "r")).toBe("r1");
  });
});

describe("remapKitQuestions", () => {
  it("replaces a remapped old id with the new id across every schedule day", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2"], minutes: 40 },
      { day: 2, focus: "graphs", question_ids: ["q2", "q3"], minutes: 55 },
    ]);
    const result = remapKitQuestions(kit, new Map([
      ["q1", { oldId: "q1", newId: "q10" }],
      ["q2", { oldId: "q2", newId: "q20" }],
    ]));
    expect(result.schedule.days.map(d => d.question_ids)).toEqual([
      ["q10", "q20"], ["q20", "q3"],
    ]);
  });

  it("deletes (null) old ids from the schedule arrays, keeping surviving ids in place", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2", "q3"], minutes: 40 },
      { day: 2, focus: "graphs", question_ids: ["q2"], minutes: 55 },
    ]);
    const result = remapKitQuestions(kit, new Map([["q2", null]]));
    expect(result.schedule.days.map(d => d.question_ids)).toEqual([["q1", "q3"], []]);
  });

  it("leaves ids not present in the replacements map untouched", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2"], minutes: 40 },
      { day: 2, focus: "graphs", question_ids: ["q3"], minutes: 55 },
    ]);
    const result = remapKitQuestions(kit, new Map([
      ["q1", { oldId: "q1", newId: "q10" }],
      ["q2", null],
    ]));
    // q3 is never a replacement key and must survive verbatim.
    expect(result.schedule.days.map(d => d.question_ids)).toEqual([["q10"], ["q3"]]);
  });

  it("never touches kit.questions (or requirement refs) — only schedule day arrays change", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2"], minutes: 40 },
    ]);
    const questionsBefore = JSON.parse(JSON.stringify(kit.questions));
    const result = remapKitQuestions(kit, new Map([
      ["q1", { oldId: "q1", newId: "q10" }],
      ["q3", null], // q3 not in this schedule; must not affect anything
    ]));
    expect(result.questions).toEqual(questionsBefore);
    expect(result.flashcards).toEqual(kit.flashcards);
    expect(result.coverage).toEqual(kit.coverage);
    // remap never rebuilds the question array; replacing it is the caller's job,
    // so the returned kit shares the untouched array reference.
    expect(result.questions).toBe(kit.questions);
    expect(result.role).toBe(kit.role);
    expect(result.schedule).not.toBe(kit.schedule); // only the schedule is rebuilt
  });

  it("is pure — does not mutate the input kit", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2"], minutes: 40 },
    ]);
    const snapshot = JSON.stringify(kit);
    remapKitQuestions(kit, new Map([
      ["q1", { oldId: "q1", newId: "q10" }],
      ["q2", null],
    ]));
    expect(JSON.stringify(kit)).toBe(snapshot);
  });

  it("is idempotent — re-running with the same replacements map is stable", () => {
    const kit = makeKit([
      { day: 1, focus: "arrays", question_ids: ["q1", "q2", "q3"], minutes: 40 },
      { day: 2, focus: "graphs", question_ids: ["q1"], minutes: 55 },
    ]);
    const replacements = new Map<string, { oldId: string; newId: string } | null>([
      ["q1", { oldId: "q1", newId: "q10" }],
      ["q2", null],
    ]);
    const once = remapKitQuestions(kit, replacements);
    const twice = remapKitQuestions(once, replacements);
    expect(twice.schedule).toEqual(once.schedule);
    // q1 no longer exists after the first pass, so second pass is a structural no-op.
    expect(twice.schedule.days.map(d => d.question_ids)).toEqual(once.schedule.days.map(d => d.question_ids));
  });
});
