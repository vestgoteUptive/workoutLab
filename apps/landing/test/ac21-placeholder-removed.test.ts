import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// AC21: the T-0309 placeholder is gone (D-0023, D-0046 §2).
const landingRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(landingRoot, "..", "..");
const thisFile = fileURLToPath(import.meta.url);
// Built by concatenation, not a literal, so this check doesn't trip on its own source.
const MARKER = ["@placeholder", "T-0309"].join(" ");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".astro") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

describe("AC21 placeholder replaced", () => {
  it("apps/landing/test/placeholder.test.ts no longer exists", () => {
    expect(existsSync(join(landingRoot, "test", "placeholder.test.ts"))).toBe(false);
  });

  it("no file under apps/landing contains the placeholder marker", () => {
    const hits: string[] = [];
    for (const file of walk(landingRoot)) {
      if (file === thisFile) continue;
      if (readFileSync(file, "utf8").includes(MARKER)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  // T-0986: the placeholder rule of check-all, run in-process on apps/landing only. The old child
  // process ran every repo check (about a second alone, several under gate load) and failed for
  // reasons outside this app; the repo-wide run is the gate's own `check-all` step.
  it("the placeholder check (check-all rule 4) reports nothing under apps/landing", async () => {
    const mod = (await import(
      pathToFileURL(join(repoRoot, ".github/scripts/check-placeholder-tests.mjs")).href
    )) as {
      runCheck: (root: string, o: { branch: string }) => Promise<{ path: string }[]>;
    };
    const findings = await mod.runCheck(repoRoot, { branch: "main" });
    expect(findings.filter((f) => f.path.startsWith("apps/landing/"))).toEqual([]);
  });
});
