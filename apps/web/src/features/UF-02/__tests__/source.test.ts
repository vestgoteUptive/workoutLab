// T-0302a source and shape pins: AC-2 (no coverage/attention arithmetic), AC-5 (the slot is
// null here, and no UF-11 import), AC-13 (catalogue reads, exports).
// T-0302c widens the AC-2 ban to multiplicative attention arithmetic (`load * k < target`), and
// adds its own AC-5 (the card's min-height) and AC-8 (the card's strings) pins.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import { uf02 } from "../../../lib/i18n/flows/uf-02.js";

const FEATURE = resolve(__dirname, "..");

function sourceFiles(dir: string = FEATURE): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "__e2e__") continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const read = (path: string): string => readFileSync(path, "utf8");

describe("AC-2 source: no coverageStep or needsAttention computation", () => {
  it("finds the files it scans (non-vacuous)", () => {
    const names = sourceFiles().map((p) => relative(FEATURE, p));
    expect(names).toEqual(
      expect.arrayContaining([
        "Today.tsx",
        "use-today.ts",
        "slots.tsx",
        "index.tsx",
        "SuggestionCard.tsx",
      ]),
    );
  });

  it.each(sourceFiles().map((p) => [relative(FEATURE, p), p]))(
    "%s has no `load /`, `/ target` or `deficit >` arithmetic and never assigns needsAttention",
    (_name, path) => {
      const src = read(path);
      expect(src).not.toMatch(/\bload[ \t]*\/(?![/*])/);
      expect(src).not.toMatch(/\/[ \t]*target\b/);
      expect(src).not.toMatch(/\bdeficit[ \t]*>/);
      expect(src).not.toMatch(/\bcoverageStep\s*[:=](?!=)/);
      expect(src).not.toMatch(/\bneedsAttention\s*[:=](?!=)/);
      expect(src).not.toMatch(/coverageStepOf|deficitOf|needsAttentionOf/);
    },
  );

  // T-0302c: scaled load or target, and load compared with target, in either order.
  const SCALED = [
    /\bload\b\s*\*/,
    /\*\s*(?:[\w$]+\.)*load\b/,
    /\btarget\b\s*\*/,
    /\*\s*(?:[\w$]+\.)*target\b/,
    /\bload\b\s*[<>]/,
    /(?<!=)[<>]=?\s*(?:[\w$]+\.)*load\b/,
    /\btarget\b\s*[<>]/,
    /(?<!=)[<>]=?\s*(?:[\w$]+\.)*target\b/,
  ];
  const scaled = (src: string): boolean => SCALED.some((re) => re.test(src));

  it.each(sourceFiles().map((p) => [relative(FEATURE, p), p]))(
    "%s has no multiplicative attention arithmetic (load * k, load < target * k)",
    (_name, path) => {
      const src = read(path);
      for (const re of SCALED) expect(src).not.toMatch(re);
    },
  );

  it("CONTRAST: the widened patterns catch scaled comparisons, and pass plain property reads", () => {
    for (const bad of [
      "if (load * k < target) flag();",
      "const low = a.load < a.target * 0.5;",
      "2 * a.load >= a.target",
      "a.target * 0.5 > a.load",
      "x = 0.5 * target",
    ]) {
      expect(scaled(bad), bad).toBe(true);
    }
    for (const ok of [
      "result.areas.every((a) => a.load === 0)",
      "const flagged = result.areas.filter((a) => a.needsAttention);",
      "Math.ceil(workout.totalS / 60)",
    ]) {
      expect(scaled(ok), ok).toBe(false);
    }
  });

  it("CONTRAST: the patterns do catch the arithmetic they ban", () => {
    for (const bad of [
      "const r = a.load / a.target;",
      "x = 1 - load/target",
      "if (deficit > 0.5)",
      "{ needsAttention: true }",
    ]) {
      const hit =
        /\bload[ \t]*\/(?![/*])/.test(bad) ||
        /\/[ \t]*target\b/.test(bad) ||
        /\bdeficit[ \t]*>/.test(bad) ||
        /\bneedsAttention\s*[:=](?!=)/.test(bad);
      expect(hit, bad).toBe(true);
    }
  });
});

describe("AC-5 slot", () => {
  it("todayCheckinSlot is null in this ticket", async () => {
    const { todayCheckinSlot } = await import("../slots.js");
    expect(todayCheckinSlot).toBeNull();
  });

  it("no file in features/UF-02 imports features/UF-11", () => {
    for (const path of sourceFiles()) {
      const src = read(path);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bfrom\s+["'][^"']*UF-11/);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bimport\s*\(\s*["'][^"']*UF-11/);
      expect(src, relative(FEATURE, path)).not.toMatch(/\bimport\s+["'][^"']*UF-11/);
    }
  });
});

describe("AC-5 import-ban CONTRAST", () => {
  it("the ban patterns catch a static, a side-effect and a dynamic UF-11 import", () => {
    for (const bad of [
      'import { CheckinCard } from "../UF-11/index.js";',
      'import "../UF-11/index.js";',
      'lazy(() => import("../UF-11/index.js"))',
    ]) {
      const hit =
        /\bfrom\s+["'][^"']*UF-11/.test(bad) ||
        /\bimport\s*\(\s*["'][^"']*UF-11/.test(bad) ||
        /\bimport\s+["'][^"']*UF-11/.test(bad);
      expect(hit, bad).toBe(true);
    }
  });
});

describe("T-0302c AC-5 the card's min-height", () => {
  const css = read(join(FEATURE, "today.css"));
  const ruleIn = (sheet: string, cls: string): string | null =>
    new RegExp(`(^|\\n)\\.${cls}\\s*\\{([^}]*)\\}`).exec(sheet)?.[2] ?? null;
  const rule = (cls: string): string | null => ruleIn(css, cls);
  const minHeightOf = (sheet: string): string | null =>
    /\bmin-height:\s*(\d+)px;/.exec(ruleIn(sheet, "wl-today-card") ?? "")?.[1] ?? null;

  it("the .wl-today-card rule in features/UF-02/*.css has a px min-height", () => {
    const files = readdirSync(FEATURE).filter((n) => n.endsWith(".css"));
    expect(files).toContain("today.css");
    const body = rule("wl-today-card");
    expect(body).not.toBeNull();
    expect(body!).toMatch(/\bmin-height:\s*\d+px;/);
  });

  it("the skeleton and the loaded card both render that one class", () => {
    const src = read(join(FEATURE, "SuggestionCard.tsx"));
    expect(src).toMatch(/const CARD_CLASS = "wl-today-card";/);
    // Every <section> in the file (skeleton, empty, loaded) takes CARD_CLASS and nothing else.
    const sections = [...src.matchAll(/<section\s+className=\{(\w+)\}/g)].map((m) => m[1]);
    expect(sections).toEqual(["CARD_CLASS", "CARD_CLASS", "CARD_CLASS"]);
    expect(src).not.toMatch(/className=\{`\$\{CARD_CLASS\}/);
  });

  it("CONTRAST: a rule without min-height is caught", () => {
    const body = rule("wl-today-card")!;
    const withoutMinHeight = css.replace(body, body.replace(/\n\s*min-height: \d+px;/, ""));
    expect(minHeightOf(css)).not.toBeNull();
    expect(minHeightOf(withoutMinHeight)).toBeNull();
  });
});

describe("T-0302c AC-8 the card's strings", () => {
  const src = read(join(FEATURE, "SuggestionCard.tsx"));

  it("SuggestionCard.tsx reads only en.uf02 from the catalogue, and workout.ts for the rest", () => {
    const roots = new Set([...src.matchAll(/(?<![\w./])en\.(\w+)/g)].map((m) => m[1]));
    expect([...roots]).toEqual(["uf02"]);
    const i18n = [...src.matchAll(/from\s+"([^"]*lib\/i18n[^"]*)"/g)].map((m) => m[1]).sort();
    expect(i18n).toEqual(["../../lib/i18n/en.js", "../../lib/i18n/workout.js"]);
  });

  it("the card copy in en.uf02", () => {
    expect(uf02.suggestedFor("45")).toBe("Suggested for 45 min");
    expect(uf02.cardSummary(3, "3", "29")).toBe("3 exercises · ~29 min");
    expect(uf02.cardSummary(1, "1", "12")).toBe("1 exercise · ~12 min");
    expect(uf02.itemRow("Bench press", "4 × 6–8")).toBe("Bench press 4 × 6–8");
    expect(uf02.more("2")).toBe("+2 more");
    expect(uf02.seeAll).toBe("See all");
    expect(uf02.nothingSuggested).toBe("Nothing suggested yet");
  });
});

describe("AC-13 strings and exports", () => {
  it("Today.tsx reads only en.uf02, en.screens.today and en.bodyMap from the catalogue", () => {
    const src = read(join(FEATURE, "Today.tsx"));
    const roots = new Set([...src.matchAll(/(?<![\w./])en\.(\w+)/g)].map((m) => m[1]));
    expect([...roots].sort()).toEqual(["bodyMap", "screens", "uf02"]);
    const screens = new Set([...src.matchAll(/(?<![\w./])en\.screens\.(\w+)/g)].map((m) => m[1]));
    expect([...screens]).toEqual(["today"]);
  });

  it("en.uf02 is the flow module and holds the UF-02.1 copy", () => {
    expect(en.uf02).toBe(uf02);
    expect(uf02.noWorkouts).toBe("No workouts yet. Start your first one.");
    expect(uf02.nothingRecent).toBe(
      "Nothing logged in the last 14 days. Start a workout to pick up again.",
    );
    expect(uf02.noPlan).toBe("Connect to finish setting up your plan");
    expect(uf02.start).toBe("Start workout");
    expect(uf02.attention("Back, Chest")).toBe("Needs attention: Back, Chest");
    expect(uf02.more("6")).toBe("+6 more");
  });

  it("index.tsx exports exactly Today", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod)).toEqual(["Today"]);
  });
});
