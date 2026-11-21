// T-0962 (D-0256, D-0258, D-0211, D-0208): the UF-06.2 screen spec (Est. 1RM card, chart, table)
// is checked as text, and its contrast line is checked against the tokens. AC1 (screen IDs, no
// legacy v1 labels) is covered by the repo check, which this test also runs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contrast, pkgRoot, repoRoot } from "./helpers";

const specPath = resolve(repoRoot, "Design-docs/docs/design/screens/UF-06.2.md");
const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";

describe("T-0962 AC1 the repo checks accept the spec", () => {
  it("exists and check-all passes (screen IDs valid, no legacy v1 labels)", () => {
    expect(existsSync(specPath), "UF-06.2.md exists").toBe(true);
    const r = spawnSync(process.execPath, [resolve(repoRoot, ".github/scripts/check-all.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(r.stdout + r.stderr).not.toMatch(/UF-06\.2\.md/);
    expect(r.status, r.stdout).toBe(0);
  });
});

describe("T-0962 AC2 tokens: every --wl- name exists, no legacy names", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wl-t0962-css-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  it("names only existing variables, and uses --wl-action, --wl-bg, --wl-line, --wl-ink-muted", () => {
    const out = join(tmp, "tokens.css");
    const res = spawnSync(
      process.execPath,
      [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
      { encoding: "utf8" },
    );
    expect(res.status, res.stderr).toBe(0);
    // Raw keys come from the tokens build; the generic state variables are mapped in main.css.
    const css =
      readFileSync(out, "utf8") + readFileSync(resolve(repoRoot, "apps/web/src/main.css"), "utf8");
    const named = new Set(spec.match(/--wl-[a-z0-9-]+/g) ?? []);
    for (const v of ["--wl-action", "--wl-bg", "--wl-line", "--wl-ink-muted"])
      expect(named, v).toContain(v);
    for (const v of named) expect(css, `names ${v}`).toMatch(new RegExp(`${v}\\s*:`));
  });
  it("names none of the legacy accent, line or text-muted tokens, no raw colour, no new font", () => {
    expect(spec).not.toMatch(/`(accent|line|text-muted|surface)`/);
    expect(spec).not.toMatch(/text-muted/);
    expect(spec).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(spec).not.toMatch(/DM Sans|Big Shoulders|Chalk/);
  });
});

describe("T-0962 AC3 the contrast line matches the tokens (plan state)", () => {
  const plan = (
    JSON.parse(readFileSync(resolve(pkgRoot, "src/tokens.json"), "utf8")) as {
      color: { plan: Record<string, string> };
    }
  ).color.plan as Record<string, string>;
  it("--wl-action on --wl-bg is at least 3:1 (line and dots)", () => {
    expect(contrast(plan.action as string, plan.bg as string)).toBeGreaterThanOrEqual(3);
  });
  it("--wl-ink-muted on --wl-bg is at least 4.5:1 (text)", () => {
    expect(contrast(plan["ink-muted"] as string, plan.bg as string)).toBeGreaterThanOrEqual(4.5);
  });
  it("--wl-line on --wl-bg is decorative, about 2.1:1", () => {
    const r = contrast(plan.line as string, plan.bg as string);
    expect(r).toBeGreaterThan(1.9);
    expect(r).toBeLessThan(3);
    expect(spec).toContain("2.1:1");
    expect(spec).toContain("at least 4.5:1");
    expect(spec).toContain("at least 3:1");
  });
});

describe("T-0962 AC4 states, copy and chart rules", () => {
  it.each([
    "Zero history",
    "None valid",
    "Bodyweight or timed",
    "One point",
    "Two or more points",
    "Returning after 10 days off",
    "Offline",
    "Partial cache",
    "Same-day sessions",
  ])("has the state row %s", (s) => {
    expect(spec).toMatch(new RegExp(`^\\| ${s}\\b`, "m"));
  });
  it.each([
    "No estimate yet. Estimates need a weighted set of 1–10 reps.",
    "Estimated 1RM is for weighted lifts.",
    "One session so far. Log it again to see a trend.",
    "Estimated from your best weighted set of 1–10 reps each session. It's a guide, not a tested max.",
    "Up 3 kg since 12 Oct",
    "Down 2 kg since 12 Oct",
    "Same as 12 Oct",
    "Estimated 1RM per session",
    "Show as table",
    "Hide table",
  ])("has the exact string %s", (s) => {
    expect(spec).toContain(s);
  });
  it("states the page order, chart geometry and a11y rules", () => {
    const order = [
      "title",
      "caption",
      "offline line",
      "stat cards",
      "delta line",
      "chart",
      "table toggle",
      "explanation",
      "session rows",
      "how-to link",
    ].map((s) => spec.indexOf(`**${s}**`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const s of [
      "Best set",
      "Heaviest",
      "Sessions",
      "Est. 1RM",
      "`text-anchor: end`",
      "`vector-effect: non-scaling-stroke`",
      "d MMM",
      '`role="img"`',
      "`aria-label`",
      "`aria-hidden`",
      "plain paragraph",
      "`aria-expanded`",
      "`aria-controls`",
      '`scope="row"`',
      "Date",
      "oldest first",
      "only when expanded",
      "Focus stays on the toggle",
      "vertical step",
    ])
      expect(spec, s).toContain(s);
  });
});

// Geometry rows are anchored to their table row and a word boundary, so "6 px" cannot match
// inside "36 px" and a number cannot sit in the wrong row.
describe("T-0962 chart geometry, anchored to its row", () => {
  const row = (name: string): string =>
    spec.split("\n").find((l) => l.startsWith("|") && l.split("|")[1]?.trim() === name) ?? "";
  const has = (name: string, re: RegExp) => expect(row(name), name).toMatch(re);
  it("size, line, dots, gridlines, reserves", () => {
    has("Size", /Height \*\*160 px\*\*/);
    has("Size", /`ResizeObserver`/);
    has("Size", /fallback width of \*\*320\*\* px/);
    has("Plot area", /Top padding \*\*28 px\*\*.*y = \*\*120 px\*\*.*y = \*\*152 px\*\*/);
    has("Label text", /\*\*0\.75rem\*\* \(12 px/);
    has("Line", /(^|[^\d])\*\*2 px\*\*,/);
    has("Dots", /\*\*6 px\*\* diameter.*\*\*2 px `--wl-bg` ring\*\*/);
    has("Gridlines", /\*\*1 px\*\*, `--wl-line`/);
    has("Gridlines", /\*\*2 or 3\*\* lines/);
    has("Reserves", /\*\*Left 56 px\*\*.*\*\*right 16 px\*\*/);
    has("Latest label", /`text-anchor: end`.*\*\*10 px above\*\*.*\*\*16 px below\*\*/);
    has("Line", /`vector-effect: non-scaling-stroke`/);
  });
  it("y axis algorithm, one point, table and card rules", () => {
    for (const s of [
      "strictly below",
      "`hi − lo < 10`",
      "100 kg gives 95 to 105",
      "**2 gridlines**",
      "**3**",
      "**centre**",
      "shown **once**",
      "directly under the chart, above the table toggle",
      "Delta = round(last) − round(first)",
      "always rendered and is empty while collapsed",
      "reuse `weightedBest`",
      "100 kg × 8",
      "`.wl-progress__cards` flex-wrap row",
      "**4th card**",
      "1 session, about {value} kg on {d}.",
      "{n} sessions",
      "## Chart tokens",
    ].map((x) => x.replace("## Chart tokens", "Chart tokens")))
      expect(spec, s).toContain(s);
    expect(spec).not.toContain("Tokens (only these");
    expect(spec).not.toContain("100 kg x 8");
    expect(spec).toMatch(/touch targets? at least \*?\*?44 px/i);
    expect(spec).toMatch(/at least \*\*44 px\*\* tall/);
  });
});

describe("T-0962 AC5 the prototype is superseded", () => {
  it("says UF06-2-History.dc.html is superseded", () => {
    expect(spec).toMatch(/`UF06-2-History\.dc\.html`[^\n]*superseded/);
    expect(spec).toContain("Brzycki");
    expect(spec).toContain("+19 kg in 12 weeks");
  });
});
