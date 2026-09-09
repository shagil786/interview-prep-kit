// Kit domain types + helpers (shared, DB-free).
// The zod schemas mirroring Appendix A are defined in a later task
// (packages/core/src/schema/kit.ts); the typed id helper below is owned here.

export function appendId(existing: string[], prefix: string): string {
  const max = existing.reduce((m, id) => {
    if (!id.startsWith(prefix)) return m;
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${max + 1}`;
}
