// @vitest-environment node
// T-0593 AC7 (checkbox): the CSS reads the generic variables, has no raw colour and no px font size.
// The cascade is proven in tests/e2e/cobalt-surfaces.spec.ts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "checkbox.css";
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

describe("T-0593 AC7 checkbox CSS", () => {
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

  it("under a state the box is 22 px with a 1.5 px muted border, selected fill and on-selected tick", () => {
    const marker = css.indexOf("Cobalt (T-0593");
    const scoped = css.slice(css.indexOf("*/", marker) + 2);
    expect(scoped).toMatch(
      /:is\(\[data-wl-state\], \.wl-paper\) \.wl-checkbox__input \{[^}]*inline-size: 22px/,
    );
    expect(scoped).toMatch(/border: 1\.5px solid var\(--wl-ink-muted\)/);
    expect(scoped).toMatch(/background: var\(--wl-selected\)/);
    expect(scoped).toMatch(/border-color: var\(--wl-on-selected\)/);
    expect(scoped).toMatch(/outline: 2px solid var\(--wl-focus\)/);
    expect(scoped).not.toMatch(/--wl-color-/);
    // The legacy look (before the scoped block) keeps the text-muted border and the accent fill.
    const legacy = css.slice(0, css.indexOf("Cobalt (T-0593"));
    expect(legacy).toMatch(/border: 2px solid var\(--wl-color-text-muted\)/);
    expect(legacy).toMatch(/background: var\(--wl-color-accent\)/);
    // Every new rule starts at a state root or paper.
    for (const m of scoped.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      expect(m[1]!.trim()).toMatch(/^:is\(\[data-wl-state\], \.wl-paper\)/);
    }
  });
});
