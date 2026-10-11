// T-0660 (D-0225, UF-10.1 / UF-04.2 / UF-02.1): body figure v2 computed styles, sizes, forced
// colours and unmigrated (no-state) legibility, on the real pages with Supabase mocked. States are
// put on <html> after load, as the other figure specs do (the screens adopt their own state in
// T-0601 / T-0608 / T-0611).
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
import {
  exerciseAreas as libAreas,
  exerciseVariants,
  exercises as libExercises,
  profile as libProfile,
} from "./fixtures/uf-04-library-data.js";

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

/** Targets are 10: calves 12 (step 4), hamstrings 8 (3), quads 5 (2), the rest 0. */
async function openBalance(page: Page, path = "/balance"): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [...sets("calf-raise", 12, 2), ...sets("rdl", 8, 3), ...sets("squat", 5, 3)],
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
  if (path === "/balance") {
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
    await expect(fullMap(page).locator('button[data-area="calves"]')).toBeEnabled();
  }
}

async function openLibrary(page: Page): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises: libExercises,
    exerciseAreas: libAreas,
    exerciseVariants,
    areaTargets: [],
    profile: libProfile,
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto("/library/back-squat");
  await expect(page.getByText("Sit down between your heels")).toBeVisible();
  await expect(page.locator("svg.wl-fig").first()).toBeVisible();
}

const fullMap = (page: Page) => page.locator('[data-component="C-01"][data-variant="full"]');

/**
 * T-0611: /balance is a plan screen now, so its root's own data-wl-state would override the
 * page-level state these tests set. The real figure markup is copied into a fixture host outside
 * any screen root (like cobalt-state.spec.ts injects its roots) and the screen is removed, so the
 * state the test sets on <html> (or none) is the one that applies. Never another real screen: it
 * would break the same way once that screen migrates.
 */
const detachMap = (page: Page) =>
  page.evaluate(() => {
    const map = document.querySelector('[data-component="C-01"][data-variant="full"]')!;
    const host = document.createElement("div");
    host.id = "no-state-host";
    host.innerHTML = map.outerHTML;
    document.querySelectorAll("[data-screen-id]").forEach((e) => e.remove());
    document.body.append(host);
  });

/**
 * T-0608: UF-04.2 is a plan screen now. The real detail figure is copied into a fixture host
 * outside any screen root and the screen is removed, so no state applies. Never another real screen.
 */
const detachFigure = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector("svg.wl-fig")!;
    const host = document.createElement("div");
    host.id = "no-state-host";
    host.innerHTML = svg.outerHTML;
    document.querySelectorAll("[data-screen-id]").forEach((e) => e.remove());
    document.body.append(host);
  });

const setState = (page: Page, state: string | null) =>
  page.evaluate((st) => {
    if (st === null) document.documentElement.removeAttribute("data-wl-state");
    else document.documentElement.setAttribute("data-wl-state", st);
    document.body.style.background = st === null ? "" : "var(--wl-bg)";
  }, state);

