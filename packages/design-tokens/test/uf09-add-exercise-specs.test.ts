// T-0944 (D-0243, D-0246 §2–§7 §16 §18, D-0205 §2, D-0208, D-0211, D-0231): the new UF-09.10 Add
// exercise sheet spec, the UF-09.9 "Add exercise" action and status line, and the UF-08.5 fixes.
// Design docs are checked as text, as T-0939 does for UF-08.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pkgRoot, repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
// A missing file reads as "" so each assertion fails on its own (the red run before the docs).
const read = (f: string) => {
  const p = resolve(screens, f);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
};

/** The body under an exact heading line, up to the next heading of the same or a higher level. */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) return "";
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) as RegExpExecArray)[0].length <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** Every index found and strictly increasing. */
function inOrder(text: string, parts: string[]): boolean {
  const at = parts.map((p) => text.indexOf(p));
  return at.every((i, k) => i >= 0 && (k === 0 || i > (at[k - 1] as number)));
}

const add = read("UF-09.10.md");
const paused = read("UF-09.9.md");
const uf085 = read("UF-08.5.md");
const RETIRED = /DM Sans|Big Shoulders|Chalk/;

describe("T-0944 AC1 UF-09.10 is a D-0211 plan sheet on the .wl-uf08 plan root", () => {
  it("is titled UF-09.10 and carries the Cobalt plan Look line and the plan sheet", () => {
    expect(add.split("\n")[0]).toBe("# UF-09.10 Add exercise");
    expect(add).toContain(
      "Cobalt + state colour (D-0208); state `plan`; patterns in `components/state-patterns.md`",
    );
    expect(add).toContain("The D-0211 plan sheet");
    expect(add).toContain('opened only from the "Add exercise" action on UF-09.9 Paused');
  });
  it('roots on .wl-uf08[data-wl-state="plan"] (D-0246 §16)', () => {
    expect(add).toContain('`class="wl-uf08"` and `data-wl-state="plan"`');
    expect(add).toContain('`.wl-uf08[data-wl-state="plan"]`');
    expect(add).toContain("imports the UF-08 stylesheet itself");
  });
  it("uses D-0203 classes, hairline rows, Familjen Grotesk via --wl-font, no cards, no hex", () => {
    expect(add).toContain("**Foundation classes (D-0203):** `.wl-row` (hairline rows");
    expect(add).toContain("Familjen Grotesk through `--wl-font`");
    expect(add).not.toContain(".wl-card");
    expect(add).not.toMatch(RETIRED);
    expect(add).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(add).toContain("No new token, no hex (D-0246 §18)");
  });
  it("puts every target at 44 px or more", () => {
    const a11y = section(add, "## Accessibility");
    expect(a11y).toContain("Every target at least 44 × 44 px (WCAG 2.5.8)");
    expect(a11y).toContain("each Add (44 px tall, 96 px wide)");
    expect(a11y).toContain("no SessionSetup in the tree");
    expect(add).toContain("**Close** (44 × 44 px target");
    // No size under 44 px is given to a control.
    for (const m of add.matchAll(/(\d+) px (?:target|tall)/g))
      expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(44);
  });
});

describe("T-0944 AC2 lead line", () => {
  const lead = section(add, "## Lead line (D-0243 §2, D-0244 §2)");
  it("is {m} min left with m = floor(timeLeftS / 60), No time left under 60 s", () => {
    expect(lead).toContain('"{m} min left", where `m = floor(timeLeftS / 60)`');
    expect(lead).toContain(
      'When `timeLeftS < 60` (zero or negative included) it reads "No time left"',
    );
    expect(add).toContain('2. Lead line, `--wl-ink-muted`: "{m} min left", or "No time left"');
  });
  it.each([
    ["945 s", "15 min left"],
    ["165 s", "2 min left"],
    ["45 s", "No time left"],
  ])("%s → %s", (s, text) => {
    expect(lead).toContain(`| ${s} | "${text}" |`);
  });
});

