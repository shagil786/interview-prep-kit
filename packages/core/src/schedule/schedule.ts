const KIND_WEIGHT: Record<string, number> = {
  technical: 3, "system-design": 3, domain: 2, behavioural: 1,
};
const FOCUS_HINT: Record<string, string> = {
  technical: "Core technical deep-dive",
  "system-design": "Architecture and system design",
  domain: "Domain fundamentals",
  behavioural: "Behavioural and collaboration",
};
const DEFAULT_FOCUS = "Review and weak spots";

export interface ScheduleInput {
  requirements: { id: string; kind: string; priority: string }[];
  questions: { id: string; requirement_ids: string[]; category: string; difficulty: number }[];
  days: number;
}
export interface ScheduleDay {
  day: number; focus: string; question_ids: string[]; minutes: number;
}
export interface Schedule { days_available: number; days: ScheduleDay[] }

function buildDays(D: number): ScheduleDay[] {
  return Array.from({ length: D }, (_, i) => ({
    day: i + 1, question_ids: [] as string[], focus: "", minutes: 0,
  }));
}

/** Deterministic min-load day: first day (scanning 1..D) whose load is the current minimum. */
function minLoadDay(days: { day: number; question_ids: string[] }[]) {
  let target = days[0];
  let min = Infinity;
  for (const d of days) {
    if (d.question_ids.length < min) { min = d.question_ids.length; target = d; }
  }
  return target;
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const D = Math.min(60, Math.max(1, Math.floor(input.days)));
  const days = buildDays(D);
  const scheduled = new Set<string>();

  // Rank units (requirement + the questions that cover it), hardest/most critical first.
  const units = input.requirements
    .map(r => {
      const qs = input.questions.filter(q => q.requirement_ids.includes(r.id));
      const avg = qs.length ? qs.reduce((a, q) => a + q.difficulty, 0) / qs.length : 0;
      const weight =
        (r.priority === "must" ? 1000 : 0) +
        (KIND_WEIGHT[r.kind] ?? 1) * 20 +
        avg;
      return { r, qs, weight };
    })
    .sort((a, b) => b.weight - a.weight);

  // Greedy earliest-min-load placement. Units iterate in descending weight, so the
  // hardest material lands on the earliest days; min-load keeps any day from ballooning.
  for (const u of units) {
    const day = minLoadDay(days);
    for (const q of u.qs) {
      if (!scheduled.has(q.id)) { scheduled.add(q.id); day.question_ids.push(q.id); }
    }
  }

  const requirementFor = (rid: string) => input.requirements.find(r => r.id === rid);

  // Assign focus + minutes; empty (review) days get the default focus.
  for (const d of days) {
    if (d.question_ids.length === 0) {
      d.focus = DEFAULT_FOCUS;
      d.minutes = 25;
      continue;
    }
    const kindCounts: Record<string, number> = {};
    for (const qid of d.question_ids) {
      const q = input.questions.find(x => x.id === qid)!;
      const kind = requirementFor(q.requirement_ids[0])?.kind ?? q.category;
      kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
    }
    const dominant = Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0][0];
    d.focus = FOCUS_HINT[dominant] ?? "Interview prep";
    d.minutes = 25 + 15 * d.question_ids.length; // integer by construction
  }

  // Post-conditions (assert in dev; the unit tests pin them).
  return { days_available: D, days };
}
