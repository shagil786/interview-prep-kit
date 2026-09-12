"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useDebouncedSave } from "./use-debounced-save";
import type { Kit, KitPayload } from "./types";

export function BriefTab(props: {
  kit: Kit;
  overlay?: KitPayload["overlay"];
  saveEdit: (edit: unknown) => Promise<void>;
  askRegen: (t: { scope: string; category?: string }) => void;
}) {
  const { kit, saveEdit, askRegen } = props;
  const brief = kit.company_brief;
  const saveBrief = useCallback(
    (patch: { summary?: string; what_they_do?: string }) => {
      void saveEdit({
        type: "updateBrief",
        brief: { summary: patch.summary ?? brief.summary, what_they_do: patch.what_they_do ?? brief.what_they_do },
      });
    },
    [saveEdit, brief.summary, brief.what_they_do],
  );
  const debounceSummary = useDebouncedSave((v: string) => saveBrief({ summary: v }));
  const debounceWhat = useDebouncedSave((v: string) => saveBrief({ what_they_do: v }));

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Company brief</h2>
          <Button variant="outline" size="sm" onClick={() => askRegen({ scope: "brief" })}>
            Regenerate
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-summary">Summary</Label>
          <Textarea id="brief-summary" defaultValue={brief.summary} onChange={(e) => debounceSummary(e.target.value)} rows={4} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-what">What they do</Label>
          <Textarea id="brief-what" defaultValue={brief.what_they_do} onChange={(e) => debounceWhat(e.target.value)} rows={3} />
        </div>
        {(brief.unknowns?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">Honest unknowns</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {brief.unknowns!.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border bg-card p-5 text-sm">
          <p className="font-medium">How this was researched</p>
          {kit.source.pages_used.length === 0 ? (
            <p className="mt-1 text-muted-foreground">No company pages could be retrieved — the brief reflects that.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {kit.source.pages_used.map((u) => (
                <li key={u} className="truncate">
                  <a href={u} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Role &amp; requirements</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {kit.role.title} · {kit.role.seniority} · {kit.source.jd_chars} chars of description
          </p>
          <ul className="mt-3 space-y-2">
            {kit.role.requirements.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-sm">
                <Badge variant={r.priority === "must" ? "default" : "secondary"} className="mt-0.5 shrink-0">
                  {r.priority}
                </Badge>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
