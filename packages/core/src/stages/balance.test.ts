import { describe, expect, it } from "vitest";
import { balanceEmptyCategories, findDuplicatePairs, pickKeep } from "./balance.js";
import type { DraftQuestion, QuestionCategory } from "./questions.js";

const QS = [
  { id: "q1", requirement_ids: ["r1"], category: "technical" as const, prompt: "How do you scale Node.js services?", answer_outline: "a", difficulty: 2 },
  { id: "q2", requirement_ids: ["r1"], category: "technical" as const, prompt: "How do you scale Node.js services?", answer_outline: "b", difficulty: 3 },
  { id: "q3", requirement_ids: ["r2"], category: "behavioural" as const, prompt: "Tell me about a conflict you resolved.", answer_outline: "c", difficulty: 1 },
];

describe("findDuplicatePairs", () => {
  it("pairs same-requirement questions with near-identical prompts", () => {
    const pairs = findDuplicatePairs(QS);
    expect(pairs).toContainEqual(["q1", "q2"]);
  });

  it("does not pair questions covering different requirements", () => {
    const pairs = findDuplicatePairs(QS);
    expect(pairs.some(([a, b]) => [a, b].includes("q3") && [a, b].includes("q1"))).toBe(false);
  });

  it("is case/punctuation-insensitive", () => {
    const a = { id: "x", requirement_ids: ["r1"], prompt: "How do you scale Node.js?" };
    const b = { id: "y", requirement_ids: ["r1"], prompt: "How do you scale nodejs?" };
    expect(findDuplicatePairs([a, b])).toEqual([["x", "y"]]);
  });
});

describe("pickKeep", () => {
  it("keeps the higher-difficulty question", () => {
    expect(pickKeep(["q1", "q2"], QS)).toBe("q2");
  });
  it("ties keep the first id in the pair", () => {
    const even = QS.map((q) => ({ id: q.id, difficulty: 2 }));
    expect(pickKeep(["q1", "q2"], even)).toBe("q1");
  });
});

describe("balanceEmptyCategories", () => {
  const requirements = [
    { id: "r1", text: "5+ years building Node.js services", kind: "technical" as const, priority: "must" as const },
    { id: "r2", text: "Mentor junior engineers", kind: "behavioural" as const, priority: "nice" as const },
  ];

  it("generates one category's worth for an empty justified category", async () => {
    const calls: { category: QuestionCategory; targets: { id: string }[] }[] = [];
    const stub = async (category: QuestionCategory, targets: { id: string }[]) => {
      calls.push({ category, targets });
      return targets.map(
        (t): DraftQuestion => ({
          requirement_ids: [t.id],
          category,
          prompt: "New?",
          answer_outline: "a",
          difficulty: 2,
        }),
      );
    };
    const present: DraftQuestion[] = [
      { requirement_ids: ["r1"], category: "technical", prompt: "p", answer_outline: "a", difficulty: 1 },
    ];
    const added = await balanceEmptyCategories({
      categories: ["technical", "behavioural"],
      questions: present,
      requirements,
      generate: stub,
    });
    expect(calls.map((c) => c.category)).toEqual(["behavioural"]);
    expect(added).toHaveLength(1);
    expect(added[0].category).toBe("behavioural");
    expect(added[0].requirement_ids).toEqual(["r2"]);
  });

  it("does not call generate for categories already populated or unjustified", async () => {
    let calls = 0;
    const stub = async () => {
      calls += 1;
      return [] as DraftQuestion[];
    };
    const questions: DraftQuestion[] = [
      { requirement_ids: ["r1"], category: "technical", prompt: "p", answer_outline: "a", difficulty: 1 },
    ];
    await balanceEmptyCategories({
      categories: ["technical"],
      questions,
      requirements,
      generate: stub,
    });
    expect(calls).toBe(0);
  });
});
