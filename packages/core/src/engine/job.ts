export type StageStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface JobStep {
  stage: string;
  label: string;
  status: StageStatus;
  detail?: string;
  at: string;
}

/**
 * Ordered, serialisable record of pipeline progress. The API persists
 * `job.toJSON()` on the kit document; the UI renders the steps; the CLI
 * prints them. A step moves running -> done | skipped | failed via the
 * succeed/skip/fail calls.
 */
export class Job {
  readonly steps: JobStep[] = [];
  private currentIndex = -1;

  begin(stage: string, label: string): void {
    this.steps.push({ stage, label, status: "running", at: new Date().toISOString() });
    this.currentIndex = this.steps.length - 1;
  }

  private current(): JobStep | undefined {
    return this.currentIndex >= 0 ? this.steps[this.currentIndex] : undefined;
  }

  succeed(detail?: string): void {
    const step = this.current();
    if (!step) return;
    step.status = "done";
    if (detail !== undefined) step.detail = detail;
  }

  skip(detail: string): void {
    const step = this.current();
    if (!step) return;
    step.status = "skipped";
    step.detail = detail;
  }

  fail(error: string): void {
    const step = this.current();
    if (!step) return;
    step.status = "failed";
    step.detail = error;
  }

  toJSON(): { steps: JobStep[] } {
    return { steps: this.steps.map((s) => ({ ...s })) };
  }
}
