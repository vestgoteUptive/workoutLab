// T-0557 C-01 silhouette layout e2e (UF-02.1 compact on "/", UF-10.1 full on "/balance").
// Spec docs/specs/body-map-silhouette.md AC-7, AC-10, AC-11, AC-13. Runs against `vite preview`
// with Supabase mocked through `page.route`; `test`/`expect` come from the guard fixture.
// Sets are dated relative to `Date.now()` so they stay inside the rolling 14-day window.
// Screenshots go to `testInfo.outputPath` (not committed).
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_PROFILE_ROW,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

const DAY_MS = 86_400_000;

function exercise(id: string) {
  return {
    id,
    name: id,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    timed: false,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
}

function sets(exerciseId: string, n: number, daysAgo: number) {
  const completedAt = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  return Array.from({ length: n }, (_, i) => ({
    client_id: `${exerciseId}-${i}`,
    session_id: "S1",
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: completedAt,
    edited_at: completedAt,
    deleted_at: null,
    reps: 8,
    weight_kg: 60,
    duration_s: null,
  }));
}

type Fixture = "zero" | "data" | "ramp";

/** Signs in with Supabase mocked, then opens `path`. `data` has calves, quads and hamstrings. */
async function open(page: Page, fixture: Fixture, path: string): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets:
      fixture === "data"
        ? [...sets("calf-raise", 6, 2), ...sets("squat", 4, 3), ...sets("rdl", 3, 3)]
        : fixture === "ramp"
          ? // targets are 10: calves 12 (step 4), hamstrings 8 (3), quads 5 (2), arms none (0)
            [...sets("calf-raise", 12, 2), ...sets("rdl", 8, 3), ...sets("squat", 5, 3)]
          : [],
    exercises: [exercise("calf-raise"), exercise("squat"), exercise("rdl")],
    exerciseAreas: [
      { exercise_id: "calf-raise", area_id: "calves", weight: 1 },
      { exercise_id: "squat", area_id: "quads", weight: 1 },
      { exercise_id: "rdl", area_id: "hamstrings", weight: 1 },
    ],
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 10,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: [FAKE_PROFILE_ROW],
  });
  await mockProfilePresent(page);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

const fullMap = (page: Page) => page.locator('[data-component="C-01"][data-variant="full"]');

async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
  // The label buttons are disabled while the cache read is in flight.
  await expect(fullMap(page).locator('button[data-area="calves"]')).toBeEnabled();
}

/** Page-coordinate centre of a locator, checked to be where that element actually is hit. */
async function centreOf(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const hit = await target.evaluate(
    (el, p) => {
      const top = document.elementFromPoint(p.x, p.y);
      return top === el || el.contains(top);
    },
    { x, y },
  );
  expect(hit, "the element is the hit target at its own centre").toBe(true);
  return { x, y };
}

test.describe("AC-3 (spec AC-7) real taps navigate once", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const via of ["a calves region", "the Calves label"] as const) {
    test(`tapping ${via} goes to /balance/calves in one history entry`, async ({ page }) => {
      await open(page, "data", "/balance");
      await ready(page);
      const target =
        via === "a calves region"
          ? fullMap(page).locator('svg path.wl-fig__region[data-area="calves"]').first()
          : fullMap(page).locator('button[data-area="calves"]');
      const { x, y } = await centreOf(target);
      const before = await page.evaluate(() => history.length);
      await page.touchscreen.tap(x, y);
      await expect(page).toHaveURL(/\/balance\/calves$/);
      await expect(page.locator('[data-screen-id="UF-10.2"]')).toBeVisible();
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => history.length)).toBe(before + 1);
      await page.goBack();
      await expect(page).toHaveURL(/\/balance$/);
    });
  }

  test("a mouse click on a calves region navigates too", async ({ page }) => {
    await open(page, "data", "/balance");
    await ready(page);
    const { x, y } = await centreOf(
      fullMap(page).locator('svg path.wl-fig__region[data-area="calves"]').last(),
    );
    await page.mouse.click(x, y);
    await expect(page).toHaveURL(/\/balance\/calves$/);
  });
});

