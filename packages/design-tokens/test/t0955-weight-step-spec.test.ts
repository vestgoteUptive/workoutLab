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
    const layout = section(row, "### Layout");
    expect(layout).toMatch(
      /`role="radiogroup"` labelled "Weight step": four chips \*\*1\.25\*\*, \*\*2\.5\*\*, \*\*5\*\*, \*\*Other\*\*/,
    );
    expect(layout).toMatch(/at least 44 px tall and 44 px wide/);
    expect(section(row, "### Chips")).toMatch(/roving tabindex/);
  });
  it("says selection is --wl-selected plus a check mark, and not aria-pressed", () => {
    const chips = section(row, "### Chips");
    expect(chips).toMatch(
      /\*\*Selected:\*\* `--wl-selected` fill[^\n]*check mark[^\n]*never colour alone/,
    );
    expect(chips).toMatch(/not `aria-pressed` buttons/);
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
  ])("contains %s as a quoted string", (s) => {
    expect(row).toContain(`"${s}"`);
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
    expect(section(row, "### Accessibility")).toMatch(
      /`--wl-on-selected` on `--wl-selected` is 8\.6:1/,
    );
  });
});

describe("T-0955 AC4 the UF-09.3/09.4 note and the hold_effort copy", () => {
  const reason = section(uf09, "## Reason line (UF-09.3 only, `hold_effort` only)");
  const copy =
    "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up.";
  it("has the exact reason copy, no placeholders and no other focus-mode change", () => {
    expect(reason).toMatch(
      new RegExp(`^\\| \`hold_effort\` \\| ${copy.replace(/\./g, "\\.")} \\|$`, "m"),
    );
    expect(reason).toMatch(/`hold_effort` has no placeholders/);
    expect(reason).toMatch(/no banner, modal or link, and no other change in focus mode/);
    expect(uf09).toMatch(/only change in focus mode is one new static line/);
    expect(uf09).toMatch(/steps by the exercise's step/);
  });
  it("ruling 1: one line, UF-09.3, under the hero, lift state, ink-muted, no live region, 4.8:1", () => {
    expect(reason).toMatch(/adds \*\*one\*\* line, for the `hold_effort` kind only/);
    expect(reason).toMatch(
      /\*\*Where:\*\* on UF-09\.3[^\n]*directly under the load\/reps hero[^\n]*lift state/,
    );
    expect(reason).toMatch(/\*\*Style:\*\* `--wl-ink-muted`, body-small/);
    expect(reason).toMatch(/at most 2 lines at 320 px/);
    expect(reason).toMatch(/not a live region/);
    expect(reason).toMatch(/4\.8:1/);
  });
  it("ruling 1: all nine PrefillKinds are listed, only hold_effort has a line", () => {
    const rows = reason.split("\n").filter((l) => /^\| `[a-z_]+` \|/.test(l));
    const kinds = rows.map((l) => /^\| `([a-z_]+)`/.exec(l)![1]);
    expect(kinds.sort()).toEqual(
      [
        "add_rep",
        "carry",
        "deload",
        "first_time",
        "hold",
        "hold_after_break",
        "hold_effort",
        "increase",
        "reentry",
      ].sort(),
    );
    for (const l of rows) {
      if (l.startsWith("| `hold_effort`")) continue;
      expect(l, l).toMatch(/\| No line \|$/);
    }
    expect(reason).toMatch(/the other eight show \*\*no line\*\*/);
  });
});

describe("T-0955 round 2 rulings 2-5 on the Weight step row", () => {
  const chips = section(row, "### Chips");
  const other = section(row, "### Other");
  const feedback = section(row, "### Feedback");
  const offline = row.split("\n").find((l) => l.startsWith("| Offline |")) ?? "";
  it("ruling 2: the offline store and queue are new work from T-0954, not a favorites pattern", () => {
    expect(offline).toMatch(/new work from T-0954/);
    expect(offline).toMatch(/online-only/);
    expect(offline).not.toMatch(/favorites pattern/);
  });
  it("ruling 3: WAI radio keys, arrows select, 600 ms debounce, Other opens without focus move", () => {
    expect(chips).toMatch(/WAI radio-group pattern[^\n]*move focus \*\*and select\*\*/);
    expect(chips).toMatch(/debounced 600 ms after the last selection change/);
    expect(chips).toMatch(/one status announcement for it/);
    expect(chips).toMatch(/Space or Enter on a chip commits at once/);
    expect(chips).toMatch(
      /Arrowing onto \*\*Other\*\* selects it \(`aria-checked="true"`\) and opens the field \*\*without moving focus\*\*/,
    );
    expect(chips).toMatch(/Tab then moves into the field/);
  });
  it("ruling 4: validate on Save and blur except blur to Cancel; Escape and Cancel restore; empty errors", () => {
    expect(other).toMatch(
      /Validate on \*\*Save\*\* and on blur, \*\*except when blur goes to Cancel\*\*/,
    );
    expect(other).toMatch(/An empty value on Save is an error/);
    expect(other).toMatch(
      /\*\*Cancel and Escape\*\* close the field and restore the previous selection and value/,
    );
    expect(other).toContain("Enter a step from 0.25 to 10 kg, in multiples of 0.25.");
  });
  it("ruling 5: status templates, alert clears status, default 1 kg has no checked chip", () => {
    expect(feedback).toContain('"Weight step set to {n} kg."');
    expect(feedback).toContain('"Weight step back to the default, {n} kg."');
    expect(feedback).toMatch(/When the `role="alert"` line shows, the status line is cleared/);
    expect(chips).toMatch(/\*\*no chip is checked\*\* and the first chip has `tabindex="0"`/);
    expect(chips).toMatch(
      /visible chip text is the bare number \("1\.25", "2\.5", "5"\)[^\n]*accessible name adds the unit \("1\.25 kg"/,
    );
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
      expect(flows, id).toMatch(new RegExp(`\\b${id.replace(".", "\\.")}(?!\\d)`));
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
