import { describe, expect, it } from "vitest";
import { appendId } from "./kit.js";
describe("kit id helpers", () => {
  it("nextId continues a sequence", () => {
    expect(appendId(["q1", "q2"], "q")).toBe("q3");
    expect(appendId([], "r")).toBe("r1");
  });
});
