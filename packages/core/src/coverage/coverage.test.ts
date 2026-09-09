import { describe, expect, it } from "vitest";
import { findUncovered } from "./coverage.js";

const reqs = [{ id: "r1", priority: "must" }, { id: "r2", priority: "nice" }, { id: "r3", priority: "must" }];

describe("findUncovered", () => {
  it("returns all ids when nothing is covered", () =>
    expect(findUncovered(reqs, [])).toEqual(["r1", "r2", "r3"]));
  it("returns uncovered subset", () =>
    expect(findUncovered(reqs, [{ requirement_ids: ["r1"] }])).toEqual(["r2", "r3"]));
  it("ignores question references to unknown ids", () =>
    expect(findUncovered(reqs, [{ requirement_ids: ["r1", "ghost"] }])).toEqual(["r2", "r3"]));
});
