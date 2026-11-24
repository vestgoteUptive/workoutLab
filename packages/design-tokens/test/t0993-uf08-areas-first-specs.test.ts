// T-0993 (D-0274, D-0275, D-0276, D-0280, D-0286): the areas-first UF-08 screen specs, checked as text.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "./helpers";
import { repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
const read = (f: string) => readFileSync(resolve(screens, f), "utf8");
const tokens = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string> } };
const plan = tokens.color.plan as Record<string, string>;

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

const uf082 = read("UF-08.2.md");
const uf086 = read("UF-08.6.md");
const uf081 = read("UF-08.1.md");
const uf083 = read("UF-08.3-UF-05.1.md");
const uf085 = read("UF-08.5.md");
const head = uf082.slice(0, uf082.indexOf("# Earlier UF-08.2 content"));
const states = section(uf082, "## Screen states (UF-08.2)");

describe("T-0993 AC1 UF-08.2 area row, stepper, Add an area, Fill the rest", () => {
  it("is titled Today's plan and the rewrite comes first", () => {
    expect(uf082.split("\n")[0]).toBe("# UF-08.2 Today's plan (by area)");
  });
  it("specifies the row parts", () => {
    const row = section(uf082, "## Area row");
    for (const s of [
      "the area name",
      "~14 min",
      "`−  6 sets  +`",
      "Last 14 days: 8 of 20 sets",
      "{n} exercises",
      "chevron",
      "One set less for {Area}",
      "One set more for {Area}",
      "Remove {Area}",
    ])
      expect(row, s).toContain(s);
  });
  it("specifies the stepper rules", () => {
    const r = section(uf082, "## The stepper rules (D-0275 §3)");
    expect(r).toContain("2 to 7 sets: 7 for the area with the main lift, 6 for any other");
    expect(r).toContain("**−** is **Remove**");
    expect(r).toContain("**Remove**");
    expect(r).toContain("No time for another set. Pick more time or remove a set elsewhere.");
    expect(r).toContain("{Area} already has the most sets it can hold.");
    expect(r).toContain('`aria-disabled="true"`');
  });
  it("lists Add an area with its four reasons, Fill the rest and a disabled Start at 0 areas", () => {
    const a = section(uf082, "## Add an area");
    for (const s of ["Recovering", "Skipping today", "No exercise available", "No time left"])
      expect(a, s).toContain(`"${s}"`);
    expect(a).toContain("Last 14 days: 0 of 20 sets");
    expect(a).toContain("`details`");
    expect(section(uf082, '## "Fill the rest for me"')).toContain(
      "shown only while at least one area",
    );
    expect(section(uf082, '## "Start workout" (D-0280 §1, §2)')).toContain(
      '**"Add at least one area."**',
    );
  });
});

describe("T-0993 AC2 UF-08.2 state table", () => {
  it.each([
    "Normal (online, with areas)",
    "Zero history",
    "Returning after 10 days off",
    "Time running out",
    "Everything skipped or recovering",
    "Offline (sibling of Normal)",
    "Start empty (sibling of Normal: no areas)",
    "Over budget",
    "All areas at their maximum",
    "Loading",
  ])("has a row for %s", (name) => {
    expect(
      states
        .split("\n")
        .some((l) => l.startsWith(`| ${name}`) && / |\|/.test(l.charAt(2 + name.length))),
    ).toBe(true);
  });
});

