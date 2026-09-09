import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, readCases, writeOutput } from "./args.js";

describe("parseArgs", () => {
  it("parses --input and --output", () => {
    expect(parseArgs(["--input", "a.json", "--output", "b.json"])).toEqual({ input: "a.json", output: "b.json" });
  });

  it("throws when a flag is missing its value", () => {
    expect(() => parseArgs(["--input"])).toThrow(/--input/);
  });

  it("throws on unknown flags", () => {
    expect(() => parseArgs(["--input", "a", "--output", "b", "--extra"])).toThrow(/unexpected argument/);
  });
});

describe("readCases / writeOutput", () => {
  it("round-trips valid cases and rejects invalid rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prep-args-"));
    try {
      const good = join(dir, "good.json");
      await writeOutput(good, [{ id: "c1", jd: "text", company_url: "http://x", days: 3 }]);
      const rows = await readCases(good);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("c1");

      const bad = join(dir, "bad.json");
      await writeOutput(bad, [{ id: "c1", jd: "", company_url: "nope", days: 99 }]);
      await expect(readCases(bad)).rejects.toThrow(/index 0 is invalid/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-array JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prep-args-"));
    try {
      const f = join(dir, "obj.json");
      await writeFile(f, '{"a":1}', "utf8");
      await expect(readCases(f)).rejects.toThrow(/JSON array/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
