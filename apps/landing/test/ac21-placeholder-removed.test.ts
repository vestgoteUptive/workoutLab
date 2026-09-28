import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("node .github/scripts/check-all.mjs exits 0", () => {
    const res = spawnSync(process.execPath, [join(repoRoot, ".github/scripts/check-all.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
  }, 30_000);
});
