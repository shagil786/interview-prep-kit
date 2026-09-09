import type { PipelineDeps } from "@prep/core";
import { KitModel, type KitDoc } from "../models/kit.js";
import { pipelineDepsFromEnv } from "./envDeps.js";

type PipelineImpl = typeof import("@prep/core").runPipeline;
let pipelineImpl: PipelineImpl = (input, deps) => import("@prep/core").then((m) => m.runPipeline(input, deps));

/** Test seam: replace the pipeline implementation used by runJob. */
export function setPipelineForTests(impl: PipelineImpl | null): void {
  pipelineImpl = impl ?? ((input, deps) => import("@prep/core").then((m) => m.runPipeline(input, deps)));
}

/** Serialise job starts so one user cannot burst the free-tier budget. */
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

export async function runJob(kitId: string, deps?: PipelineDeps): Promise<void> {
  await serial(async () => {
    const doc = await KitModel.findById(kitId);
    if (!doc) return;
    if (doc.status !== "generating") return;

    const pipelineDeps = deps ?? pipelineDepsFromEnv();
    const input = { id: kitId, jd: doc.caseInput.jd, company_url: doc.caseInput.company_url, days: doc.caseInput.days };
    try {
      const { kit, job } = await pipelineImpl(input, {
        ...pipelineDeps,
        onProgress: (j) => {
          void saveProgress(doc, jobToSteps(j));
        },
      });
      doc.kit = kit;
      doc.overlay = overlayFor(kit);
      doc.research = { pages_used: kit.source.pages_used };
      doc.job = jobToSteps(job) ? { steps: jobToSteps(job) } : (job as { steps: unknown[] });
      doc.status = "ready";
      doc.error = null;
      await doc.save();
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const code = (err as { code?: string }).code ?? "GENERATION_FAILED";
      doc.status = "failed";
      doc.error = { code, message };
      const steps = (doc.job?.steps ?? []) as { status: string }[];
      const last = steps[steps.length - 1];
      if (last && last.status === "running") {
        (last as { status: string; detail?: string }).status = "failed";
        (last as { detail?: string }).detail = message;
      }
      await doc.save();
    }
  });
}

function overlayFor(kit: KitDoc["kit"]): unknown {
  if (!kit) return { questions: {}, flashcards: {} };
  const questions: Record<string, { origin: "generated"; edited_by_user: boolean; pinned: boolean }> = {};
  for (const q of kit.questions) questions[q.id] = { origin: "generated", edited_by_user: false, pinned: false };
  const flashcards: Record<string, { origin: "generated"; edited_by_user: boolean; pinned: boolean }> = {};
  for (const f of kit.flashcards) flashcards[f.id] = { origin: "generated", edited_by_user: false, pinned: false };
  return { brief: { origin: "generated", edited_by_user: false, pinned: false }, questions, flashcards };
}

async function saveProgress(doc: InstanceType<typeof KitModel>, steps: unknown[]): Promise<void> {
  doc.job = { steps };
  await doc.save().catch(() => undefined);
}

/** Tolerate both Job instances (toJSON) and plain {steps} snapshots (tests). */
function jobToSteps(job: unknown): unknown[] {
  const j = job as { toJSON?: () => { steps: unknown[] }; steps?: unknown[] };
  if (typeof j?.toJSON === "function") return j.toJSON().steps;
  return Array.isArray(j?.steps) ? j.steps : [];
}
