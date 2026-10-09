// @vitest-environment node
// T-0593 AC7 (excluded-areas notice): the CSS reads the generic variables, has no raw colour and no px font size.
// The cascade is proven in tests/e2e/cobalt-surfaces.spec.ts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "excluded-areas-notice.css";
const css = readFileSync(resolve(__dirname, "..", FILE), "utf8");
const CHECK_COLOURS = resolve(
  process.cwd(),
  "../../packages/design-tokens/bin/wl-check-colours.js",
);
const check = (text: string) => {
  const dir = mkdtempSync(join(tmpdir(), "wl-css-"));
  writeFileSync(join(dir, FILE), text);
  return spawnSync("node", [CHECK_COLOURS, dir], { encoding: "utf8" });
};

describe("T-0593 AC7 excluded-areas notice CSS", () => {
  it("has no px font size", () => {
    for (const m of css.matchAll(/font-size:\s*([^;}]+)/g)) expect(m[1]).not.toMatch(/px/);
  });

  it("passes the check-colours guard, and a planted white fails it", () => {
    const ok = check(css);
    expect(ok.stdout + ok.stderr).toBe("");
    expect(ok.status).toBe(0);
    const bad = check(`${css}\n.x { color: ${["#", "FFFFFF"].join("")}; }\n`);
    expect(bad.status).not.toBe(0);
  });

  it("under a state it reads raise, ink and the tile radius", () => {
    const scoped = css.slice(css.indexOf("Cobalt (T-0593"));
    expect(scoped).toMatch(/background: var\(--wl-raise\)/);
    expect(scoped).toMatch(/color: var\(--wl-ink\)/);
    expect(scoped).toMatch(/border-radius: var\(--wl-radius-tile\)/);
    expect(scoped).not.toMatch(/--wl-color-|warn/);
    expect(css.slice(0, css.indexOf("Cobalt (T-0593"))).toMatch(/--wl-color-surface-2/);
  });
});