test.describe("AC-6 (spec AC-10) axe", () => {
  const cases: Array<[string, Fixture, string]> = [
    ["/ zero history", "zero", "/"],
    ["/ with data", "data", "/"],
    ["/balance zero history", "zero", "/balance"],
    ["/balance with data", "data", "/balance"],
  ];
  for (const [name, fixture, path] of cases) {
    test(`${name}: 0 serious or critical violations`, async ({ page }) => {
      await open(page, fixture, path);
      if (path === "/balance") await ready(page);
      else
        await expect(page.locator('[data-component="C-01"][data-variant="compact"]')).toBeVisible();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(bad).toEqual([]);
    });
  }
});

test.describe("AC-7 (spec AC-11) layout at 320 / 390 px and 200 % text", () => {
  const cases = [
    { name: "320", width: 320, zoom: false, columns: 2 },
    { name: "390", width: 390, zoom: false, columns: 3 },
    { name: "390-zoom200", width: 390, zoom: true, columns: 2 },
    { name: "320-zoom200", width: 320, zoom: true, columns: 2 },
  ];
  for (const c of cases) {
    test(`/balance at ${c.name}: ${c.columns}-column grid, nothing clipped or overlapping`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: c.width, height: 900 });
      await open(page, "data", "/balance");
      await ready(page);
      if (c.zoom) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const map = fullMap(page);
      await expect(map.locator("svg")).toBeVisible();

      const m = await map.evaluate((root) => {
        const grid = root.querySelector<HTMLElement>(".wl-body-map__grid")!;
        const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
        const labels = Array.from(root.querySelectorAll<HTMLElement>('[data-part="label"]'));
        const clipped = labels.flatMap((l) =>
          [l, ...Array.from(l.querySelectorAll<HTMLElement>("span"))]
            .filter((e) => e.scrollWidth > e.clientWidth)
            .map((e) => `${l.dataset.area}:${e.className}`),
        );
        const rects = labels.map((l) => {
          const r = l.getBoundingClientRect();
          return { area: l.dataset.area, l: r.left, t: r.top, r: r.right, b: r.bottom };
        });
        const overlaps: string[] = [];
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i]!;
            const b = rects[j]!;
            if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) {
              overlaps.push(`${a.area}/${b.area}`);
            }
          }
        }
        const svg = root.querySelector("svg")!.getBoundingClientRect();
        return {
          cols,
          clipped,
          overlaps,
          figureLeft: svg.left,
          figureRight: svg.right,
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          labelCount: labels.length,
        };
      });
      expect(m.labelCount).toBe(9);
      expect(m.cols).toBe(c.columns);
      expect(m.clipped).toEqual([]);
      expect(m.overlaps).toEqual([]);
      expect(m.figureLeft).toBeGreaterThanOrEqual(0);
      expect(m.figureRight).toBeLessThanOrEqual(m.innerWidth);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);

      if (!c.zoom) {
        await page.screenshot({
          path: testInfo.outputPath(`balance-${c.name}.png`),
          fullPage: true,
        });
      }
    });
  }
});

test.describe("AC-8 (spec AC-13) forced colours", () => {
  test.use({ forcedColors: "active", viewport: { width: 390, height: 844 } });

  test("/balance: region stroke is CanvasText, and the numbers are still in the DOM", async ({
    page,
  }) => {
    await open(page, "data", "/balance");
    await ready(page);
    const region = fullMap(page).locator('svg path.wl-fig__region[data-area="calves"]').first();
    const stroke = await region.evaluate((el) => getComputedStyle(el).stroke);
    const canvasText = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.color = "CanvasText";
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    });
    expect(stroke).not.toBe("none");
    expect(stroke).not.toBe("transparent");
    expect(stroke).not.toBe("rgba(0, 0, 0, 0)");
    expect(stroke).toBe(canvasText);
    const value = fullMap(page).locator('button[data-area="calves"] [data-part="value"]');
    await expect(value).toBeVisible();
    await expect(value).toHaveText(/^\d+(\.\d)? \/ \d+(\.\d)?$/);
  });
});

// T-0615: Cobalt figure colours. A [data-wl-state] scope is put on <html> after load (the screens
// get their own state in T-0601/T-0608/T-0611); no state is the legacy look (D-0210 §2).
type RGB = string;

