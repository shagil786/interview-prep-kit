import { createFetcher } from "../retrieval/fetch.js";
import { createGeminiProvider } from "../llm/gemini.js";
import { createFakeSearch, createSearch } from "../retrieval/search.js";
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
      const { kit } = await runPipeline({ id: c.id, jd: c.jd, company_url: c.company_url, days: c.days }, perCaseDeps);
      kits.push({ id: c.id, status: "ok", kit, error: null });
      log(`[${c.id}] ok`);
    } catch (err) {
      kits.push({ id: c.id, status: "failed", kit: null, error: errorCode(err) });
      log(`[${c.id}] failed: ${errorCode(err).code} — ${errorCode(err).message}`);
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

  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    log("error: GEMINI_API_KEY is not set (see .env.example)");
    return 2;
  }
  const braveKey = env.BRAVE_API_KEY?.trim();
  if (!braveKey) log("warning: BRAVE_API_KEY is not set — public-discussion search will be skipped");

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

  const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const provider = createGeminiProvider({ apiKey: geminiKey, model });
  const rpm = Number(env.PREP_RPM ?? 12) || 12;
  const limiter = new TokenBucketLimiter({ capacity: Math.max(4, Math.floor(rpm / 3)), refillPerSec: rpm / 60 });
  const fetcher = createFetcher();
  const search = braveKey
    ? createSearch(braveKey)
    : createFakeSearch(() => []); // honest: nothing will be found, recorded as unknowns

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
