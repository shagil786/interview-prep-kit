import { describe, expect, it } from "vitest";
import { runCoverageLoop } from "./cover.js";
import type { DraftQuestion, QuestionCategory, RequirementLike } from "./questions.js";

const REQUIREMENTS: RequirementLike[] = [
  { id: "r1", text: "Kubernetes", kind: "technical", priority: "must" },
  { id: "r2", text: "GraphQL", kind: "technical", priority: "nice" },
  { id: "r3", text: "Mentoring", kind: "behavioural", priority: "must" },
];

const q = (id: string, req: string, category: QuestionCategory = "technical"): DraftQuestion => ({
  requirement_ids: [req],
  category,
  prompt: `prompt ${id}`,
  answer_outline: "outline",
  difficulty: 2,
});

describe("runCoverageLoop", () => {
  it("does no repair pass when every must is covered (passes stays 1)", async () => {
    let calls = 0;
    const result = await runCoverageLoop({
      requirements: REQUIREMENTS,
      questions: [q("a", "r1"), q("b", "r3", "behavioural")],
      generate: async () => {
        calls += 1;
        return [];
      },
    });
    expect(calls).toBe(0);
    expect(result.passes).toBe(1);
    expect(result.uncovered).toEqual(["r2"]); // nice-only gap is reported, not repaired
  });

  it("closes a must-gap in one targeted pass and records passes 2", async () => {
    const generated: DraftQuestion[] = [q("n1", "r1")];
    const result = await runCoverageLoop({
      requirements: REQUIREMENTS,
      questions: [q("a", "r3", "behavioural")], // r1 must uncovered
      generate: async (category, targets) => {
        expect(category).toBe("technical");
        expect(targets.map((t) => t.id)).toEqual(["r1"]);
        return generated;
      },
      maxRepairPasses: 2,
    });
    expect(result.passes).toBe(2);
    expect(result.questions.map((x) => x.requirement_ids[0])).toContain("r1");
    // Musts are closed; the nice-only r2 gap is reported honestly.
    expect(result.uncovered).toEqual(["r2"]);
  });

  it("stops after maxRepairPasses when the generator cannot close a gap", async () => {
    let calls = 0;
    const result = await runCoverageLoop({
      requirements: REQUIREMENTS,
      questions: [], // r1 (technical) and r3 (behavioural) musts uncovered
      generate: async () => {
        calls += 1;
        return [];
      },
      maxRepairPasses: 2,
    });
    // 2 passes x 2 affected categories (technical + behavioural) per pass.
    expect(calls).toBe(4);
    expect(result.passes).toBe(3); // draft + 2 repair rounds
    expect(result.uncovered).toContain("r1");
    expect(result.uncovered).toContain("r3");
  });
});