describe("T-0993 AC3 UF-08.6 Area detail", () => {
  it("is titled and gives the route and the cold-load rule", () => {
    expect(uf086.split("\n")[0]).toBe("# UF-08.6 Area detail");
    expect(uf086).toContain("`/session/setup?step=area&area={area}`");
    expect(uf086).toContain("**lands on UF-08.1**");
    expect(uf086).toContain("D-0107 §1");
  });
  it("gives each row action a unique accessible name", () => {
    for (const s of [
      '"Swap {name}"',
      '"Not today, {name}"',
      '"Remove {name}"',
      '"Start with {name}"',
      '"How to do {name}"',
      '"Undo Not today, {old}"',
    ])
      expect(uf086, s).toContain(s);
    expect(uf086).toContain("Accessible names are unique per row");
  });
  it("specifies Not today with its Undo line and no-alternative copy", () => {
    const n = section(uf086, '## "Not today" (D-0275 §8)');
    expect(n).toContain('**"{old} · Not today · Undo"**');
    expect(n).toContain("No preference is learned");
    expect(n).toContain('**"No other exercise fits. Use Swap."**');
    expect(n).toContain("**no timeout**");
  });
  it("specifies local Add, last-exercise-removed and the focus rule on Back", () => {
    expect(section(uf086, "## Add exercise (UF-08.5, local)")).toContain("**An Add is local**");
    expect(section(uf086, "## Remove and the Removed line")).toContain(
      '**"{Area} removed. Add it back below."**',
    );
    expect(section(uf086, "## Focus")).toContain(
      "**focus on the open button of the row that was opened**",
    );
    expect(uf086).toContain("Add during a workout (UF-09.9, UF-09.10) is untouched");
  });
  it("covers sibling states online/offline", () => {
    expect(uf086).toContain("| Offline (sibling of online)");
    expect(uf086).toContain("| Normal (online, area with exercises)");
  });
});

