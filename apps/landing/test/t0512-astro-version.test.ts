import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// T-0512 (go-live review F-2): the landing must not regress below the astro
// release that clears GHSA-26w7-cxv4-gfx2 (critical, fixed in 7.2.8) and the
// high advisories GHSA-2pvr-wf23-7pc7 (6.4.6), GHSA-8hv8-536x-4wqp (6.3.3),
// GHSA-f88m-g3jw-g9cj / GHSA-rgj7-g3m4-5g8c (sharp, via astro).
const PATCHED_ASTRO = "7.2.8";

function cmp(a: string, b: string): number {
  const pa = a.split("-")[0]!.split(".").map(Number);
  const pb = b.split("-")[0]!.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

describe("T-0512 astro version", () => {
  it("installed astro is at or above the patched version", () => {
    const require = createRequire(import.meta.url);
    const { version } = require("astro/package.json") as { version: string };
    expect(cmp(version, PATCHED_ASTRO)).toBeGreaterThanOrEqual(0);
  });
});
