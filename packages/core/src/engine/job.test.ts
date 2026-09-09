import { describe, expect, it } from "vitest";
import { Job } from "./job.js";

describe("Job", () => {
  it("records ordered steps through begin -> succeed", () => {
    const job = new Job();
    job.begin("extract", "Extracting requirements");
    job.succeed("found 4 requirements");
    job.begin("research", "Researching company");
    expect(job.steps.map((s) => s.stage)).toEqual(["extract", "research"]);
    expect(job.steps[0].status).toBe("done");
    expect(job.steps[0].detail).toBe("found 4 requirements");
    expect(job.steps[1].status).toBe("running");
  });

  it("marks the current step skipped with its reason", () => {
    const job = new Job();
    job.begin("search", "Searching public discussion");
    job.skip("skipped: local fixture host");
    expect(job.steps[0].status).toBe("skipped");
    expect(job.steps[0].detail).toBe("skipped: local fixture host");
  });

  it("marks the current step failed with the error", () => {
    const job = new Job();
    job.begin("brief", "Writing company brief");
    job.fail("provider rate limited");
    expect(job.steps[0].status).toBe("failed");
    expect(job.steps[0].detail).toBe("provider rate limited");
  });

  it("records an ISO timestamp on every step", () => {
    const job = new Job();
    job.begin("extract", "x");
    expect(Number.isNaN(Date.parse(job.steps[0].at))).toBe(false);
    expect(job.steps[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serialises to plain JSON-safe steps", () => {
    const job = new Job();
    job.begin("schedule", "Allocating schedule");
    job.succeed();
    const json = JSON.parse(JSON.stringify(job.toJSON()));
    expect(json).toEqual({
      steps: [{ stage: "schedule", label: "Allocating schedule", status: "done", at: expect.any(String) }],
    });
  });
});
