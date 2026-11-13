// T-0939 (D-0236, D-0238, D-0239 §6–§13, D-0240 §4, D-0208): the UF-08.1 screen spec with
// "Start empty", the UF-08.2 "Empty mode" section and Empty-states branch, the UF-08.5 empty-mode
// lead line, and the retired fonts gone from UF-08.2/UF-08.5. Design docs are checked as text.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pkgRoot, repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
const read = (f: string) => readFileSync(resolve(screens, f), "utf8");

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

const uf081 = read("UF-08.1.md");
const uf082 = read("UF-08.2.md");
const uf085 = read("UF-08.5.md");
const empty = section(uf082, "## Empty mode");

describe("T-0939 AC1 UF-08.1.md specifies the whole screen plus Start empty", () => {
  it("is titled UF-08.1 and carries the Cobalt plan Look line", () => {
    expect(uf081.split("\n")[0]).toBe("# UF-08.1 Time & energy");
    expect(uf081).toContain(
      "Cobalt + state colour (D-0208); state `plan`; patterns in `components/state-patterns.md`",
    );
  });
  it("names every UF-08.1 control from user flows v2", () => {
    for (const s of [
      "Minutes stepper",
      "Steps of 5 within 15–120",
      "20 / 30 / 45 / 60 / 90",
      '"done by HH:MM"',
      "Warm-up toggle",
      "on by default",
      "Low / Normal / High",
      "Skip today",
      "Live fit line",
      '"Suggest my workout"',
      '"Start empty"',
    ])
      expect(uf081, s).toContain(s);
  });
  it("places Start empty under the primary as a full-width secondary button, ≥ 44 px", () => {
    const s = section(uf081, '## "Start empty" (D-0236 §1, D-0239 §16)');
    expect(s).toContain('directly **under "Suggest my workout"**');
    expect(s).toContain("`.wl-button--secondary`");
    expect(s).toContain("**Same width as the primary**");
    expect(s).toMatch(/at least 44 px tall and wide/);
    // In the layout list too, right after the primary.
    expect(uf081.indexOf('7. **"Suggest my workout"**')).toBeLessThan(
      uf081.indexOf('8. **"Start empty"**'),
    );
  });
  it("names no retired font and no raw colour", () => {
    expect(uf081).not.toMatch(/DM Sans|Big Shoulders|Chalk/);
    expect(uf081).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(uf081).toContain("No UF-09 control is added");
  });
});

