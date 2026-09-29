// T-0307a UF-10.1 / UF-10.2 e2e (AC-A16, AC-A17). Runs against `vite preview` with Supabase
// mocked through `page.route`. Sets are dated relative to the real clock so they sit inside
// the rolling 14-day window whenever the spec runs.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

test.describe("AC-A16 real keyboard navigates exactly once", () => {
  test("Enter on the hamstrings button pushes one entry; Space on calves pushes one entry", async ({
    page,
  }) => {
    await openBalance(page, "mixed");
    await expect(page.locator('[data-screen-id="UF-10.1"]')).toBeVisible();

    const hamstrings = page.locator('[data-variant="full"] button[data-area="hamstrings"]');
    // The map buttons are disabled while the cache read is in flight ("Hamstrings, loading");
    // focus() on a disabled button is a no-op, which made this spec flaky on a cold start.
    await expect(hamstrings).toBeEnabled();
    await hamstrings.focus();
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
    await calves.focus();
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

test.describe("QA: console errors and render-loop guard on the real route", () => {
  for (const path of ["/balance", "/balance/hamstrings"]) {
    test(`${path} logs no console error / page error and does not loop`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
      });
      let targetReads = 0;
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/area_targets")) targetReads += 1;
      });
      await openBalance(page, "mixed", path);
      await expect(page.locator("[data-screen-id^='UF-10']")).toBeVisible();
      await page.waitForTimeout(1500);
      // one refresh per mount; a per-render `new Date()` loop would issue dozens.
      expect(targetReads).toBeLessThanOrEqual(2);
      expect(problems).toEqual([]);
    });
  }
});
