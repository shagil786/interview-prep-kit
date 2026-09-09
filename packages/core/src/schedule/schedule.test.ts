import { describe, expect, it } from "vitest";
import { buildSchedule } from "./schedule.js";
const reqs = [
  { id: "r1", kind: "technical", priority: "must" },
  { id: "r2", kind: "behavioural", priority: "nice" },
  { id: "r3", kind: "domain", priority: "must" },
];
const qs = [
  { id: "q1", requirement_ids: ["r1"], category: "technical", difficulty: 3 },
  { id: "q2", requirement_ids: ["r2"], category: "behavioural", difficulty: 1 },
  { id: "q3", requirement_ids: ["r3"], category: "technical", difficulty: 2 },
];
function ids(s: ReturnType<typeof buildSchedule>) { return s.days.flatMap(d => d.question_ids); }
describe("buildSchedule", () => {
  it("produces exactly the requested number of days", () =>
    expect(buildSchedule({ requirements: reqs, questions: qs, days: 5 }).days).toHaveLength(5));
  it("covers every must requirement somewhere", () => {
    const s = buildSchedule({ requirements: reqs, questions: qs, days: 3 });
    for (const rid of ["r1", "r3"])
      expect(qs.filter(q => q.requirement_ids.includes(rid)).map(q => q.id).some(id => ids(s).includes(id))).toBe(true);
  });
  it("front-loads harder, must-have material", () => {
    const s = buildSchedule({ requirements: reqs, questions: qs, days: 3 });
    const order = ids(s);
    expect(order.indexOf("q1")).toBeLessThan(order.indexOf("q2")); // q1 must+difficulty3 first
  });
  it("never references a question id outside the kit and uses integer minutes", () => {
    const s = buildSchedule({ requirements: reqs, questions: qs, days: 3 });
    const known = new Set(qs.map(q => q.id));
    for (const d of s.days) {
      for (const qid of d.question_ids) expect(known.has(qid)).toBe(true);
      expect(Number.isInteger(d.minutes) && d.minutes > 0).toBe(true);
    }
  });
  it("handles a 1-day and a 60-day request", () => {
    expect(buildSchedule({ requirements: reqs, questions: qs, days: 1 }).days).toHaveLength(1);
    const big = buildSchedule({ requirements: reqs, questions: qs, days: 60 });
    expect(big.days).toHaveLength(60);
    for (const d of big.days) expect(Number.isInteger(d.minutes)).toBe(true);
  });
  it("labels each day with a non-empty focus", () => {
    for (const d of buildSchedule({ requirements: reqs, questions: qs, days: 4 }).days)
      expect(d.focus.length).toBeGreaterThan(0);
  });
});
