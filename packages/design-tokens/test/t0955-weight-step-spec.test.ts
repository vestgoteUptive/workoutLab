// T-0955 (D-0251, D-0259 §7–§13, D-0208): the UF-04.2 "Weight step" row and the UF-09.3/09.4 reason
// note are specified as text. Design docs are checked as text, like uf08-empty-mode-specs.test.ts.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pkgRoot, repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
const read = (f: string) => {
  const p = resolve(screens, f);
  if (!existsSync(p)) throw new Error(`missing ${f}`);
  return readFileSync(p, "utf8");
};

/** The body under an exact heading line, up to the next heading of the same or a higher level. */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no heading ${heading}`);
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) as RegExpExecArray)[0].length <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

const uf04 = read("UF-04.1-UF-04.2.md");
const row = section(uf04, "## UF-04.2 Weight step (D-0251, D-0259)");
const uf09 = read("UF-09.3-UF-09.4.md");

describe("T-0955 AC1 the Weight step row is a radiogroup of four 44 px chips", () => {
  it("names the radiogroup, label, chips, roving tabindex and 44 px", () => {
    expect(row).toContain('role="radiogroup"');
    expect(row).toContain('"Weight step"');
    for (const c of ["1.25", "2.5", "5", "Other"]) expect(row).toContain(`**${c}**`);
    expect(row).toContain("roving tabindex");
    expect(row).toContain("44 px");
  });
  it("says selection is --wl-selected plus a check mark, and not aria-pressed", () => {
    expect(row).toContain("`--wl-selected`");
    expect(row).toContain("check mark");
    expect(row).toContain("never colour alone");
    expect(row).toMatch(/not `aria-pressed`/);
  });
});

describe("T-0955 AC2 the exact copy strings", () => {
  it.each([
    "Use default ({n} kg)",
    "Weight step set to 1.25 kg.",
    "Weight step back to the default, 2.5 kg.",
    "Couldn't save. Try again.",
    "Enter a step from 0.25 to 10 kg, in multiples of 0.25.",
    "How much the weight goes up each time.",
    "Weight step: 1.25 kg (yours)",
    "Weight step: 2.5 kg (default)",
    "Step in kg",
    "Other: 1.5 kg",
  ])("contains %s", (s) => {
    expect(row).toContain(s);
  });
  it("uses the status and alert roles, inputmode, aria-invalid and no undo", () => {
    for (const s of [
      'role="status"',
      'role="alert"',
      'inputmode="decimal"',
      "aria-invalid",
      "aria-describedby",
      "Escape",
      "no undo",
    ])
      expect(row).toContain(s);
  });
});

describe("T-0955 AC3 hidden for timed and bodyweight, editable offline", () => {
  it("hides (not disables) the row and explains the queued write", () => {
    expect(row).toMatch(/hidden \(not disabled\)[^\n]*timed[^\n]*bodyweight/i);
    expect(row).toContain("editable offline");
    expect(row).toContain("queued write");
    expect(row).toContain("D-0199");
    expect(row).toContain("D-0202");
    expect(row).toContain('No "Connect to change');
  });
  it("states the contrast of the selected chip", () => {
    expect(row).toContain("8.6:1");
  });
});

describe("T-0955 AC4 the UF-09.3/09.4 note and the hold_effort copy", () => {
  it("has the exact reason copy, no placeholders and no other focus-mode change", () => {
    expect(uf09).toContain(
      "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up.",
    );
    expect(uf09).toContain("`hold_effort`");
    expect(uf09).toContain("no placeholders");
    expect(uf09).toMatch(/no banner, modal or link/);
    expect(uf09).toMatch(/only change in focus mode/);
    expect(uf09).toContain("steps by the exercise's step");
  });
});

describe("T-0955 AC5/AC6 no new token; cited screen IDs exist", () => {
  it("cites only UF IDs that exist in user flows v2", () => {
    const flows = readFileSync(resolve(repoRoot, "Design-docs/docs/product/user-flows.md"), "utf8");
    for (const id of new Set(
      [...row.matchAll(/UF-\d\d(?:\.\d+)?/g), ...uf09.matchAll(/UF-\d\d(?:\.\d+)?/g)].map(
        (m) => m[0],
      ),
    ))
      expect(flows, id).toContain(id);
  });
  const tmp = mkdtempSync(join(tmpdir(), "wl-t0955-css-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  it("introduces no hex and no --wl variable that does not already exist", () => {
    const out = join(tmp, "tokens.css");
    const res = spawnSync(
      process.execPath,
      [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
      {
        encoding: "utf8",
      },
    );
    expect(res.status, res.stderr).toBe(0);
    const css =
      readFileSync(out, "utf8") + readFileSync(resolve(repoRoot, "apps/web/src/main.css"), "utf8");
    expect(row.match(/--wl-[a-z0-9-]+/g)?.length).toBeGreaterThan(0);
    for (const text of [row, uf09]) {
      expect(text).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
      const named = new Set(text.match(/--wl-[a-z0-9-]+/g) ?? []);
      for (const v of named) expect(css, v).toMatch(new RegExp(`${v}\\s*:`));
    }
  });
});
