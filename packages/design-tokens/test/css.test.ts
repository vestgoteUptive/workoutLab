import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { pkgRoot } from "./helpers";

const tmp = mkdtempSync(join(tmpdir(), "wl-tokens-css-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function build(out: string): string {
  const res = spawnSync(
    process.execPath,
    [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
    {
      encoding: "utf8",
    },
  );
  expect(res.status, res.stderr).toBe(0);
  return readFileSync(out, "utf8");
}

describe("AC9 CSS output (offline)", () => {
  it("the package build script writes dist/tokens.css", () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe("node scripts/build-css.mjs");
    const script = readFileSync(resolve(pkgRoot, "scripts/build-css.mjs"), "utf8");
    expect(script).toContain('"dist/tokens.css"');
  });

  const css = build(join(tmp, "a", "tokens.css"));

  it("has one :root block with the state colours and both state fonts", () => {
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    // 31 D-0208 state colours (29 from T-0583, 2 from T-0587) + 5 plan coverage stops (T-0625: no flat).
    expect(css.match(/--wl-color-/g)).toHaveLength(31 + 5);
    expect(css).toContain(`--wl-font-plan: ${raw.font.plan.family};`);
    expect(css).toContain(`--wl-font-session: ${raw.font.session.family};`);
    expect(css.match(/--wl-font-/g)).toHaveLength(2);
  });
  it("T-0625 AC2: no retired Chalk & Iron variable", () => {
    for (const v of ["--wl-color-bg:", "--wl-color-accent:", "--wl-color-warn:"])
      expect(css).not.toContain(v);
    expect(css).not.toMatch(/--wl-font-display|--wl-font-body|--wl-radius-segment/);
    expect(css).not.toMatch(/--wl-color-coverage-\d/);
  });
  it("T-0625: a flat string colour in tokens.json fails the build", () => {
    const dir = mkdtempSync(join(tmp, "flat-"));
    const bad = { ...raw, color: { bg: "#121210", ...raw.color } };
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "scripts"));
    writeFileSync(join(dir, "src/tokens.json"), JSON.stringify(bad));
    copyFileSync(resolve(pkgRoot, "scripts/build-css.mjs"), join(dir, "scripts/build-css.mjs"));
    const res = spawnSync(process.execPath, [join(dir, "scripts/build-css.mjs")], {
      encoding: "utf8",
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/flat colour color\.bg is retired/);
  });
  it("is byte-identical on a second run", () => {
    expect(build(join(tmp, "b", "tokens.css"))).toBe(css);
  });
  it("fetches nothing remote", () => {
    expect(css).not.toContain("url(");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("http");
  });
});