/** Resolves any CSS colour expression to the browser's computed colour string. */
const resolved = (page: Page, value: string) =>
  page.evaluate((v) => {
    const d = document.createElement("div");
    d.style.color = v;
    document.body.append(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  }, value);

const css = (loc: Locator, prop: string) =>
  loc.first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const ink = (page: Page, token: string, pct: number) =>
  resolved(page, `color-mix(in srgb, var(${token}) ${pct}%, transparent)`);

test.describe("T-0660 AC2 plan", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("silhouette 16 %, zones 32 %, seams plan.bg 2.4, step 4 white, attention plus ring", async ({
    page,
  }) => {
    await openBalance(page);
    await setState(page, "plan");
    const svg = fullMap(page).locator("svg");
    expect(await css(svg.locator(".wl-fig__body"), "fill")).toBe(
      await ink(page, "--wl-color-plan-ink", 16),
    );
    const zone = svg.locator(".wl-fig__region--step-3:not(.wl-fig__region--attention)");
    expect(await css(zone, "fill")).toBe(await ink(page, "--wl-color-plan-ink", 32));
    expect(await css(zone, "stroke")).toBe(await resolved(page, "var(--wl-color-plan-bg)"));
    expect(await css(zone, "stroke-width")).toBe("2.4px");
    expect(await css(svg.locator(".wl-fig__region--step-4"), "fill")).toBe("rgb(255, 255, 255)");
    // step 3 keeps the zone tint (hamstrings 8 of 10); so does step 0 without attention flags
    const att = svg.locator(".wl-fig__region--attention");
    expect(await att.count()).toBeGreaterThan(0);
    expect(await css(att, "fill")).toBe(await resolved(page, "var(--wl-color-plan-attention)"));
    expect(await css(svg.locator(".wl-fig__halo-warn"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-plan-attention)"),
    );
    expect(await css(svg.locator(".wl-fig__halo-warn"), "stroke-width")).toBe("7px");
    expect(await css(svg.locator(".wl-fig__halo-gap"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-plan-bg)"),
    );
  });

  test("compact: seam stroke is 4", async ({ page }) => {
    await openBalance(page, "/");
    await setState(page, "plan");
    const compact = page.locator('[data-component="C-01"][data-variant="compact"] svg');
    await expect(compact).toBeVisible();
    // the compact map re-renders when the cache read lands, so let the assertion retry
    await expect(compact.locator(".wl-fig__region").first()).toHaveCSS("stroke-width", "4px");
  });

  test("AC4 highlight: has-highlight, quads white with a ring, the rest dimmed to 12 / 20 %", async ({
    page,
  }) => {
    await openBalance(page);
    await setState(page, "plan");
    await fullMap(page).locator('button[data-area="quads"]').focus();
    const svg = fullMap(page).locator("svg");
    await expect(svg).toHaveClass(/wl-fig--has-highlight/);
    expect(await css(svg.locator('[data-area="quads"]'), "fill")).toBe("rgb(255, 255, 255)");
    expect(await svg.locator(".wl-fig__ring").count()).toBe(2);
    expect(await css(svg.locator(".wl-fig__body"), "fill")).toBe(
      await ink(page, "--wl-color-plan-ink", 12),
    );
    expect(await css(svg.locator('[data-area="chest"]'), "fill")).toBe(
      await ink(page, "--wl-color-plan-ink", 20),
    );
    expect(await css(svg.locator(".wl-fig__ring"), "stroke")).toBe("rgb(255, 255, 255)");
  });
});

test.describe("T-0660 AC3 session states", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const state of ["lift", "rest"] as const) {
    test(`${state}: seams follow --wl-bg and attention is not drawn`, async ({ page }) => {
      await openBalance(page);
      await detachMap(page);
      await setState(page, state);
      const svg = fullMap(page).locator("svg");
      const bg = await resolved(page, `var(--wl-color-${state}-bg)`);
      expect(await css(svg.locator(".wl-fig__region--step-0").first(), "stroke")).toBe(bg);
      expect(await css(svg.locator(".wl-fig__region--step-4").first(), "fill")).toBe(
        await resolved(page, `var(--wl-color-${state}-ink)`),
      );
      // the fixture flags attention areas; their halo is not painted and the fill is not salmon
      expect(await svg.locator(".wl-fig__halo-warn").count()).toBeGreaterThan(0);
      expect(await css(svg.locator(".wl-fig__halo-warn"), "display")).toBe("none");
      expect(await css(svg.locator(".wl-fig__halo-gap"), "display")).toBe("none");
      expect(await css(svg.locator(".wl-fig__region--attention"), "fill")).not.toBe(
        await resolved(page, "var(--wl-color-plan-attention)"),
      );
    });
  }
});

