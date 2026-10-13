// T-0609 (D-0208, D-0210, D-0211, D-0213; UF-06.1, UF-06.2): the Cobalt plan-state contract that
// jsdom can read: the state roots, the calendar's marks and words, the stat role, the stylesheet
// guard and the contrast of every text pair (from tokens.json). The computed look is proven in a
// real browser in `tests/e2e/uf-06-progress.spec.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@workoutlab/design-tokens";
import { en } from "../../../lib/i18n/en.js";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { ExerciseHistory } from "../ExerciseHistory.js";
import { Progress } from "../Progress.js";
import { LOCALE, NOW, TZ, USER, historyH, seed, set } from "./fixtures.js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from } }));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});

const CSS = readFileSync(resolve(__dirname, "../progress.css"), "utf8");
const PLAN = tokens.color.plan;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...strip(CSS).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1]!.split(",").map((x) => x.trim()),
  body: m[2]!,
}));
const find = (selector: string) => rules.find((r) => r.selectors.includes(selector));

function lum(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/progress" element={<Progress now={NOW} timeZone={TZ} locale={LOCALE} />} />
        <Route
          path="/progress/:exerciseId"
          element={<ExerciseHistory now={NOW} timeZone={TZ} locale={LOCALE} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("T-0609 AC1 state", () => {
  it("UF-06.1 and UF-06.2 are plan-state page roots; the title is a page title with the stop", async () => {
    await seed({ history: historyH(), sessions: [] });
    renderAt("/progress");
    const root = await waitFor(() => {
      const el = document.querySelector('[data-screen-id="UF-06.1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("wl-type-page-title", "wl-title--stop");
    expect(h1).toHaveTextContent(en.screens.progress);
    expect(await screen.findByRole("link", { name: /Back squat/ })).toHaveClass("wl-row");
    expect(screen.getByTestId("balance-card")).toHaveClass("wl-row");
  });

  it("UF-06.2 root, How to as a text button, sessions as rows", async () => {
    await seed({ history: historyH(), sessions: [] });
    renderAt("/progress/back-squat");
    expect(await screen.findByRole("heading", { level: 1, name: "Back squat" })).toHaveClass(
      "wl-type-page-title",
      "wl-title--stop",
    );
    const root = document.querySelector('[data-screen-id="UF-06.2"]')!;
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: en.uf06.howTo })).toHaveClass("wl-button--text");
    const list = screen.getByRole("list", { name: en.uf06.historyName });
    expect(list.querySelectorAll("li.wl-row")).toHaveLength(2);
  });
});

describe("T-0609 AC2 calendar", () => {
  const sessions = [
    { id: "S1", startedAt: "2026-09-01T07:00:00Z" },
    { id: "S3", startedAt: "2026-09-14T08:00:00Z" },
  ];
  const history = [
    set("S1", "back-squat", "2026-09-01 09:00", { w: 50, r: 8 }),
    set("S3", "back-squat", "2026-09-14 10:00", { w: 50, r: 8 }),
  ];

  it("workout days keep the 'Workout' text, the others have none; both rules are in the CSS", async () => {
    await seed({ history, sessions });
    renderAt("/progress");
    await screen.findByText("2 workouts this month");
    const marked = [...document.querySelectorAll("td[data-marked='true']")];
    expect(marked.map((td) => td.getAttribute("data-day"))).toEqual(["1", "14"]);
    for (const td of marked) expect(td).toHaveTextContent(en.uf06.workoutDay);
    // T-0673: the date and the sr-only word are separated, so a reader does not say "14Workout".
    for (const td of marked) {
      expect(td.textContent).toBe(`${td.getAttribute("data-day")}, ${en.uf06.workoutDay}`);
    }
    const plain = document.querySelector("td[data-day='2']")!;
    expect(plain).not.toHaveTextContent(en.uf06.workoutDay);
    expect(find(".wl-progress .wl-progress__day")?.body).toMatch(/color:\s*var\(--wl-ink-muted\)/);
    const m = find('.wl-progress .wl-progress__day[data-marked="true"]')!;
    expect(m.body).toMatch(/color:\s*var\(--wl-ink\)/);
    expect(m.body).toMatch(/font-weight:\s*700/);
    expect(m.body).not.toMatch(/background/);
  });

  it("a month with no workouts marks nothing and keeps the count line", async () => {
    await seed({ history: [], sessions: [] });
    renderAt("/progress");
    expect(await screen.findByText("0 workouts this month")).toBeInTheDocument();
    expect(document.querySelectorAll("td[data-marked]")).toHaveLength(0);
    expect(document.querySelectorAll("td[data-day]").length).toBeGreaterThan(27);
    expect(screen.queryByText(en.uf06.workoutDay)).toBeNull();
  });

  it("today is a 2 px underline", () => {
    const r = find('.wl-progress .wl-progress__day[data-today="true"] > span:first-child')!;
    expect(r.body).toMatch(/border-block-end:\s*2px solid var\(--wl-ink\)/);
  });
});

describe("T-0609 AC3 stats", () => {
  it("with sets, the three values are the stat role under label captions", async () => {
    await seed({ history: historyH(), sessions: [] });
    renderAt("/progress/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    const dds = [...document.querySelectorAll("dl dd")];
    expect(dds).toHaveLength(3);
    for (const dd of dds) expect(dd).toHaveClass("wl-type-stat");
    for (const dt of document.querySelectorAll("dl dt")) expect(dt).toHaveClass("wl-type-label");
    expect(dds.map((d) => d.textContent)).toEqual(["102.5 kg × 5", "102.5 kg", "2"]);
  });

  it("the heaviest stat of a set without load shows the — placeholder in the stat role", async () => {
    await seed({ history: [set("Z", "back-squat", "2026-09-25 10:00")], sessions: [] });
    renderAt("/progress/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    const dds = [...document.querySelectorAll("dl dd")];
    expect(dds[1]).toHaveTextContent(en.uf06.noValue);
    expect(dds[1]).toHaveClass("wl-type-stat");
  });

  it("no sets in 8 weeks shows the empty line and no stats", async () => {
    await seed({ history: [], sessions: [] });
    renderAt("/progress/back-squat");
    expect(await screen.findByText(en.uf06.noSets)).toBeInTheDocument();
    expect(document.querySelectorAll("dl")).toHaveLength(0);
  });
});

describe("T-0609 AC4 stylesheet guard and contrast", () => {
  it("no raw colour, no px font size, no legacy colour token, no animation, every rule scoped", () => {
    expect(rules.length).toBeGreaterThan(20);
    for (const r of rules) {
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/--wl-color-/);
      expect(r.body).not.toMatch(/transition|animation/);
      // Only the row's decorative chevron pseudo-element is hidden; no live region is.
      if (!r.selectors.every((x) => x.endsWith("::after"))) {
        expect(r.body).not.toMatch(/display:\s*none/);
      }
      for (const s of r.selectors) expect(s, s).toMatch(/^\.wl-progress /);
    }
  });

  it("rows, links and the day cells are at least 44 px tall", () => {
    expect(find(".wl-progress .wl-progress__day")?.body).toMatch(/block-size:\s*44px/);
    expect(find(".wl-progress .wl-progress__balance")?.body).toMatch(/min-block-size:\s*44px/);
    expect(find(".wl-progress .wl-progress__recent-row")?.body).toMatch(/min-block-size:\s*56px/);
  });

  it.each([
    ["ink on bg (day numbers, titles, stats)", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (days, captions, weekday heads)", PLAN["ink-muted"], PLAN.bg, 4.5],
    ["ink on raise (hover rows)", PLAN.ink, PLAN.raise, 4.5],
  ])("%s", (_n, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("ink-muted is never painted on raise: the hover rule switches captions to ink", () => {
    expect(ratio(PLAN["ink-muted"], PLAN.raise)).toBeLessThan(4.5);
    const r = rules.find((x) => x.selectors.some((s) => s.includes(":hover .wl-type-label")))!;
    expect(r.body).toMatch(/color:\s*var\(--wl-ink\)/);
  });
});
