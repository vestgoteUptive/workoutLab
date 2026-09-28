import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defaultDistDir } from "./dist";

const landingRoot = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

describe("AC12 tokens consumed", () => {
  const dist = defaultDistDir();
  const css = [...walk(dist)]
    .filter((f) => extname(f) === ".css")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  it("carries the token custom properties for bg colour and both fonts", () => {
    expect(css).toMatch(/--wl-color-bg\s*:/);
    expect(css).toMatch(/--wl-font-display\s*:/);
    expect(css).toMatch(/--wl-font-body\s*:/);
  });

  it("styles body from bg/text/body-font tokens", () => {
    expect(css).toMatch(
      /\bbody\s*\{[^}]*background:\s*var\(--wl-color-bg\)\s*;\s*color:\s*var\(--wl-color-text\)\s*;\s*font-family:\s*var\(--wl-font-body\)/,
    );
  });

  it("styles h1 from the display font token", () => {
    expect(css).toMatch(/\bh1[^{]*\{[^}]*font-family:\s*var\(--wl-font-display\)/);
  });

  it("lint (ESLint + wl-check-colours) exits 0", () => {
    const eslintPkgJson = require.resolve("eslint/package.json");
    const eslintBin = join(eslintPkgJson, "..", "bin", "eslint.js");
    const eslintRes = spawnSync(process.execPath, [eslintBin, "."], {
      cwd: landingRoot,
      encoding: "utf8",
    });
    expect(eslintRes.status, `${eslintRes.stdout}\n${eslintRes.stderr}`).toBe(0);

    // "./package.json" isn't in the package's exports map, so resolve its
    // main entry ("./src/index.ts") and walk up two directories to the
    // package root instead.
    const tokensEntry = require.resolve("@workoutlab/design-tokens", { paths: [landingRoot] });
    const checkColoursBin = join(tokensEntry, "..", "..", "bin", "wl-check-colours.js");
    const coloursRes = spawnSync(process.execPath, [checkColoursBin, "."], {
      cwd: landingRoot,
      encoding: "utf8",
    });
    expect(coloursRes.status, `${coloursRes.stdout}\n${coloursRes.stderr}`).toBe(0);
  }, 30_000);
});
