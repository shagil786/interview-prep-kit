import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { caseSchema } from "../schema/case.js";

export interface EvaluateArgs {
  input: string;
  output: string;
}

/** Parse `--input <path> --output <path>`. Throws a usage error otherwise. */
export function parseArgs(argv: string[]): EvaluateArgs {
  const args = [...argv];
  const read = (flag: string): string => {
    const i = args.indexOf(flag);
    if (i === -1 || i + 1 >= args.length) {
      throw new Error(`missing required argument: ${flag} <path>`);
    }
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const input = read("--input");
  const output = read("--output");
  if (args.length > 0) {
    throw new Error(`unexpected argument: ${args.join(" ")}`);
  }
  return { input, output };
}

export type CaseRow = z.infer<typeof caseSchema>;

/** Read and validate the input cases array (Appendix B input shape). */
export async function readCases(path: string): Promise<CaseRow[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read input file ${path}: ${(err as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`input file is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(data)) throw new Error("input file must contain a JSON array of cases");
  const rows: CaseRow[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const parsed = caseSchema.safeParse(data[i]);
    if (!parsed.success) {
      throw new Error(`input case at index ${i} is invalid: ${parsed.error.issues.map((x) => x.message).join("; ")}`);
    }
    rows.push(parsed.data);
  }
  return rows;
}

/** Write JSON output, creating parent directories as needed. */
export async function writeOutput(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}
