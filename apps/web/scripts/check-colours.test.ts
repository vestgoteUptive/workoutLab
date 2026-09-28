// AC-A4: `apps/web`'s own `public/` stays clean under `wl-check-colours` (the generic
// scanner behaviour is covered by @workoutlab/design-tokens; this exercises it against this
// package's actual `public/` directory, plus a fixture that must fail).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(webRoot, "../../packages/design-tokens/bin/wl-check-colours.js");

function runCli(dir: string) {
  return spawnSync(process.execPath, [cliPath, dir], { encoding: "utf8" });
}

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("wl-check-colours over apps/web/public (AC-A4)", () => {
  it("is clean on a copy of the real public/ directory", () => {
    dir = mkdtempSync(join(tmpdir(), "wl-web-public-clean-"));
    const publicDir = resolve(webRoot, "public");
    if (existsSync(publicDir)) cpSync(publicDir, dir, { recursive: true });
    const res = runCli(dir);
    expect(res.status).toBe(0);
  });

  it("exits 1 once a raw colour is added to the copy", () => {
    dir = mkdtempSync(join(tmpdir(), "wl-web-public-dirty-"));
    const publicDir = resolve(webRoot, "public");
    if (existsSync(publicDir)) cpSync(publicDir, dir, { recursive: true });
    // Built from two literals, not one `#121210` literal, so this source file itself stays
    // clean under `workoutlab/no-raw-colour` (that rule checks AST `Literal`/`TemplateElement`
    // nodes, not the file it's writing).
    const rawHex = "#" + "121210";
    writeFileSync(join(dir, "x.webmanifest"), `{\n  "theme_color": "${rawHex}"\n}\n`);
    const res = runCli(dir);
    expect(res.status).toBe(1);
  });
});
