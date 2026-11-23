// T-0978a AC7 (D-0268 §4): the data-model note for exercises.unilateral.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./support/spec.js";

describe("T-0978a AC7 data-model note", () => {
  const row = readFileSync(`${REPO_ROOT}docs/data-model.md`, "utf8")
    .split("\n")
    .find((l) => l.startsWith("| unilateral |"));

  it("T-0978a AC7 finds the row (not vacuous)", () => {
    expect(row).toBeDefined();
  });
  it("T-0978a AC7 names D-0268 and drops the old claim", () => {
    expect(row).toContain("D-0268");
    expect(row).not.toContain("the engine never reads it");
  });
});
