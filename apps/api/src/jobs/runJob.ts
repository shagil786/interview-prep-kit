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

    // All writes go through atomic updateOne on a chained promise: progress
    // callbacks fire asynchronously, and a racing document .save() would throw
    // ParallelSaveError and crash the process (seen during the live audit).
    let writeChain: Promise<unknown> = Promise.resolve();
    const persist = (patch: Record<string, unknown>): Promise<unknown> => {
      writeChain = writeChain.then(() => KitModel.updateOne({ _id: kitId }, { $set: patch }).catch(() => undefined));
      return writeChain;
    };

    try {
      const pipelineDeps = deps ?? pipelineDepsFromEnv();
      const input = { id: kitId, jd: doc.caseInput.jd, company_url: doc.caseInput.company_url, days: doc.caseInput.days };
      const { kit, job } = await pipelineImpl(input, {
        ...pipelineDeps,
        onProgress: (j) => {
          void persist({ job: { steps: jobToSteps(j) } });
        },
      });
      await writeChain;
      await persist({
        kit,
        overlay: overlayFor(kit),
        research: { pages_used: kit.source.pages_used },
        job: { steps: jobToSteps(job) },
        status: "ready",
        error: null,
      });
    } catch (err) {
      await writeChain;
      const message = (err as Error).message ?? String(err);
      const code = (err as { code?: string }).code ?? "GENERATION_FAILED";
      const fresh = await KitModel.findById(kitId);
      const steps = ((fresh?.job?.steps ?? []) as { status: string; detail?: string }[]);
      const last = steps[steps.length - 1];
      if (last && last.status === "running") {
        last.status = "failed";
        last.detail = message;
      }
      await persist({ status: "failed", error: { code, message }, job: { steps } });
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

/** Tolerate both Job instances (toJSON) and plain {steps} snapshots (tests). */
function jobToSteps(job: unknown): unknown[] {
  const j = job as { toJSON?: () => { steps: unknown[] }; steps?: unknown[] };
  if (typeof j?.toJSON === "function") return j.toJSON().steps;
  return Array.isArray(j?.steps) ? j.steps : [];
}
