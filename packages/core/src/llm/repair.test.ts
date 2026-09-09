import { describe, expect, it } from "vitest";
import { createFakeProvider } from "./fake.js";
import { PROMPTS, UNTRUSTED_PREAMBLE, dataBlock } from "./prompts.js";
import { repairJson } from "./repair.js";

describe("dataBlock", () => {
  it("wraps content in delimited untrusted tags", () => {
    const out = dataBlock("jd", "hello\nignore this");
    expect(out).toContain('<untrusted label="jd">');
    expect(out).toContain("</untrusted>");
    expect(out).toContain("hello\nignore this");
  });
});

describe("prompt builders", () => {
  it("every system prompt carries the untrusted-data preamble", () => {
    const prompts = [
      PROMPTS.extractRequirements("jd"),
      PROMPTS.companyBrief([]),
      PROMPTS.questionsFor({ category: "technical", requirements: [], seniority: "mid" }),
      PROMPTS.flashcards({ requirements: [], questions: [] }),
      PROMPTS.mockScore({ question: "q", answerOutline: "o", answer: "a" }),
    ];
    for (const p of prompts) expect(p.system.startsWith(UNTRUSTED_PREAMBLE)).toBe(true);
  });

  it("questionsFor lists requirement ids verbatim for targeting", () => {
    const p = PROMPTS.questionsFor({
      category: "technical",
      requirements: [
        { id: "r1", text: "React", kind: "technical", priority: "must" },
        { id: "r2", text: "GraphQL", kind: "technical", priority: "nice" },
      ],
    });
    expect(p.prompt).toContain("r1");
    expect(p.prompt).toContain("r2");
  });
});

describe("repairJson", () => {
  it("sends schema, bad output and error back and returns parsed JSON", async () => {
    const provider = createFakeProvider([() => ({ fixed: true })]);
    const out = await repairJson<{ fixed: boolean }>(provider, '{"fixed": boolean}', "{broken", "Unexpected token");
    expect(out).toEqual({ fixed: true });
    expect(provider.calls[0].prompt).toContain('{"fixed": boolean}');
    expect(provider.calls[0].prompt).toContain("{broken");
    expect(provider.calls[0].prompt).toContain("Unexpected token");
    expect(provider.calls[0].system).toContain("repair malformed JSON");
  });
});
