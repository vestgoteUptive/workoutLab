import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AC-A12 (NFR-PERF-1). CI execution of Lighthouse itself is T-0402/infra.
describe("lighthouserc.json budgets", () => {
  const configPath = fileURLToPath(new URL("./lighthouserc.json", import.meta.url));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const assertions = config.ci.assert.assertions;

  it("caps LCP at 2500ms", () => {
    expect(assertions["largest-contentful-paint"][1].maxNumericValue).toBe(2500);
  });

  it("caps CLS at 0.1", () => {
    expect(assertions["cumulative-layout-shift"][1].maxNumericValue).toBe(0.1);
  });

  it("caps TBT at 200ms", () => {
    expect(assertions["total-blocking-time"][1].maxNumericValue).toBe(200);
  });
});