describe("T-0993 AC4 tokens only, contrast pairs with ratios, 44 px, words", () => {
  const files: Record<string, string> = { "UF-08.2": head, "UF-08.6": uf086 };
  it.each(Object.keys(files))("%s has no hex, no retired font, no new token", (k) => {
    const t = files[k] as string;
    expect(t).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(t).not.toMatch(/DM Sans|Big Shoulders|Chalk/);
    expect(t).toContain("No new token");
    expect(t).toContain("--wl-");
    expect(t).toContain("at least 44");
    expect(t).toContain("D-0211 §5");
  });
  it("only names --wl-* variables that exist in the foundation", () => {
    const known = new Set([
      "--wl-bg",
      "--wl-raise",
      "--wl-line",
      "--wl-ink",
      "--wl-ink-muted",
      "--wl-ink-on-raise",
      "--wl-action",
      "--wl-on-action",
      "--wl-focus",
      "--wl-font",
      "--wl-font-plan",
    ]);
    for (const t of [head, uf086])
      for (const m of t.matchAll(/--wl-[a-z-]+/g)) expect(known.has(m[0]), m[0]).toBe(true);
  });
  it("the written ratios match tokens.json", () => {
    const r = (a: string, b: string) => contrast(plan[a] as string, plan[b] as string).toFixed(1);
    expect(r("ink", "bg")).toBe("8.6");
    expect(r("ink-muted", "bg")).toBe("5.9");
    expect(r("ink", "raise")).toBe("6.2");
    expect(r("ink-on-raise", "raise")).toBe("4.9");
    expect(r("on-action", "action")).toBe("8.6");
    expect(r("ink-muted", "raise")).toBe("4.2"); // fails 4.5: the specs must not rely on it
    for (const t of [head, uf086]) {
      expect(t).toContain("8.6:1");
      expect(t).toContain("5.9:1");
      expect(t).toContain("6.2:1");
      expect(t).toContain("4.2:1");
      expect(t).toMatch(/--wl-ink-muted` on `--wl-raise` is 4\.2:1[^.]*not used/);
    }
  });
  it("covers 320 px and 200 % zoom", () => {
    for (const t of [head, uf086]) {
      expect(t).toContain("320 px");
      expect(t).toContain("200 % zoom");
    }
  });
  it("sizes the stepper buttons at 48 px", () => {
    expect(section(uf082, "## Area row")).toContain("**48 × 48 px**");
  });
});

describe("T-0993 AC5 retired features say so and what replaces them", () => {
  it("UF-08.2 retires Reorder, empty mode, Suggestions and Looks good", () => {
    const retired = uf082.match(/[Rr]etired by D-0274/g) ?? [];
    expect(retired.length).toBeGreaterThanOrEqual(6);
    expect(section(uf082, "## Reorder mode")).toMatch(
      /\*\*Retired by D-0274 §4\.\*\* Replaced by: automatic order/,
    );
    expect(section(uf082, "# Empty mode (D-0236, D-0238, D-0239, T-0939)")).toContain(
      "Retired by D-0274",
    );
    expect(section(uf082, "### Suggestions section (D-0238, D-0239 §8)")).toMatch(
      /Retired by D-0274 \(supersedes D-0238\)\.\*\* Replaced by "Add an area"/,
    );
    expect(section(uf082, '### "Looks good" at 0 items (D-0239 §11)')).toContain(
      'Replaced by "Start workout"',
    );
  });
  it("UF-08.4 has no file and is said to be retired in one line", () => {
    expect(head).toMatch(/UF-08\.4 Ready is retired \(D-0280\): there is no `UF-08\.4\.md`/);
    expect(head).toContain("never reused");
  });
  it("UF-08.1, UF-08.3 and UF-08.5 are amended", () => {
    expect(uf081).toContain("opens UF-08.2 **with no areas**");
    expect(uf081).toContain("**Amended by D-0274:**");
    expect(uf081).not.toContain("in **empty mode** for this visit");
    expect(uf083).toContain("Opened from UF-08.6");
    expect(uf083).toContain("`UF-08.6.md`");
    expect(uf085).toContain("a sheet over **UF-08.6 Area detail**");
    expect(uf085).toContain("retired by D-0274");
    expect(uf085).toContain("**Local Add:**");
    expect(uf085).toContain("**{A}** (the open area");
  });
});

describe("T-0993 AC6 folded Start: Done by, Focus mode, Start workout states", () => {
  it("specifies Done by and the minutes to fill", () => {
    expect(head).toContain('**"Done by {HH:MM}"**');
    expect(head).toContain('**"{n} min to fill"**');
  });
  it("specifies the closed disclosure, its content and focus order", () => {
    const d = section(uf082, "## Focus mode disclosure (D-0280 §3)");
    expect(d).toContain("**closed on every visit**");
    for (const s of [
      "Sound cues",
      "Voice countdown 3-2-1",
      "Keep screen awake",
      "four steps",
      'localStorage["wl-focus-prefs"]',
    ])
      expect(d, s).toContain(s);
    expect(d).toContain("Tab order inside the page");
    expect(d).toContain("No UF-09 control is added");
  });
  it("specifies Start workout in normal, no areas, pending and failed", () => {
    const s = section(uf082, '## "Start workout" (D-0280 §1, §2)');
    expect(s).toContain("**Normal:**");
    expect(s).toContain("**No areas**");
    expect(s).toContain("Add at least one area.");
    expect(s).toContain("**Pending**");
    expect(s).toContain("**inert**");
    expect(s).toContain("**Failed**");
    expect(s).toContain("Couldn't start the workout. Try again.");
    expect(s).toContain('`role="alert"`');
    expect(s).toContain("8.6:1");
    expect(s).toContain("6.2:1");
  });
  it("describes the interim in which Looks good opens the built UF-08.4", () => {
    const s = section(uf082, '## "Start workout" (D-0280 §1, §2)');
    expect(s).toMatch(
      /\*\*Interim \(D-0280 §8\):\*\* until T-1009 lands[^]*"Looks good"[^]*opens the built UF-08\.4/,
    );
  });
  it("names the web follow-up", () => {
    expect(uf082).toContain("web-feature:UF-08");
    for (const t of ["T-0996", "T-0997", "T-1009", "T-0998"]) expect(uf082, t).toContain(t);
    expect(uf086).toContain("web-feature:UF-08, T-0997");
  });
});
