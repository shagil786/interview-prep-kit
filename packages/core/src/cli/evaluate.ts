import "dotenv/config";
import { createFetcher } from "../retrieval/fetch.js";
import { providerFromEnv } from "../llm/factory.js";
import type { LlmProvider } from "../llm/provider.js";
import { searchFromEnv } from "../retrieval/searchFactory.js";
import { TokenBucketLimiter } from "../engine/rateLimit.js";
import { runPipeline, type PipelineDeps } from "../engine/pipeline.js";
import type { Kit } from "../schema/kit.js";
import { parseArgs, readCases, writeOutput, type CaseRow } from "./args.js";

export interface OutputKitEntry {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

export interface EvaluateOutput {
  version: string;
  generated_at: string;
  kits: OutputKitEntry[];
}

function errorCode(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; message?: string };
  return { code: e.code ?? "PIPELINE_FAILED", message: e.message ?? String(err) };
}

/**
 * Run the full pipeline over every case, recording per-case ok/failed and
 * continuing after failures. Logs one line per pipeline step per case.
 */
export async function runBatch(cases: CaseRow[], deps: PipelineDeps, log: (line: string) => void): Promise<EvaluateOutput> {
  const kits: OutputKitEntry[] = [];
  for (const c of cases) {
    const printed = new Set<string>();
    const perCaseDeps: PipelineDeps = {
      ...deps,
      onProgress: (job) => {
        for (const step of job.steps) {
          const key = `${step.stage}:${step.status}`;
          if (printed.has(key)) continue;
          printed.add(key);
          const detail = step.detail ? ` — ${step.detail}` : "";
          log(`[${c.id}] ${step.stage}: ${step.label} (${step.status})${detail}`);
        }
        deps.onProgress?.(job);
      },
    };
    try {
      const { kit, usage } = await runPipeline({ id: c.id, jd: c.jd, company_url: c.company_url, days: c.days }, perCaseDeps);
      kits.push({ id: c.id, status: "ok", kit, error: null });
      log(`[${c.id}] ok — ${usage.calls} LLM call(s), ~${usage.inputTokens + usage.outputTokens} tokens, ${(usage.latencyMs / 1000).toFixed(1)}s`);
    } catch (err) {
      const code = errorCode(err);
      kits.push({ id: c.id, status: "failed", kit: null, error: code });
      log(`[${c.id}] failed: ${code.code} — ${code.message}`);
    }
  }
  return { version: "1.0", generated_at: new Date().toISOString(), kits };
}

/**
 * CLI entry. Exit codes: 0 = completed (case failures included), 2 = usage /
 * configuration / I/O error.
 */
export async function main(argv: string[], env: NodeJS.ProcessEnv, log: (line: string) => void = console.log): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    log(`error: ${(err as Error).message}`);
    log("usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
    return 2;
  }

  let provider: LlmProvider;
  try {
    provider = providerFromEnv(env);
  } catch (err) {
    log(`error: ${(err as Error).message}`);
    return 2;
  }
  const searchBackend = searchFromEnv(env);
  if (searchBackend.providerLabel.startsWith("none")) {
    log(`warning: ${searchBackend.providerLabel.replace("none (", "").replace(")", "")}`);
  }

  let cases: CaseRow[];
  try {
    cases = await readCases(args.input);
  } catch (err) {
    log(`error: ${(err as Error).message}`);
    return 2;
  }
  if (cases.length === 0) {
    log("error: input contains no cases");
    return 2;
  }

  const rpm = Number(env.PREP_RPM ?? 12) || 12;
  const limiter = new TokenBucketLimiter({ capacity: Math.max(4, Math.floor(rpm / 3)), refillPerSec: rpm / 60 });
  const fetcher = createFetcher();
  const search = searchBackend.search;

  const deps: PipelineDeps = {
    provider,
    search,
    fetchHtml: fetcher.fetchHtml,
    rateLimiter: limiter,
  };

  try {
    const output = await runBatch(cases, deps, log);
    await writeOutput(args.output, output);
    const ok = output.kits.filter((k) => k.status === "ok").length;
    log(`wrote ${output.kits.length} result(s) (${ok} ok) to ${args.output}`);
    return 0;
  } catch (err) {
    log(`error: ${(err as Error).message}`);
    return 2;
  }
}

// Allow `npm run evaluate` (tsx packages/core/src/cli/evaluate.ts) to run directly.
const isDirect = process.argv[1]?.endsWith("evaluate.ts");
if (isDirect) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 2;
    },
  );
}