test.describe("T-0660 AC2 / AC5 detail, secondary hatch and sizes", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("UF-04.2: the secondary region uses the 45 degree ink hatch; detail is 13.5 rem wide", async ({
    page,
  }) => {
    await openLibrary(page);
    await setState(page, "plan");
    const svg = page.locator("svg.wl-fig").first();
    expect(await css(svg.locator(".wl-fig__region--secondary"), "fill")).toMatch(/^url\(/);
    expect(await css(svg.locator(".wl-fig__hatch-line"), "fill")).toBe(
      await resolved(page, "var(--wl-color-plan-ink)"),
    );
    expect(await css(svg.locator(".wl-fig__hatch-bg"), "fill")).toBe(
      await ink(page, "--wl-color-plan-ink", 16),
    );
    const pattern = svg.locator("pattern");
    await expect(pattern).toHaveAttribute("patternTransform", "rotate(45)");
    const box = (await svg.boundingBox())!;
    expect(box.width).toBeCloseTo(216, 0);
    expect(box.height).toBeGreaterThan(215);
    expect(box.height).toBeLessThan(225);
  });

  test("full is 18.5 rem wide (about 300 px tall), compact 3.75 rem (about 60 px)", async ({
    page,
  }) => {
    await openBalance(page);
    const full = (await fullMap(page).locator("svg").boundingBox())!;
    expect(full.width).toBeCloseTo(296, 0);
    expect(full.height).toBeGreaterThan(295);
    expect(full.height).toBeLessThan(305);
    await page.goto("/");
    const compact = page.locator('[data-component="C-01"][data-variant="compact"] svg');
    await expect(compact).toBeVisible();
    const c = (await compact.boundingBox())!;
    expect(c.width).toBeCloseTo(60, 0);
    expect(c.height).toBeGreaterThan(58);
    expect(c.height).toBeLessThan(63);
  });
});

test.describe("T-0660 AC6 accessibility", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the svg stays aria-hidden and axe has no serious violation", async ({ page }) => {
    await openBalance(page);
    await setState(page, "plan");
    await expect(fullMap(page).locator("svg")).toHaveAttribute("aria-hidden", "true");
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });

  test.describe("forced colours", () => {
    test.use({ forcedColors: "active" });
    test("the figure stays visible and forced colours win", async ({ page }) => {
      await openBalance(page);
      await setState(page, "plan");
      const svg = fullMap(page).locator("svg");
      const sys = (v: string) =>
        page.evaluate((c) => {
          const d = document.createElement("div");
          d.style.color = c;
          document.body.append(d);
          const r = getComputedStyle(d).color;
          d.remove();
          return r;
        }, v);
      expect(await css(svg.locator(".wl-fig__region--step-4"), "fill")).toBe(
        await sys("CanvasText"),
      );
      expect(await css(svg.locator(".wl-fig__region--step-0"), "fill")).toBe(await sys("Canvas"));
      expect(await css(svg.locator(".wl-fig__region--step-0"), "stroke")).toBe(
        await sys("CanvasText"),
      );
      expect(await css(svg.locator(".wl-fig__body"), "stroke")).toBe(await sys("CanvasText"));
      expect(await css(svg.locator(".wl-fig__halo-warn"), "stroke")).toBe(await sys("Highlight"));
      await fullMap(page).locator('button[data-area="quads"]').focus();
      expect(await css(svg.locator('[data-area="quads"]'), "fill")).toBe(await sys("CanvasText"));
      expect(await css(svg.locator('[data-area="chest"]'), "fill")).toBe(await sys("Canvas"));
    });
  });
});

test.describe("T-0660 AC7 unmigrated screens stay legible", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("UF-10.1 with no state: ink and seams come from the Chalk and Iron :root", async ({
    page,
  }, testInfo) => {
    await openBalance(page);
    await detachMap(page);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-wl-state"))).toBe(
      false,
    );
    const svg = fullMap(page).locator("svg");
    const pageBg = await css(page.locator("body"), "background-color");
    const seam = await css(svg.locator(".wl-fig__region--step-0"), "stroke");
    expect(seam).toBe(await resolved(page, "var(--wl-color-bg)"));
    expect(pageBg).toBe(await resolved(page, "var(--wl-color-bg)"));
    await fullMap(page).screenshot({ path: testInfo.outputPath("uf-10-1-unmigrated.png") });
    await page.screenshot({ path: testInfo.outputPath("uf-10-1-unmigrated-page.png") });
  });

  test("a detached detail figure with no state reads the Chalk and Iron :root", async ({
    page,
  }, testInfo) => {
    await openLibrary(page);
    await detachFigure(page);
    const svg = page.locator("#no-state-host svg.wl-fig");
    expect(await css(svg.locator(".wl-fig__region--primary"), "fill")).toBe(
      await resolved(page, "var(--wl-color-text)"),
    );
    expect(await css(svg.locator(".wl-fig__region--primary"), "stroke")).toBe(
      await resolved(page, "var(--wl-color-bg)"),
    );
    await page.screenshot({ path: testInfo.outputPath("uf-04-2-unmigrated.png") });
  });
});

