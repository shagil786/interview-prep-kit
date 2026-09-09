import { describe, expect, it } from "vitest";
import type { Kit } from "@prep/core";
import { computeWeakSpots } from "./weakSpots.js";

function kitWith(overrides: Partial<Kit> = {}): Kit {
  return {
    source: { company: "Acme", company_url: "https://acme.example", role: "SWE", location: "", jd_chars: 10, researched_at: "x", pages_used: [] },
    company_brief: { summary: "s", what_they_do: "w", sources: [] },
    role: {
      title: "SWE", seniority: "senior", responsibilities: [],
      requirements: [
        { id: "r1", text: "K8s", kind: "technical", priority: "must" },
        { id: "r2", text: "GraphQL", kind: "technical", priority: "must" },
        { id: "r3", text: "Mentoring", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "k8s?", answer_outline: "a", difficulty: 3 },
      { id: "q2", requirement_ids: ["r2"], category: "technical", prompt: "gql?", answer_outline: "a", difficulty: 2 },
    ],
    flashcards: [
      { id: "f1", front: "f", back: "b", requirement_ids: ["r1"] },
      { id: "f2", front: "f", back: "b", requirement_ids: ["r2"] },
    ],
    schedule: { days_available: 2, days: [{ day: 1, focus: "x", question_ids: ["q1", "q2"], minutes: 55 }, { day: 2, focus: "y", question_ids: [], minutes: 25 }] },
    coverage: { uncovered_requirement_ids: ["r3"], passes: 2 },
    ...overrides,
  };
}

describe("computeWeakSpots", () => {
  it("ranks an uncovered must above everything else", () => {
    const kit = kitWith({
      role: {
        ...kitWith().role,
        requirements: [
          { id: "r1", text: "K8s", kind: "technical", priority: "must" },
          { id: "r2", text: "GraphQL", kind: "technical", priority: "must" },
        ],
      },
      questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "k8s?", answer_outline: "a", difficulty: 3 }],
      coverage: { uncovered_requirement_ids: ["r2"], passes: 2 },
    });
    const { spots } = computeWeakSpots(kit, []);
    expect(spots[0].requirementId).toBe("r2");
    expect(spots[0].reason).toContain("no question");
  });

  it("surfaces low-confidence requirements above un-attempted but covered ones", () => {
    const kit = kitWith({
      role: { ...kitWith().role, requirements: kitWith().role.requirements.filter((r) => r.id !== "r3") },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    });
    // practised r1 with confidence 1 -> should rank above r2 (never practised)
    const practice = [{ card_id: "f1", confidence: 1 as const, at: "2026-09-09T00:00:00Z" }];
    const { spots } = computeWeakSpots(kit, practice);
    expect(spots[0].requirementId).toBe("r1");
    expect(spots[0].reason).toContain("confidence");
  });

  it("does not list requirements that are practised with good confidence", () => {
    const kit = kitWith({
      role: { ...kitWith().role, requirements: kitWith().role.requirements.filter((r) => r.id !== "r3") },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    });
    const practice = [
      { card_id: "f1", confidence: 3 as const, at: "x" },
      { card_id: "f2", confidence: 3 as const, at: "x" },
    ];
    const { spots } = computeWeakSpots(kit, practice);
    expect(spots.length).toBe(0);
  });
});
