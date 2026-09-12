import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { cn } from "@/lib/utils";
import type { ItemMeta, Step } from "./types";

export function GeneratingPanel({ job }: { job: Step[] }) {
  return (
    <div className="relative rounded-xl border bg-card p-6">
      <BorderBeam size={180} duration={9} />
      <ol className="space-y-4">
        <AnimatedList delay={500}>
          {job.map((s, i) => (
            <AnimatedListItem key={`${s.stage}-${i}`}>
              <div className="flex items-start gap-3 text-sm">
                <StatusDot status={s.status} />
                <div className="min-w-0">
                  <p className="font-medium">{s.label}</p>
                  {s.detail && <p className="text-muted-foreground">{s.detail}</p>}
                </div>
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
        <li className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full bg-primary/60" aria-hidden />
          Working on it — this usually takes a minute or two.
        </li>
      </ol>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "done"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-destructive"
        : status === "running"
          ? "bg-amber-500"
          : status === "skipped"
            ? "bg-muted-foreground/40"
            : "bg-muted-foreground/30";
  return <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", color, status === "running" && "animate-pulse")} aria-hidden />;
}

export function ProvenanceBadges({ meta }: { meta: ItemMeta }) {
  return (
    <>
      {meta.origin === "user" && <Badge className="bg-violet-600 hover:bg-violet-600">yours</Badge>}
      {meta.edited_by_user && <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400">edited · kept on regen</Badge>}
      {meta.pinned && <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">pinned</Badge>}
    </>
  );
}

export function CoverageBadge({ uncovered }: { uncovered: number }) {
  if (uncovered > 0) {
    return <Badge variant="destructive">{uncovered} uncovered</Badge>;
  }
  return (
    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
      all musts covered
    </Badge>
  );
}

export function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs" aria-label={`difficulty ${level} of 3`}>
      <span aria-hidden className="tracking-tight">
        <span className="text-primary">{"●".repeat(level)}</span>
        <span className="text-muted-foreground/40">{"○".repeat(3 - level)}</span>
      </span>
    </span>
  );
}
