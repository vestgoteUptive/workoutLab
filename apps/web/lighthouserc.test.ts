import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// AC-A12 (NFR-PERF-1). CI execution of Lighthouse itself is T-0402/infra.
describe("lighthouserc.json budgets", () => {
  // `resolve` against the vitest project root (`apps/web`), not `import.meta.url`: vitest's
  // module runner doesn't always give this a `file:` URL (e.g. under some watch/transform
  // paths), which throws in `fileURLToPath`.
  const configPath = resolve(process.cwd(), "lighthouserc.json");
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