describe("T-0944 AC3 empty query and search", () => {
  const empty = section(add, "## Empty query (D-0205 §2, D-0202)");
  it("orders Favorites (omitted with none) before Today's areas in the fixed area order", () => {
    expect(inOrder(empty, ["1. **Favorites**", "2. **Today's areas**"])).toBe(true);
    expect(empty).toContain("**Omitted when the user has no favorites**");
    expect(empty).toContain(
      "**in the fixed area order** (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves)",
    );
    expect(empty).toContain("**Skipped and done items count**");
  });
  it("has no Suggested section and no Start with this", () => {
    expect(empty).toContain('There is **no "Suggested" section** in v1');
    expect(add).toContain('There is **no "Start with this"**');
    // Neither is ever specified as a thing the sheet has.
    expect(add).not.toMatch(/^#+ .*Suggested/m);
    expect(add).not.toContain("Start with {name}");
  });
  it("searches as UF-08.5 with the exact no-match line", () => {
    const q = section(add, "## Query (D-0205 §2)");
    expect(q).toContain(
      "The UF-08.5 field and rule: a case-insensitive substring match on the name",
    );
    expect(q).toContain("sorted by name then id");
    expect(q).toContain('"No exercises match “{query}”."');
  });
});

describe("T-0944 AC4 row states, first match wins", () => {
  const states = section(add, "## Row states (D-0243 §3, D-0246 §2)");
  const rows = states
    .split("\n")
    .filter((l) => /^\| \d \|/.test(l))
    .map((l) => l.split("|")[2]?.trim());
  it("are exactly the six reasons in order", () => {
    expect(states).toContain("**First match wins.**");
    expect(rows).toEqual([
      '"Skipped in this workout"',
      '"In this workout"',
      '"Excluded"',
      '"Not available with your equipment"',
      '"Above your level"',
      '"{Area} is recovering"',
    ]);
  });
  it("widens In this workout to a logged set no longer an item, and measures recovery at start", () => {
    expect(states).toContain(
      "**or** an exercise with a set logged in this workout that is no longer a plan item",
    );
    expect(states).toContain("No Plan pointer, no link, nothing points out of focus mode (D-0231)");
    expect(states).toContain("**at the session's start**");
    expect(states).toContain("`now = started_at`");
  });
  it("has no Skipping {Area} today row and is aria-disabled with aria-describedby", () => {
    expect(rows).not.toContain('"Skipping {Area} today"');
    expect(states).toContain('There is no "Skipping {Area} today" row');
    expect(states).toContain('`aria-disabled="true"` and `aria-describedby` pointing at the row');
  });
});

describe("T-0944 AC5 one Add per addable row, named per area when repeated", () => {
  it("names Add {name} or Add {name}, {area}", () => {
    const row = section(add, "## Result row");
    expect(row).toContain('one button, **"Add"**');
    expect(row).toContain(
      'Its accessible name is **"Add {name}"**, or **"Add {name}, {area}"** when the exercise shows under more than one "Today\'s areas" section (D-0246 §3)',
    );
  });
});

describe("T-0944 AC6 refusal and failure copy", () => {
  const r = section(add, "## Add and refusals (D-0243 §5 §6, D-0246 §4)");
  it.each([
    '| `time`, m ≥ 1 | "{name} doesn\'t fit in the {m} min left." |',
    '| `time`, m = 0 | "{name} doesn\'t fit. No time left." |',
    '| `items_cap` (8 items, done and skipped included) | "This workout has 8 exercises, the most it can hold." |',
  ])("%s", (line) => {
    expect(r).toContain(line);
  });
  it("puts refusals in the sheet's role=status line and a failed write in role=alert", () => {
    expect(r).toContain('The sheet\'s `role="status"` line says exactly one of:');
    expect(r).toContain(
      '**Write failed:** "Couldn\'t add {name}. Try again." in a `role="alert"` line',
    );
  });
});

describe("T-0944 AC7 close paths and the UF-08.5 difference table", () => {
  it("Close, Escape and Back close only the sheet, focus to Add exercise, still paused", () => {
    const c = section(add, "## Close, Escape and Back (D-0246 §6)");
    expect(c).toContain("close **only the sheet**");
    expect(c).toContain('Focus returns to "Add exercise" on UF-09.9.');
    expect(c).toContain("The workout **stays paused**");
  });
  it("lists the six D-0246 §18 differences", () => {
    const d = section(add, "## How this sheet differs from UF-08.5 (D-0246 §18)");
    const items = d
      .split("\n")
      .filter((l) => /^\| \d\. /.test(l))
      .map((l) => (/^\| (\d\. [^|]+?) \|/.exec(l) as RegExpExecArray)[1]);
    expect(items).toEqual([
      "1. Plan-item rows",
      "2. Excluded / level rows",
      "3. Skip today",
      "4. Recovery",
      "5. Start with this",
      "6. Lead line",
    ]);
    expect(d).toContain('"Skipped in this workout" for a skipped item');
    expect(d).toContain("Measured at `started_at`");
    expect(d).toContain('"{m} min left", or "No time left"');
  });
});

describe("T-0944 AC8 UF-09.9 action order and the Add exercise row", () => {
  const actions = section(paused, "## Actions (combined table)");
  it("states the order and the combined table follows it", () => {
    expect(actions).toContain(
      "**Resume · Swap · Do {name} later · Add exercise · Skip to next exercise · How-to · List view · End**",
    );
    const names = actions
      .split("\n")
      .filter((l) => /^\| \d \|/.test(l))
      .map((l) => l.split("|")[2]?.trim());
    expect(names).toEqual([
      'Resume ("Resume")',
      'Swap ("Swap")',
      'Do {name} later ("Do {name} later")',
      '**Add exercise** ("Add exercise")',
      'Skip to next exercise ("Skip to next exercise")',
      'How-to ("How to")',
      'List view ("List view")',
      'End ("End workout")',
    ]);
  });
  it("is a 56 px row with an aria-hidden +, in every phase but timeCheck, at 8 items and 0 time", () => {
    const row = actions.split("\n").find((l) => l.startsWith("| 4 |")) as string;
    expect(row).toContain('Row, 56 px, "+" glyph `aria-hidden`');
    expect(row).toContain(
      "Every paused phase (`getReady`, `warmup`, `set`, `confirm`, `rest`, `timed`, `next`)",
    );
    expect(row).toContain('**hidden for `resumePhase: "timeCheck"`**');
    expect(row).toContain("still shown at 8 items and with no time left");
    const a = section(paused, '## "Add exercise" (D-0243 §1, D-0246 §6 §7)');
    expect(a).toContain("**Still shown at 8 items and with no time left.**");
    expect(a).toContain('`resumePhase: "timeCheck"`');
  });
});

describe("T-0944 AC9 UF-09.9 item 7: the one status line", () => {
  const item7 = paused.split("\n").find((l) => l.startsWith("7. ")) ?? "";
  it("is one role=status, empty on mount, with the success line and focus on Add exercise", () => {
    expect(item7).toContain(
      '**Status line:** one `role="status"` line, **present and empty on mount**',
    );
    expect(item7).toContain('**"{name} added after {current name}."**');
    expect(item7).toContain('focus is on "Add exercise"');
    expect(item7).toContain(
      "Paused **does not remount** when the sheet opens, when it closes, or when the plan changes after an add (D-0246 §7)",
    );
  });
  it("has no {name} added. variant", () => {
    expect(item7).toContain('there is no "{name} added." variant');
    // Never offered as a success line anywhere in the two new specs.
    for (const t of [paused, add]) expect(t).not.toMatch(/reads "\{name\} added\."/);
    expect(paused.match(/role="status"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(section(paused, "## Accessibility")).toContain(
      'One `role="status"` line on this screen, present and empty on mount',
    );
  });
});

describe("T-0944 AC10 UF-08.5 line 3 and Cobalt fixes", () => {
  it("line 3 points to UF-09.10 (D-0243), not 'never reachable from UF-09'", () => {
    const line3 = uf085.split("\n")[2] as string;
    expect(line3).toMatch(/^- \*\*Screen:\*\* UF-08\.5 Add exercise/);
    expect(line3).toContain("**UF-09.10 Add exercise**");
    expect(line3).toContain("D-0243");
    expect(line3).not.toMatch(/UF-09 or UF-11/);
    expect(uf085).not.toMatch(/never reachable from[^.]*UF-09/i);
  });
  it("names no retired font and no .wl-card; rows are hairline rows on --wl-font", () => {
    expect(uf085).not.toMatch(RETIRED);
    expect(uf085).not.toContain(".wl-card");
    expect(uf085).toContain("`.wl-row` (hairline rows");
    expect(uf085).toContain("A flat list of hairline rows");
    expect(uf085).toContain("Familjen Grotesk through `--wl-font`");
  });
});

// AC11's tokens.json half is `git diff --stat` in the ticket log (the lane check enforces paths).
describe("T-0944 AC11 no new token", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wl-t0944-css-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const out = join(tmp, "tokens.css");
  const res = spawnSync(
    process.execPath,
    [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
    { encoding: "utf8" },
  );
  it.each(["UF-09.10.md", "UF-09.9.md", "UF-08.5.md"])(
    "every --wl- variable %s names already exists",
    (f) => {
      expect(res.status, res.stderr).toBe(0);
      // Raw keys come from the tokens build; the generic state variables are mapped in main.css.
      const css =
        readFileSync(out, "utf8") +
        readFileSync(resolve(repoRoot, "apps/web/src/main.css"), "utf8");
      const named = new Set(read(f).match(/--wl-[a-z0-9-]+/g) ?? []);
      expect(named.size).toBeGreaterThan(0);
      for (const v of named) expect(css, `${f} names ${v}`).toMatch(new RegExp(`${v}\\s*:`));
    },
  );
});