/** Resolves any CSS colour expression to the browser's computed rgb() string. */
async function resolved(page: Page, value: string): Promise<RGB> {
  return page.evaluate((v) => {
    const d = document.createElement("div");
    d.style.color = v;
    document.body.append(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  }, value);
}

const setState = (page: Page, state: string | null) =>
  page.evaluate((st) => {
    if (st === null) document.documentElement.removeAttribute("data-wl-state");
    else document.documentElement.setAttribute("data-wl-state", st);
    document.body.style.background = st === null ? "" : "var(--wl-bg)";
  }, state);

const paint = (loc: Locator, prop: "fill" | "stroke") =>
  loc.first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("T-0615 AC1 plan colours (UF-10.1)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("step 4 is white, step 0 is plan.raise, silhouette and halo use plan tokens", async ({
    page,
  }) => {
    await open(page, "ramp", "/balance");
    await ready(page);
    await setState(page, "plan");
    const svg = fullMap(page).locator("svg");
    expect(await paint(svg.locator(".wl-fig__region--step-4"), "fill")).toBe(
      await resolved(page, "var(--wl-color-plan-coverage-4)"),
    );
    expect(await resolved(page, "var(--wl-color-plan-coverage-4)")).toBe("rgb(255, 255, 255)");
    expect(await paint(svg.locator(".wl-fig__region--step-0"), "fill")).toBe(
      await resolved(page, "var(--wl-color-plan-raise)"),
    );
    const sil = svg.locator(".wl-fig__silhouette");
    expect(await paint(sil, "fill")).toBe(await resolved(page, "var(--wl-color-plan-raise)"));
    expect(await paint(sil, "stroke")).toBe(await resolved(page, "var(--wl-color-plan-ink-muted)"));
    const halo = svg.locator(".wl-fig__halo-warn");
    expect(await halo.count(), "the fixture has at least one attention area").toBeGreaterThan(0);
    expect(await paint(halo, "stroke")).toBe(
      await resolved(page, "var(--wl-color-plan-attention)"),
    );
    expect(await paint(svg.locator(".wl-fig__halo-gap"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-plan-bg)"),
    );
  });
});

test.describe("T-0615 AC2 legacy fallback (no state)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("lime step 4, surface-2 step 0, warn halo, surface gap", async ({ page }) => {
    await open(page, "ramp", "/balance");
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-wl-state"))).toBe(
      false,
    );
    const svg = fullMap(page).locator("svg");
    expect(await paint(svg.locator(".wl-fig__region--step-4"), "fill")).toBe(
      await resolved(page, "var(--wl-color-coverage-4)"),
    );
    expect(await paint(svg.locator(".wl-fig__region--step-0"), "fill")).toBe(
      await resolved(page, "var(--wl-color-surface-2)"),
    );
    expect(await paint(svg.locator(".wl-fig__halo-warn"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-warn)"),
    );
    expect(await paint(svg.locator(".wl-fig__halo-gap"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-surface)"),
    );
    // The legend swatch for step 4 is the legacy lime too (AC-T0614-2).
    const sw = await fullMap(page)
      .locator('[data-part="swatch"]')
      .nth(4)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sw).toBe(await resolved(page, "var(--wl-color-coverage-4)"));
  });
});

test.describe("T-0615 AC6 / AC7 contrast and visual in plan", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [name, path] of [
    ["full", "/balance"],
    ["compact", "/"],
  ] as const) {
    test(`C-01 ${name}: axe colour-contrast has 0 violations; screenshot`, async ({
      page,
    }, testInfo) => {
      await open(page, "ramp", path);
      if (path === "/balance") await ready(page);
      await page.waitForLoadState("networkidle");
      await setState(page, "plan");
      const map = page.locator(`[data-component="C-01"][data-variant="${name}"]`);
      await expect(map).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include(`[data-component="C-01"][data-variant="${name}"]`)
        .withRules(["color-contrast"])
        .analyze();
      expect(results.violations).toEqual([]);
      const value = map.locator('[data-part="value"]').first();
      expect(await value.evaluate((el) => getComputedStyle(el).color)).toBe(
        await resolved(page, "var(--wl-color-plan-ink)"),
      );
      await map.screenshot({ path: testInfo.outputPath(`c01-${name}-plan.png`) });
    });
  }
});
