import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("has one :root block with every colour and both fonts", () => {
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    const flat = Object.entries(raw.color).filter(([, v]) => typeof v === "string");
    expect(flat).toHaveLength(17);
    for (const [name, hex] of flat) {
      expect(css).toContain(`--wl-color-${name}: ${hex};`);
    }
    // 17 flat + 31 D-0208 state colours (29 from T-0583, 2 from T-0587) + 5 plan coverage stops.
    expect(css.match(/--wl-color-/g)).toHaveLength(17 + 31 + 5);
    expect(css).toContain(`--wl-font-display: ${raw.font.display.family};`);
    expect(css).toContain(`--wl-font-body: ${raw.font.body.family};`);
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
