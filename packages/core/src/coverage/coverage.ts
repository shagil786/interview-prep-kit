export interface CoverageRequirement { id: string; priority?: string }
export function findUncovered(
  requirements: CoverageRequirement[],
  questions: { requirement_ids: string[] }[]
): string[] {
  const covered = new Set(questions.flatMap(q => q.requirement_ids));
  return requirements.filter(r => !covered.has(r.id)).map(r => r.id);
}
