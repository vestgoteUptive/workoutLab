// T-0996 UF-08.2 Today's plan, by area: the happy path, offline, and the layout checks jsdom can't
// make (AC13: axe with contrast at 390 and 320 px and at 200 % zoom, no sideways scroll, targets of
// at least 44 px, unique names, focus never on body). Same seed as uf-08-setup.spec.ts: the L1+
// library, the profile with FULL equipment, the nine F-targets and no sets. Supabase is mocked
// through `page.route`. Wired into `tests/e2e` by T-1019.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";
import { settledBox } from "./helpers/settled-box.js";

const F_TARGETS: Record<string, number> = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};
const AREA_TARGETS = Object.entries(F_TARGETS).map(([area, sets]) => ({
  area_id: area,
  sets_per_14d: sets,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));
const profileRow = { ...profile, user_id: FAKE_USER_ID };

const screenUF082 = (page: Page) => page.locator('[data-screen-id="UF-08.2"]');
const rows = (page: Page) => page.locator('[data-part="area-row"]');
const status = (page: Page) => page.locator('[data-part="status"]');
const startWorkout = (page: Page) => page.getByRole("button", { name: "Start workout" });
const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

async function seed(page: Page): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
}

/** UF-08.1 → "Suggest my workout" (or "Start empty") → UF-08.2. */
async function toPlan(page: Page, o: { budget?: number; empty?: boolean } = {}): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto(`/session/setup?budget=${o.budget ?? 45}`);
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^(Fits|Nothing)/);
  await page
    .getByRole("button", { name: o.empty === true ? "Start empty" : "Suggest my workout" })
    .click();
  await expect(screenUF082(page)).toBeVisible();
}

const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);
const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
}

async function expectBox(target: Locator, minW: number, minH: number): Promise<void> {
  const box = await settledBox(target);
  expect(box, "has a box").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minW - 0.5);
  expect(box!.height).toBeGreaterThanOrEqual(minH - 0.5);
}

test.describe("T-0996 happy path (UF-08.2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
  });

  test("Suggest, one set less, Remove, Add it back, a chip, Start workout", async ({ page }) => {
    await toPlan(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Today: \S+( · \S+)+$/);
    await expect(page.locator('[data-part="done-by"]')).toHaveText(/^Done by \d{1,2}:\d\d/);
    const first = rows(page).first();
    const area = (await first.getAttribute("data-area"))!;
    const name = area[0]!.toUpperCase() + area.slice(1);
    const before = await rows(page).count();

    // − until the control reads Remove, then Remove: the row goes and focus is not lost.
    const minus = first.getByRole("button", {
      name: new RegExp(`^(One set less for|Remove) ${name}$`),
    });
    while ((await minus.getAttribute("aria-label")) !== `Remove ${name}`) await minus.click();
    await minus.click();
    await expect(rows(page)).toHaveCount(before - 1);
    await expect(status(page)).toHaveText(`${name} removed. Add it back below.`);
    expect(await activeIsBody(page)).toBe(false);
    await expect(page.locator('[data-part="skipping"]')).toContainText(name);

    // Add an area: the same area comes back as it was removed (D-0290).
    await page.getByText("Add an area").click();
    await page.getByRole("button", { name: `Add ${name}` }).click();
    await expect(rows(page)).toHaveCount(before);
    await expect(status(page)).toHaveText(`${name} added back.`);
    await expect(
      page
        .locator(`[data-area="${area}"]`)
        .getByRole("button", { name: `One set more for ${name}` }),
    ).toBeFocused();

    // A time chip rebuilds and says so.
    await page.getByRole("button", { name: "30 minutes" }).click();
    await expect(status(page)).toHaveText(
      "Plan rebuilt for 30 min. Your set changes were cleared.",
    );

    await startWorkout(page).click();
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  });

  test("T-1009 Start workout is one tap from the default plan; Focus mode is collapsed and its switch is kept", async ({
    page,
  }) => {
    await toPlan(page);
    const details = page.locator('[data-part="focus-mode"]');
    await expect(details).toHaveJSProperty("open", false);
    await expectBox(page.locator('[data-part="focus-mode-summary"]'), 44, 48);
    await page.locator('[data-part="focus-mode-summary"]').click();
    await expect(details).toHaveJSProperty("open", true);
    await page.getByRole("checkbox", { name: "Sound cues" }).uncheck();
    expect(await page.evaluate(() => localStorage.getItem("wl-focus-prefs"))).toBe(
      '{"version":1,"sound":false,"voice":true,"keepAwake":true}',
    );
    await startWorkout(page).click();
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  });

  test("Start empty: pick areas with Add, Fill the rest for me, then Start workout", async ({
    page,
  }) => {
    await toPlan(page, { empty: true });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today: pick your areas");
    await expect(rows(page)).toHaveCount(0);
    await expect(startWorkout(page)).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Fill the rest for me" }).click();
    expect(await rows(page).count()).toBeGreaterThan(1);
    await expect(page.getByRole("button", { name: "Fill the rest for me" })).toHaveCount(0);
    await expect(startWorkout(page)).toBeFocused();
    await expect(startWorkout(page)).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("T-0996 offline (AC11)", () => {
  test("the plan edits and Start work with the network off", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/session/setup");
    await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits/);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await goOffline(page, context);
    await page.goto("/session/setup");
    await expect(page.getByLabel("Offline")).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(screenUF082(page)).toBeVisible();
    await expect(page.getByLabel("Offline")).toBeVisible();
    const first = rows(page).first();
    const sets = await first.locator('[data-part="sets-value"]').textContent();
    await first.locator('[data-part="minus"]').click();
    await expect(first.locator('[data-part="sets-value"]')).not.toHaveText(sets!);
    await startWorkout(page).click();
    await expect(page).toHaveURL(SESSION_URL);
  });
});