// AC9: the real components at 390 x 844 in every state, written to the test output for the owner's
// by-eye check next to the matching frames of "Body Figure Export.dc.html".
test.describe("T-0660 AC9 screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const shot = (loc: Locator, testInfo: { outputPath: (n: string) => string }, name: string) =>
    loc.screenshot({ path: testInfo.outputPath(`${name}.png`) });

  test("plan full with attention and highlight, lift, rest, compact, detail", async ({
    page,
  }, testInfo) => {
    await openBalance(page);
    await setState(page, "plan");
    const map = fullMap(page);
    await shot(map, testInfo, "plan-full-attention");
    await map.locator('button[data-area="quads"]').focus();
    await shot(map, testInfo, "plan-full-highlight-quads");
    await map.locator('button[data-area="quads"]').blur();
    for (const state of ["lift", "rest"] as const) {
      await setState(page, state);
      await shot(map, testInfo, `${state}-full`);
    }
  });

  test("plan compact", async ({ page }, testInfo) => {
    await openBalance(page, "/");
    await setState(page, "plan");
    const compact = page.locator('[data-component="C-01"][data-variant="compact"]');
    await expect(compact).toBeVisible();
    await expect(compact).not.toHaveClass(/wl-body-map--pulse/);
    await shot(compact, testInfo, "plan-compact");
  });

  test("plan detail with primary and secondary", async ({ page }, testInfo) => {
    await openLibrary(page);
    await setState(page, "plan");
    await shot(page.locator("svg.wl-fig").first(), testInfo, "plan-detail-primary-secondary");
  });
});

// The C-01 legend must match the figure (D-0225 §3): "Under target" is the zone tint every step 0-3
// region wears, "On target" is the step-4 fill. Compared as computed fills, in every state.
test.describe("T-0660 legend swatches match the figure", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const state of [null, "plan", "lift", "rest"] as const) {
    test(`state ${state ?? "none (unmigrated)"}: 2 coverage swatches plus attention, fills equal the regions`, async ({
      page,
    }) => {
      await openBalance(page);
      await setState(page, state);
      const map = fullMap(page);
      const swatches = map.locator('[data-part="swatch"]');
      await expect(map.locator('[data-part="legend-label"]')).toHaveText([
        "Under target",
        "On target",
        "Needs attention",
      ]);
      const under = await css(swatches.nth(0), "background-color");
      const on = await css(swatches.nth(1), "background-color");
      const step2 = await css(
        map.locator("svg .wl-fig__region--step-2:not(.wl-fig__region--attention)"),
        "fill",
      );
      const step4 = await css(map.locator("svg .wl-fig__region--step-4"), "fill");
      expect(under).toBe(step2);
      expect(on).toBe(step4);
      expect(under).not.toBe(on);
      // The per-area dots wear the same fill as that area's region (quads step 2, calves step 4).
      const dot = (area: string) =>
        css(map.locator(`button[data-area="${area}"] .wl-body-map__fill`), "background-color");
      expect(await dot("quads")).toBe(step2);
      expect(await dot("calves")).toBe(step4);
      if (state === "lift" || state === "rest") return; // attention is not drawn on session screens
      // One attention variable: the ring swatch, the flagged dot and the figure fill agree.
      const att = await css(map.locator("svg .wl-fig__region--attention"), "fill");
      expect(await dot("core")).toBe(att);
      expect(await css(swatches.nth(2), "outline-color")).toBe(att);
      expect(await css(map.locator("svg .wl-fig__halo-warn"), "stroke")).toBe(att);
    });
  }
});
