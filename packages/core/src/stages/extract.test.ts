import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../llm/fake.js";
import { extractRequirements } from "./extract.js";

describe("extractRequirements", () => {
  it("assigns stable ids in order and keeps kinds/priorities", async () => {
    const provider = createFakeProvider([
      () => ({
        title: "Senior Backend Engineer",
        seniority: "senior",
        location: "Remote",
        requirements: [
          { text: "5+ years with Node.js", kind: "technical", priority: "must" },
          { text: "Mentoring juniors", kind: "behavioural", priority: "nice" },
        ],
      }),
    ]);
    const out = await extractRequirements("Some JD text that is long enough to matter here.", provider);
    expect(out.role.title).toBe("Senior Backend Engineer");
    expect(out.role.seniority).toBe("senior");
    expect(out.requirements.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(out.requirements[1]).toMatchObject({ kind: "behavioural", priority: "nice" });
  });

  it("normalises out-of-enum values conservatively and drops empty lines", async () => {
    const provider = createFakeProvider([
      () => ({
        requirements: [
          { text: "   ", kind: "technical", priority: "must" },
          { text: "Something", kind: "nonsense", priority: "nonsense" },
        ],
      }),
    ]);
    const out = await extractRequirements("short", provider);
    expect(out.requirements).toHaveLength(1);
    expect(out.requirements[0]).toMatchObject({ kind: "domain", priority: "nice" });
  });

  it("falls back role fields when the model returns none", async () => {
    const provider = createFakeProvider([() => ({ title: "", seniority: "principal", requirements: [] })]);
    const out = await extractRequirements("tiny", provider);
    expect(out.role.title).toBe("Unknown role");
    expect(out.role.seniority).toBe("unknown");
    expect(out.requirements).toEqual([]);
  });

  it("retries once with a stricter note when a long JD yields nothing", async () => {
    let calls = 0;
    const provider = createFakeProvider([
      () => {
        calls += 1;
        return { requirements: [] };
      },
      () => {
        calls += 1;
        return { requirements: [{ text: "Kubernetes", kind: "technical", priority: "must" }] };
      },
    ]);
    const longJd = "We are looking for an engineer to join our platform team. " + "x".repeat(60);
    const out = await extractRequirements(longJd, provider);
    expect(calls).toBe(2);
    expect(out.requirements.map((r) => r.text)).toEqual(["Kubernetes"]);
    expect(provider.calls[1].prompt).toContain("Strict instruction");
  });
});
