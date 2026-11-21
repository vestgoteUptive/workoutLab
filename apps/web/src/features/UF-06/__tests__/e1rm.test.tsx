// T-0963 UF-06.2: the Est. 1RM card, delta line, hand-written SVG chart and table (D-0254..D-0258).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { estimatedOneRepMax, type HistorySet } from "@workoutlab/engine";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { en } from "../../../lib/i18n/en.js";
import { ExerciseHistory } from "../ExerciseHistory.js";
import { yAxis } from "../E1rmChart.js";
import { e1rmSeries } from "../stats.js";
import { LIBRARY, LOCALE, TZ, USER, seed, set } from "./fixtures.js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from } }));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

// 2026-11-19 12:00 Stockholm (CET, +01:00): 12 Oct, 4 Nov and 18 Nov are all in the window.
const NOW = new Date("2026-11-19T12:00:00+01:00");
const squat = (session: string, date: string, w: number, r: number, extra = {}) =>
  set(session, "back-squat", `${date} 10:00`, { w, r, ...extra });

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/progress/${id}`]}>
      <Routes>
        <Route
          path="/progress/:exerciseId"
          element={<ExerciseHistory now={NOW} timeZone={TZ} locale={LOCALE} />}
        />
        <Route path="/progress" element={<div data-screen-id="UF-06.1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 118, 121, 124 (nearest kg) on 12 Oct, 4 Nov, 18 Nov. */
const trio = (last: [number, number] = [112.5, 3]): HistorySet[] => [
  squat("S1", "2026-10-12", 107.5, 3),
  squat("S2", "2026-11-04", 110, 3),
  squat("S3", "2026-11-18", last[0], last[1]),
];
const card = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
const svg = () => screen.getByTestId("e1rm-chart");
const dots = () => [...svg().querySelectorAll("[data-part='dot']")];
const dotX = () => dots().map((d) => Number(d.querySelector("circle")!.getAttribute("cx")));

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("AC1 card and delta", () => {
  it("up 6 kg since 12 Oct", async () => {
    await seed({ history: trio() });
    renderAt("back-squat");
    expect(await screen.findByText("about 124 kg", { selector: "dd" })).toBeInTheDocument();
    expect(card("Est. 1RM")).toHaveTextContent("about 124 kg");
    expect(screen.getByText("Up 6 kg since 12 Oct")).toBeInTheDocument();
    const delta = screen.getByText("Up 6 kg since 12 Oct");
    expect(delta.tagName).toBe("P");
    expect(delta.closest("[aria-live]")).toBeNull();
    // 4th card, last in DOM order
    expect([...document.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "Best set",
      "Heaviest",
      "Sessions",
      "Est. 1RM",
    ]);
  });
  it("down 2 kg, and same", async () => {
    await seed({ history: trio([105, 3]) });
    renderAt("back-squat");
    expect(await screen.findByText("Down 2 kg since 12 Oct")).toBeInTheDocument();
    cleanup();
    await seed({
      history: [squat("S1", "2026-10-12", 107.5, 3), squat("S3", "2026-11-18", 107.5, 3)],
    });
    renderAt("back-squat");
    expect(await screen.findByText("Same as 12 Oct")).toBeInTheDocument();
  });
  it("delta is round(last) minus round(first), not the rounded raw difference", async () => {
    // 100x1 = 103.33 -> 103; 100x2 = 106.67 -> 107; raw diff 3.33, rounded diff 4.
    await seed({ history: [squat("S1", "2026-10-12", 100, 1), squat("S2", "2026-11-18", 100, 2)] });
    renderAt("back-squat");
    expect(await screen.findByText("Up 4 kg since 12 Oct")).toBeInTheDocument();
  });
});

describe("AC2 rounding", () => {
  it("126.667 reads about 127 kg with no decimal", async () => {
    await seed({ history: [squat("S1", "2026-11-18", 100, 8)] });
    renderAt("back-squat");
    expect(await screen.findByText("about 127 kg", { selector: "dd" })).toBeInTheDocument();
    expect(card("Est. 1RM")!.textContent).toBe("about 127 kg");
  });
});

describe("AC3 one point", () => {
  it("one dot, label, no line, note, no delta", async () => {
    await seed({ history: [squat("S1", "2026-11-18", 100, 8)] });
    renderAt("back-squat");
    expect(await screen.findByText(en.uf06.e1rmOnePoint)).toBeInTheDocument();
    expect(dots()).toHaveLength(1);
    expect(svg().querySelector("[data-part='line']")).toBeNull();
    expect(svg().querySelector("[data-part='latest']")).toHaveTextContent("about 127 kg");
    expect(svg().querySelectorAll("[data-part='date']")).toHaveLength(1);
    expect(svg().querySelector("[data-part='date']")).toHaveAttribute("text-anchor", "middle");
    expect(svg().getAttribute("aria-label")).toBe(
      "Estimated one-rep max, 1 session, about 127 kg on 18 Nov.",
    );
    expect(screen.queryByText(/since|Same as/)).toBeNull();
    // order: chart, note, toggle, explanation
    const note = screen.getByText(en.uf06.e1rmOnePoint);
    const toggle = screen.getByRole("button", { name: "Show as table" });
    expect(svg().compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("AC4 none valid", () => {
  it.each([
    ["60 x 15", { w: 60, r: 15 }],
    ["weight 0", { w: 0, r: 8 }],
  ])("%s: no card, no chart, the no-estimate line", async (_n, f) => {
    await seed({ history: [squat("S1", "2026-11-18", f.w, f.r)] });
    renderAt("back-squat");
    expect(await screen.findByText(en.uf06.e1rmNone)).toBeInTheDocument();
    expect(en.uf06.e1rmNone).toBe("No estimate yet. Estimates need a weighted set of 1–10 reps.");
    expect(screen.queryByText("Est. 1RM")).toBeNull();
    expect(screen.queryByTestId("e1rm-chart")).toBeNull();
    expect(screen.queryByRole("button", { name: /table/ })).toBeNull();
    expect(screen.queryByText(en.uf06.e1rmExplain)).toBeNull();
    expect(card("Best set")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Sessions" })).toBeInTheDocument();
  });
});

describe("AC5 bodyweight and timed", () => {
  it.each(["push-up", "plank"])("%s shows the weighted-lifts line only", async (id) => {
    await seed({
      history: [set("S1", id, "2026-11-18 10:00", id === "plank" ? { d: 40 } : { w: 0, r: 12 })],
    });
    renderAt(id);
    expect(await screen.findByText("Estimated 1RM is for weighted lifts.")).toBeInTheDocument();
    expect(screen.queryByText("Est. 1RM")).toBeNull();
    expect(screen.queryByTestId("e1rm-chart")).toBeNull();
    expect(card("Best set")).toBeInTheDocument();
    expect(card("Sessions")).toHaveTextContent("1");
  });
});

describe("AC6 zero history", () => {
  it("only the existing empty line", async () => {
    await seed({ history: [] });
    renderAt("back-squat");
    expect(await screen.findByText(en.uf06.noSets)).toBeInTheDocument();
    for (const t of [/Est\. 1RM/, /No estimate/, /weighted lifts/, /Estimated from/]) {
      expect(screen.queryByText(t)).toBeNull();
    }
    expect(screen.queryByTestId("e1rm-chart")).toBeNull();
    // bodyweight with no sets: same
    cleanup();
    renderAt("push-up");
    expect(await screen.findByText(en.uf06.noSets)).toBeInTheDocument();
    expect(screen.queryByText(/weighted lifts/)).toBeNull();
  });
});

describe("AC7 chart a11y", () => {
  it("role img, label, hidden text, axe clean", async () => {
    await seed({
      history: [...trio(), squat("S4", "2026-10-20", 110, 3), squat("S5", "2026-10-28", 110, 3)],
    });
    const { container } = renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    expect(svg()).toHaveAttribute("role", "img");
    expect(svg().getAttribute("aria-label")).toBe(
      "Estimated one-rep max, 5 sessions, from about 118 kg on 12 Oct to about 124 kg on 18 Nov.",
    );
    const texts = [...svg().querySelectorAll("text")];
    expect(texts.length).toBeGreaterThan(3);
    for (const t of texts) expect(t).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[aria-live]")).toBeNull();
    const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("AC8 table", () => {
  it("toggles, oldest first, focus stays, always-rendered target", async () => {
    await seed({
      history: [squat("S1", "2026-10-12", 97.5, 9), squat("S2", "2026-11-18", 100, 8)],
    });
    const { container } = renderAt("back-squat");
    const toggle = await screen.findByRole("button", { name: "Show as table" });
    const target = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(target).not.toBeNull();
    expect(target.childElementCount).toBe(0);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Hide table");
    expect(document.activeElement).toBe(toggle);
    const table = screen.getByRole("table", { name: "Estimated 1RM per session" });
    expect(target.contains(table)).toBe(true);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Date", "Best set", "Est. 1RM"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["12 Oct", "97.5 kg × 9", "about 127 kg"],
      ["18 Nov", "100 kg × 8", "about 127 kg"],
    ]);
    for (const r of rows) expect(r.firstElementChild).toHaveAttribute("scope", "row");
    expect(svg()).toBeVisible();
    const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Show as table");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
  it("the toggle css is at least 44 px tall", () => {
    const css = readFileSync(resolve(__dirname, "../progress.css"), "utf8");
    expect(css).toMatch(/\.wl-e1rm__toggle\s*\{[^}]*min-block-size:\s*44px/);
  });
});

describe("AC9 time axis, same day, midnight", () => {
  it("x is proportional to days", async () => {
    await seed({ history: trio() });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    const [a, b, c] = dotX() as [number, number, number];
    // plot 56..304 over 37 days: 12 Oct, 4 Nov (+23), 18 Nov (+37)
    expect(a).toBeCloseTo(56, 5);
    expect(c).toBeCloseTo(304, 5);
    expect((b - a) / (c - a)).toBeCloseTo(23 / 37, 5);
    const dates = [...svg().querySelectorAll("[data-part='date']")];
    expect(dates.map((d) => [d.textContent, d.getAttribute("text-anchor")])).toEqual([
      ["12 Oct", "start"],
      ["18 Nov", "end"],
    ]);
  });
  it("same-day sessions share an x and have one row each", async () => {
    await seed({
      history: [
        squat("S1", "2026-10-12", 100, 5),
        set("S2", "back-squat", "2026-11-18 08:00", { w: 100, r: 8 }),
        set("S3", "back-squat", "2026-11-18 18:00", { w: 105, r: 8 }),
      ],
    });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    const x = dotX();
    expect(x[1]).toBe(x[2]);
    expect(x[0]).not.toBe(x[1]);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });
  it("a session crossing midnight takes the date of its best set", async () => {
    await seed({
      history: [
        set("S1", "back-squat", "2026-11-17 23:50", {
          w: 90,
          r: 5,
          completedAt: "2026-11-17T22:50:00.000Z",
          editedAt: "2026-11-17T22:50:00.000Z",
        }),
        set("S1", "back-squat", "2026-11-18 00:10", {
          w: 100,
          r: 8,
          completedAt: "2026-11-17T23:10:00.000Z",
          editedAt: "2026-11-17T23:10:00.000Z",
        }),
      ],
    });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    expect(svg().querySelector("[data-part='date']")).toHaveTextContent("18 Nov");
  });
});

describe("AC10 window and offline", () => {
  // Same window as the rows (D-0034 §3): today-55 = 2026-09-25 is in, today-56 = 2026-09-24 is out.
  it("today-56 is not plotted", async () => {
    await seed({
      history: [squat("S1", "2026-09-24", 100, 5), squat("S2", "2026-11-18", 100, 8)],
    });
    renderAt("back-squat");
    await screen.findByText(en.uf06.e1rmOnePoint);
    expect(dots()).toHaveLength(1);
  });
  it("today-55 is plotted", async () => {
    await seed({
      history: [squat("S1", "2026-09-25", 100, 5), squat("S2", "2026-11-18", 100, 8)],
    });
    renderAt("back-squat");
    await screen.findByText(/Up 10 kg since 25 Sep/);
    expect(dots()).toHaveLength(2);
  });
  it("offline keeps the status line and equals the online values", async () => {
    await seed({ history: trio() });
    renderAt("back-squat");
    expect(await screen.findByText("Up 6 kg since 12 Oct")).toBeInTheDocument();
    const offline = svg().getAttribute("aria-label");
    expect(screen.getByText(/^Offline/)).toBeInTheDocument();
    cleanup();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderAt("back-squat");
    expect(await screen.findByText("Up 6 kg since 12 Oct")).toBeInTheDocument();
    await waitFor(() => expect(svg().getAttribute("aria-label")).toBe(offline));
  });
  it("waits with the cards when the library is not loaded", async () => {
    await seed({ history: trio(), library: [] });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { container } = renderAt("back-squat");
    await waitFor(() => expect(screen.queryByTestId("e1rm-chart")).toBeNull());
    expect(container.querySelector("[data-screen-id='UF-06.2']")).toBeNull();
    expect(container.querySelector("[aria-busy], .wl-skeleton")).toBeNull();
  });
});

describe("AC11 returning after 10 days off", () => {
  it("shows the gap and the lower point as is, no special text", async () => {
    await seed({
      history: [
        squat("S1", "2026-11-01", 110, 3),
        squat("S2", "2026-11-04", 112.5, 3),
        squat("S3", "2026-11-14", 100, 3),
      ],
    });
    renderAt("back-squat");
    expect(await screen.findByText("about 110 kg", { selector: "dd" })).toBeInTheDocument();
    const [a, b, c] = dotX() as [number, number, number];
    expect((b - a) / (c - b)).toBeCloseTo(3 / 10, 5);
    expect(screen.getByText("Down 11 kg since 1 Nov")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/break|gap|welcome back|deload/i);
  });
});

describe("AC12 scope", () => {
  const web = resolve(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  it("no other feature or shared module uses the estimate or its copy", () => {
    const bad = files(web).filter((f) => {
      if (!/\.(tsx?|css)$/.test(f) || /__tests__|__e2e__/.test(f)) return false;
      if (f.includes("/features/UF-06/") || f.endsWith("/lib/i18n/flows/uf-06.ts")) return false;
      return /estimatedOneRepMax|E1rmChart|e1rmSeries|e1rm[A-Z]|Est\. 1RM/.test(
        readFileSync(f, "utf8"),
      );
    });
    expect(bad).toEqual([]);
  });
});

describe("AC13 tokens and geometry", () => {
  it("only the four tokens, non-scaling strokes, 160 px, labels inside 320", async () => {
    await seed({ history: trio() });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    const html = svg().outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    const vars = new Set([...html.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]));
    expect(
      [...vars].every((v) =>
        ["--wl-action", "--wl-bg", "--wl-line", "--wl-ink-muted", "--wl-font"].includes(v!),
      ),
    ).toBe(true);
    for (const v of ["--wl-action", "--wl-bg", "--wl-line", "--wl-ink-muted"]) {
      expect(vars.has(v)).toBe(true);
    }
    expect(svg()).toHaveAttribute("height", "160");
    expect(svg()).toHaveAttribute("viewBox", "0 0 320 160");
    for (const el of svg().querySelectorAll("line, polyline")) {
      expect((el as SVGElement).style.getPropertyValue("vector-effect")).toBe("non-scaling-stroke");
    }
    // 2 px line, 1 px grid, 6 px dots
    expect(svg().querySelector("polyline")).toHaveAttribute("stroke-width", "2");
    expect(svg().querySelector("[data-part='grid']")).toHaveAttribute("stroke-width", "1");
    expect(dots()[0]!.querySelectorAll("circle")[1]).toHaveAttribute("r", "3");
    // text inside the viewBox (end-anchored text at most ~ 12 chars * 6.5 px wide)
    for (const t of svg().querySelectorAll("text")) {
      const x = Number(t.getAttribute("x"));
      const y = Number(t.getAttribute("y"));
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(160);
      const anchor = t.getAttribute("text-anchor");
      const w = t.textContent!.length * 6.5;
      const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
      const right = anchor === "end" ? x : anchor === "middle" ? x + w / 2 : x + w;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(320);
    }
    const css = readFileSync(resolve(__dirname, "../progress.css"), "utf8");
    expect(css).toMatch(/\.wl-e1rm__chart\s*\{[^}]*block-size:\s*160px/);
  });
  it("redraws at the ResizeObserver width", async () => {
    let cb: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(c: ResizeObserverCallback) {
          cb = c;
        }
        observe() {}
        disconnect() {}
      },
    );
    await seed({ history: trio() });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    cb([{ contentRect: { width: 500 } } as ResizeObserverEntry], {} as ResizeObserver);
    await waitFor(() => expect(svg()).toHaveAttribute("viewBox", "0 0 500 160"));
    vi.unstubAllGlobals();
  });
  it("latest label flips below when the line arrives from above", async () => {
    await seed({ history: trio([105, 3]) }); // last is lower than the previous
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    const cy = Number(dots()[2]!.querySelector("circle")!.getAttribute("cy"));
    expect(Number(svg().querySelector("[data-part='latest']")!.getAttribute("y"))).toBe(cy + 16);
    cleanup();
    await seed({ history: trio() });
    renderAt("back-squat");
    await screen.findByTestId("e1rm-chart");
    const cy2 = Number(dots()[2]!.querySelector("circle")!.getAttribute("cy"));
    expect(Number(svg().querySelector("[data-part='latest']")!.getAttribute("y"))).toBe(cy2 - 10);
  });
});

describe("y axis algorithm", () => {
  it("matches the screen spec", () => {
    expect(yAxis([100])).toEqual({ lo: 95, hi: 105, ticks: [95, 105] });
    expect(yAxis([103.3, 103.3])).toEqual({ lo: 95, hi: 110, ticks: [95, 110] });
    expect(yAxis([118.25, 123.75])).toEqual({ lo: 115, hi: 125, ticks: [115, 125] });
    // 100..131: lo 95 hi 135 -> 40, 8 steps even -> 3 lines
    expect(yAxis([100, 131])).toEqual({ lo: 95, hi: 135, ticks: [95, 115, 135] });
    // 101..127: lo 100 hi 130 -> 30, 6 steps even
    expect(yAxis([101, 127])).toEqual({ lo: 100, hi: 130, ticks: [100, 115, 130] });
    // 101..122: lo 100 hi 125 -> 25 > 20 and 5 steps odd -> hi 130
    expect(yAxis([101, 122])).toEqual({ lo: 100, hi: 130, ticks: [100, 115, 130] });
  });
});

describe("y axis gridline boundary", () => {
  it("a range of exactly 20 kg has 2 gridlines, 25 kg rounds up to 30 and has 3", () => {
    expect(yAxis([101, 119])).toEqual({ lo: 100, hi: 120, ticks: [100, 120] });
    expect(yAxis([101, 124])).toEqual({ lo: 100, hi: 130, ticks: [100, 115, 130] });
  });
});

describe("AC14 no engine drift", () => {
  it("series values are exactly the engine's, and the web has no second formula", () => {
    const h = trio();
    const lib = LIBRARY;
    const engineVals = estimatedOneRepMax(h, lib, "back-squat").map((p) => p.e1rm);
    expect(e1rmSeries("back-squat", h, lib, NOW, TZ).map((p) => p.e1rm)).toEqual(engineVals);
    const src = ["stats.ts", "E1rmChart.tsx", "ExerciseHistory.tsx"]
      .map((f) => readFileSync(resolve(__dirname, "..", f), "utf8"))
      .join("\n");
    expect(src).not.toMatch(/\/\s*30\b|\+\s*30\b|\(30\s*\+/);
  });
});