for (const width of [390, 320, 160]) {
  test.describe(`T-0996 AC13 layout at ${width} px${width === 160 ? " (200 % zoom)" : ""}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seed(page);
    });

    test("axe finds nothing serious, nothing scrolls sideways, targets are 44 px, names are unique", async ({
      page,
    }) => {
      await toPlan(page, { budget: 60 });
      await expectNoSeriousViolations(page);
      expect(await noSideways(page)).toBe(true);

      const first = rows(page).first();
      await expectBox(first.locator('[data-part="area-open"]'), 44, 64);
      await expectBox(first.locator('[data-part="minus"]'), 48, 48);
      await expectBox(first.locator('[data-part="plus"]'), 48, 48);
      for (const chip of await page.locator(".wl-uf08__chip").all()) await expectBox(chip, 44, 44);
      await expectBox(page.locator("summary", { hasText: "Add an area" }), 44, 48);
      await expectBox(startWorkout(page), 44, 54);
      await expectBox(page.getByRole("link", { name: "Back" }), 44, 44);
      await expectBox(page.getByRole("link", { name: "Close" }), 44, 44);

      // Add an area, opened: its Add buttons are 96 x 48.
      await page.locator("summary", { hasText: "Add an area" }).click();
      await expectBox(page.locator('[data-part="candidate-add"]').first(), 96, 48);
      expect(await noSideways(page)).toBe(true);
      await expectNoSeriousViolations(page);

      const names = await page
        .locator("button, a[href], summary")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-label") ?? el.textContent!.trim()),
        );
      expect(new Set(names).size).toBe(names.length);
      await expect(page.locator('[role="status"]')).toHaveCount(1);
    });

    test("Remove fits its row, nothing is clipped, and focus never falls to body after each edit", async ({
      page,
    }) => {
      await toPlan(page, { budget: 60 });
      const first = rows(page).first();
      const minus = first.locator('[data-part="minus"]');
      await minus.click();
      while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
        await minus.click();
      // The control now reads Remove: its whole box is inside the viewport, and the row doesn't scroll.
      const box = await settledBox(minus);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.width).toBeGreaterThanOrEqual(95.5);
      expect(await noSideways(page)).toBe(true);
      await expect(minus).toHaveText("Remove");
      await minus.click();
      expect(await activeIsBody(page)).toBe(false);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await noSideways(page)).toBe(true);
    });
  });
}
