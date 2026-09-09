import { describe, expect, it } from "vitest";
import type { Kit } from "@prep/core";
import { applyEdit } from "./applyEdit.js";
import { emptyOverlay, type Overlay } from "./overlay.js";

function fixtureKit(): Kit {
  return {
    source: { company: "Acme", company_url: "https://acme.example", role: "SWE", location: "", jd_chars: 10, researched_at: "2026-09-09T00:00:00.000Z", pages_used: [] },
    company_brief: { summary: "s", what_they_do: "w", sources: [] },
    role: {
      title: "SWE", seniority: "senior", responsibilities: [],
      requirements: [{ id: "r1", text: "React", kind: "technical", priority: "must" }],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p1", answer_outline: "a1", difficulty: 2 },
      { id: "q2", requirement_ids: ["r1"], category: "technical", prompt: "p2", answer_outline: "a2", difficulty: 1 },
    ],
    flashcards: [{ id: "f1", front: "f", back: "b", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "x", question_ids: ["q1", "q2"], minutes: 55 },
        { day: 2, focus: "y", question_ids: [], minutes: 25 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("applyEdit", () => {
  it("upsert-in-place keeps the id and marks the item edited", () => {
    const kit = fixtureKit();
    const overlay: Overlay = emptyOverlay();
    overlay.questions.q1 = { origin: "generated", edited_by_user: false, pinned: false };
    const { kit: next, overlay: nextOverlay } = applyEdit(kit, overlay, {
      type: "upsertQuestion",
      oldId: "q1",
      question: { requirement_ids: ["r1"], category: "technical", prompt: "edited?", answer_outline: "a", difficulty: 3 },
    });
    const q = next.questions.find((x) => x.id === "q1")!;
    expect(q.prompt).toBe("edited?");
    expect(q.difficulty).toBe(3);
    expect(nextOverlay.questions.q1.edited_by_user).toBe(true);
  });

  it("deleteQuestion also removes the id from every schedule day", () => {
    const kit = fixtureKit();
    const out = applyEdit(kit, emptyOverlay(), { type: "deleteQuestion", id: "q1" });
    expect(out.kit.questions.map((q) => q.id)).toEqual(["q2"]);
    expect(out.kit.schedule.days[0].question_ids).toEqual(["q2"]);
  });

  it("adds a user question with a fresh id", () => {
    const kit = fixtureKit();
    const out = applyEdit(kit, emptyOverlay(), {
      type: "upsertQuestion",
      question: { requirement_ids: ["r1"], category: "behavioural", prompt: "new", answer_outline: "a", difficulty: 1 },
    });
    const added = out.kit.questions.find((q) => q.prompt === "new")!;
    expect(added.id).toBe("q3");
    expect(out.overlay.questions.q3.origin).toBe("user");
  });

  it("rejects a reorder that is not a permutation", () => {
    const kit = fixtureKit();
    const before = JSON.stringify(kit.questions.map((q) => q.id));
    const out = applyEdit(kit, emptyOverlay(), { type: "reorderQuestions", orderedIds: ["q1", "ghost"] });
    expect(JSON.stringify(out.kit.questions.map((q) => q.id))).toBe(before);
  });

  it("reorders to the given permutation", () => {
    const kit = fixtureKit();
    const out = applyEdit(kit, emptyOverlay(), { type: "reorderQuestions", orderedIds: ["q2", "q1"] });
    expect(out.kit.questions.map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("moveQuestionCategory updates the category and marks edited", () => {
    const kit = fixtureKit();
    const overlay = emptyOverlay();
    overlay.questions.q1 = { origin: "generated", edited_by_user: false, pinned: false };
    const out = applyEdit(kit, overlay, { type: "moveQuestionCategory", id: "q1", category: "system-design" });
    expect(out.kit.questions.find((q) => q.id === "q1")!.category).toBe("system-design");
    expect(out.overlay.questions.q1.edited_by_user).toBe(true);
  });
});