describe("T-0939 AC2 UF-08.2 ## Empty mode carries the exact copy", () => {
  it.each([
    "{used} of {n} min · {left} min left",
    "{used} of {n} min · {over} min over",
    "Nothing here yet. Pick from the suggestions or add an exercise.",
    "For the areas that need work most. Fits your {left} min.",
    "Your {n} min are full.",
    "No suggestions right now. Search to add an exercise.",
    "Your workout is {over} min over {n} min. Remove or swap an exercise.",
    "Your workout is {over} min over. Remove or swap an exercise first.",
    "{name} would push out {pick}. Pick more time or remove an exercise.",
    "{name} added. {left} min left.",
    "Add at least one exercise.",
    "Other suggestions",
    "Fill the rest for me",
  ])("%s", (s) => {
    expect(empty).toContain(s);
  });
  it("has the warm-up suffix, the Suggestions markup and the row anatomy", () => {
    expect(empty).toContain('" + warm-up" suffix follows "{n} min"');
    expect(empty).toContain("`<section aria-labelledby>`");
    expect(empty).toContain('`h2` "Suggestions"');
    expect(empty).toContain("`<ul>` of `<li>` rows");
    expect(empty).toContain("No `.wl-option`");
    expect(empty).toContain("`wl-chip wl-uf08__tag`");
    expect(empty).toContain('"Main lift"');
    expect(empty).toContain('accessible name "Add {name}"');
    expect(empty).toMatch(/at least 44 px tall/);
    expect(empty).toContain('`aria-disabled="true"`, **still focusable**');
    expect(empty).toContain("`aria-describedby`");
  });
  it("keeps the failed-write alert and states the refusal-location exception", () => {
    expect(empty).toContain(
      '`role="alert"` "Couldn\'t save. Try again." for a failed exclusion write is unchanged',
    );
    expect(empty).toContain('explicit exception to "Refusals show on the sheet');
    // The three refusal copies in first-match order.
    const r = section(empty, "### Refusals (D-0239 §12–§13, D-0240 §4)");
    const order = [
      "1. **The plan is already over budget**",
      "2. **The new item itself is missing**",
      "3. **The new item fits but pushes out",
    ].map((s) => r.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("T-0939 AC3 words, not colour; budget line not live in empty mode", () => {
  const budget = section(empty, "### Budget line (D-0239 §6–§7)");
  it("says the bar does not change colour when over and keeps data-over", () => {
    expect(budget).toContain("**The bar does not change colour** when over");
    expect(budget).toContain("`data-over`");
    expect(budget).toContain("no new token");
  });
  it("is not aria-live in empty mode and unchanged in suggested mode", () => {
    expect(budget).toContain("**Not `aria-live` in empty mode:**");
    expect(budget).toContain("**Suggested mode is unchanged**: there the budget line keeps");
    expect(budget).toContain('`aria-live="polite"`');
  });
});

describe("T-0939 AC4 layout order (D-0239 §8) and the six focus rules (D-0239 §10)", () => {
  it("lists the layout in order", () => {
    const layout = section(empty, "### Layout (top to bottom, D-0239 §8)");
    const steps = [
      "1. **The time-budget bar**",
      "2. **The why chips**",
      "3. **Your workout:**",
      '4. **Suggestions:** its rows, then "Other suggestions", then "Fill the rest for me".',
      '5. **"Add exercise"**',
      '6. **"Looks good"**',
    ].map((s) => layout.indexOf(s));
    expect(steps.every((i) => i >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
  it("lists exactly the six focus cases, verbatim", () => {
    const focus = section(empty, "### Focus (D-0239 §10)")
      .split("\n")
      .filter((l) => l.startsWith("- "));
    expect(focus).toEqual([
      "- **After a suggestion Add:** focus moves to the Add button of the row now in the tapped row's place. If the tapped row was last, it moves to the new last row's Add. If no rows are left, it moves to \"Add exercise\".",
      '- **After "Other suggestions":** focus stays on it. If it disappears, focus moves to "Add exercise".',
      '- **After "Fill the rest for me":** focus moves to "Add exercise".',
      "- **After a refusal:** focus stays on the tapped button.",
      "- **UF-08.5 Add:** keeps D-0205 §4 (focus to the new row).",
      "- Focus never drops to `body`.",
    ]);
    // The source decision says the same.
    const d = readFileSync(
      resolve(repoRoot, ".squad/decisions/D-0239-empty-start-review-rulings.md"),
      "utf8",
    );
    for (const l of focus) expect(d).toContain(l.replace(/^- /, "    - "));
  });
});

describe("T-0939 AC5 ## Empty states has both branches", () => {
  const states = section(uf082, "## Empty states");
  it("keeps the suggested-mode lines and adds the empty-mode one", () => {
    expect(states).toContain("**Suggested mode**");
    expect(states).toContain('"Nothing fits in {n} min"');
    expect(states).toContain('"No exercises left. Pick a time to rebuild."');
    expect(states).toContain("**Empty mode**");
    expect(states).toContain('"Nothing here yet. Pick from the suggestions or add an exercise."');
  });
});

describe("T-0939 AC6 UF-08.5 empty-mode lead line", () => {
  it("has both lead lines, the new one scoped to empty mode", () => {
    const lead = uf085.split("\n").find((l) => l.startsWith("2. Lead line")) as string;
    expect(lead).toContain('"The rest of your workout adjusts to fit {n} min."');
    expect(lead).toMatch(/In empty mode .*it reads "\{left\} of \{n\} min left\." instead/);
  });
});

describe("T-0939 AC7 retired fonts gone from UF-08.2 and UF-08.5", () => {
  it.each(["UF-08.2.md", "UF-08.5.md"])("%s", (f) => {
    const t = read(f);
    expect(t).not.toContain("DM Sans");
    expect(t).not.toContain("Big Shoulders");
    expect(t).toContain("Familjen Grotesk");
    expect(t).toContain("`--wl-font`");
  });
});

describe("T-0939 AC8 no new token: every --wl- variable the specs name already exists", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wl-t0939-css-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const out = join(tmp, "tokens.css");
  const res = spawnSync(
    process.execPath,
    [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
    {
      encoding: "utf8",
    },
  );
  it.each(["UF-08.1.md", "UF-08.2.md", "UF-08.5.md"])("%s", (f) => {
    expect(res.status, res.stderr).toBe(0);
    // Raw keys come from the tokens build; the generic state variables (--wl-ink, --wl-font, …)
    // are mapped from them in apps/web/src/main.css (D-0208). Neither may need a new token.
    const css =
      readFileSync(out, "utf8") + readFileSync(resolve(repoRoot, "apps/web/src/main.css"), "utf8");
    const named = new Set(read(f).match(/--wl-[a-z0-9-]+/g) ?? []);
    expect(named.size).toBeGreaterThan(0);
    for (const v of named) expect(css, `${f} names ${v}`).toMatch(new RegExp(`${v}\\s*:`));
  });
});

// Review fixes (T-0939 round 2): announcements, the Removed line's own status, `used` with the
// warm-up outside the budget, and where Reorder and the "Your workout" heading sit.
describe("T-0939 review: live messages, budget forms, list header", () => {
  const live = section(empty, "### Live region (D-0239 §9)");
  it("a Main lift suggestion Add announces 'added', 'main lift now' is Start with this only", () => {
    expect(live).toMatch(
      /"\{name\} added\. \{left\} min left\.": every successful Add, a suggestion row \(a "Main lift" suggestion included, B3\)/,
    );
    expect(live).toContain('"{name} is the main lift now.": only "Start with this"');
    expect(live).not.toMatch(/main lift now\."[^\n]*"Main lift" suggestion/);
    expect(live).toMatch(/UF-08\.3 swap \(of the main lift or a pick\) announces nothing here/);
  });
  it("the Removed line keeps its own persistent status", () => {
    expect(live).toContain('**Removed line keeps its own persistent `role="status"`** (D-0199 §10');
  });
  it("used is itemsTotalS with the warm-up outside, and the over form has the suffix", () => {
    const budget = section(empty, "### Budget line (D-0239 §6–§7)");
    expect(budget).toContain("`itemsTotalS` when the warm-up is outside it");
    expect(budget).toContain('"{used} of {n} min + warm-up · {left} min left"');
    expect(budget).toContain('"{used} of {n} min + warm-up · {over} min over"');
  });
  it("Reorder stays in the list header under a visible h2 'Your workout'", () => {
    const layout = section(empty, "### Layout (top to bottom, D-0239 §8)");
    expect(layout).toContain('**visible `h2` "Your workout"**');
    expect(layout).toContain("with the **Reorder** button at its right");
    expect(layout).toContain("it is not moved");
    expect(layout).toContain("Reorder is not here: it stays in the Your workout list header");
  });
  it("cites D-0242 for the ratified defaults and states Fill the rest per state", () => {
    expect(empty).toContain("### Spec defaults (D-0242, decided)");
    const states = section(empty, "### States (empty mode)");
    expect(states).toContain(
      '"Other suggestions" and "Fill the rest for me" hidden (nothing to fill)',
    );
    expect(states).toMatch(
      /"Fill the rest for me" refused with "Your workout is \{over\} min over\. Remove or swap an exercise first\." \(D-0239 §13, D-0242 §1\)/,
    );
    expect(uf081).toContain("pending ratification");
  });
});
