// T-0307a UF-10.1 / UF-10.2 e2e (AC-A16, AC-A17). Runs against `vite preview` with Supabase
// mocked through `page.route`. Sets are dated relative to the real clock so they sit inside
// the rolling 14-day window whenever the spec runs.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
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

const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-01-01T00:00:00.000Z",
  plan_changed_at: "2026-01-01T00:00:00.000Z",
};

const AREA_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: "2026-01-01T00:00:00.000Z",
}));

/** `n` hard sets on an exercise `daysAgo` days back, at midday UTC (same local day anywhere). */
function sets(exerciseId: string, n: number, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  at.setUTCHours(12, 0, 0, 0);
  const completedAt = at.toISOString();
  return Array.from({ length: n }, (_, i) => ({
    client_id: `${exerciseId}-${daysAgo}-${i}`,
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

type Fixture = "zero" | "mixed";

async function mockData(page: Page, fixture: Fixture): Promise<void> {
  await mockSupabaseData(page, {
    sets: fixture === "mixed" ? [...sets("rdl", 6, 3), ...sets("squat", 4, 2)] : [],
    exercises: [exercise("rdl"), exercise("squat")],
    exerciseAreas: [
      { exercise_id: "rdl", area_id: "hamstrings", weight: 1 },
      { exercise_id: "rdl", area_id: "glutes", weight: 0.5 },
      { exercise_id: "squat", area_id: "quads", weight: 1 },
      { exercise_id: "squat", area_id: "glutes", weight: 1 },
    ],
    areaTargets: AREA_TARGETS,
    profile: PROFILE,
  });
}

async function openBalance(page: Page, fixture: Fixture, path = "/balance"): Promise<void> {
  await mockData(page, fixture);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

// T-0427 AC1: this spec runs under both auto guards (D-0086 Supabase guard, T-0425 console
// guard). Before T-0427 it imported `test` from `@playwright/test`, so neither fixture existed
// here and an unmocked request or a React error on UF-10.1 went green.
test("T-0427 AC1 /balance runs under the Supabase and console guards", async ({
  page,
  supabaseGuard,
  consoleGuard,
}) => {
  await openBalance(page, "mixed");
  await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
  // T-0436: AutoSync's reads can still be in flight when the screen first shows; the backstop
  // check runs at teardown, so let the network settle or a late hit would go unseen.
  await page.waitForLoadState("networkidle");
  expect(supabaseGuard.unclaimed()).toEqual([]);
  expect(consoleGuard.errors()).toEqual([]);
});

// T-0353 AC-1: reaches the C-01 buttons with real Tab presses, not `locator.focus()`. Neither
// path below calls `.focus()` on the hamstrings or calves button — grepped by hand for the
// build log, since a reviewer can't easily grep a running test.
async function tabTo(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  label: string,
): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`T-0353 AC-1: Tab never reached ${label} within 40 presses`);
}

test.describe("AC-A16 real keyboard navigates exactly once", () => {
  test("T-0353 AC-1 Tab reaches the hamstrings button then the calves button; Enter and Space each navigate exactly once", async ({
    page,
  }) => {
    await openBalance(page, "mixed");
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

    const hamstrings = page.locator('[data-variant="full"] button[data-area="hamstrings"]');
    // The map buttons are disabled while the cache read is in flight ("Hamstrings, loading");
    // Tab skips a disabled button entirely, which made this spec flaky on a cold start.
    await expect(hamstrings).toBeEnabled();
    await page.locator("body").focus();
    await tabTo(page, hamstrings, "the hamstrings button");
    await expect(hamstrings).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/balance\/hamstrings$/);
    // Contrast: the navigation happened at all (a no-op handler would leave `/balance`).
    expect(new URL(page.url()).pathname).not.toBe("/balance");
    await expect(page.locator('[data-screen-id="UF-10.2"]')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/balance$/);
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

    const calves = page.locator('[data-variant="full"] button[data-area="calves"]');
    await expect(calves).toBeEnabled();
    await page.locator("body").focus();
    await tabTo(page, calves, "the calves button");
    await expect(calves).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/balance\/calves$/);
    // The keyup must not navigate a second time.
    await page.waitForTimeout(150);
    await expect(page).toHaveURL(/\/balance\/calves$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/balance$/);
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();
  });
});

test.describe("AC-A14 row touch target is at least 44 x 44 in a real layout", () => {
  for (const fixture of ["zero", "mixed"] as const) {
    test(`T-0353 AC-2 ${fixture} fixture: the first row is at least 44 x 44`, async ({ page }) => {
      await openBalance(page, fixture);
      await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

      const firstRow = page.locator('[data-part="row"]').first();
      await expect(firstRow).toBeVisible();
      const box = await firstRow.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      if (fixture === "mixed") {
        const attentionRow = page.locator('[data-part="row"][data-attention="true"]').first();
        await expect(attentionRow).toBeVisible();
        const attentionBox = await attentionRow.boundingBox();
        expect(attentionBox).not.toBeNull();
        expect(attentionBox!.width).toBeGreaterThanOrEqual(44);
        expect(attentionBox!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe("keyboard focus on an attention row (WCAG 2.4.7)", () => {
  test("focusing a needs-attention row repaints its outline accent, not warn", async ({ page }) => {
    await openBalance(page, "mixed");
    const row = page.locator('[data-part="row"][data-attention="true"]').first();
    await expect(row).toBeVisible();
    const colours = (): Promise<{ outline: string; accent: string; warn: string }> =>
      row.evaluate((el) => {
        const resolve = (token: string): string => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        };
        return {
          outline: getComputedStyle(el).outlineColor,
          accent: resolve("--wl-color-accent"),
          warn: resolve("--wl-color-warn"),
        };
      });
    const before = await colours();
    expect(before.outline).toBe(before.warn);
    await page.keyboard.press("Shift"); // a keyboard interaction, so :focus-visible applies
    await row.focus();
    const after = await colours();
    expect(after.outline).toBe(after.accent);
    expect(after.accent).not.toBe(after.warn);
  });
});

test.describe("AC-A17 axe (NFR-A11Y-1)", () => {
  const cases: Array<[string, Fixture, string]> = [
    ["/balance, zero history", "zero", "/balance"],
    ["/balance, mixed history", "mixed", "/balance"],
    ["/balance/hamstrings", "mixed", "/balance/hamstrings"],
  ];
  for (const [name, fixture, path] of cases) {
    test(`${name} has 0 serious/critical violations`, async ({ page }) => {
      await openBalance(page, fixture, path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }
});

// T-0427: console errors and page errors are checked by the `consoleGuard` auto fixture at
// teardown (T-0425), so these tests only keep the render-loop check.
test.describe("QA: console errors and render-loop guard on the real route", () => {
  for (const path of ["/balance", "/balance/hamstrings"]) {
    test(`${path} logs no console error / page error and does not loop`, async ({ page }) => {
      let targetReads = 0;
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/area_targets")) targetReads += 1;
      });
      await openBalance(page, "mixed", path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      await page.waitForTimeout(1500);
      // one refresh per mount; a per-render `new Date()` loop would issue dozens.
      expect(targetReads).toBeLessThanOrEqual(2);
    });
  }
});
