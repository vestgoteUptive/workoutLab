// T-0997 UF-08.6 Area detail: the happy path, offline, and the layout checks jsdom can't make (AC10:
// axe with contrast at 390 and 320 px and at 160 px, no sideways scroll, targets of at least 44 px,
// unique names, focus never on body). Same seed as uf-08-setup.spec.ts: the L1+
// library, the profile with FULL equipment, the nine F-targets and no sets. Supabase is mocked
// through `page.route`. QA wires this file into `tests/e2e` (the imports below are the paths from
// this folder; from `tests/e2e` they are `./fixtures/...`).
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../../../../../../tests/e2e/fixtures/guarded-test.js";
import { goOffline } from "../../../../../../tests/e2e/fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "../../../../../../tests/e2e/fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exercises,
  profile,
} from "../../../../../../tests/e2e/fixtures/uf-04-library-data.js";
import { settledBox } from "../../../../../../tests/e2e/helpers/settled-box.js";

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

const screenUF086 = (page: Page) => page.locator('[data-screen-id="UF-08.6"]');
const detailRows = (page: Page) => page.locator('[data-part="detail-row"]');

/** UF-08.2 → the open button of the first area row → UF-08.6. */
async function openFirstArea(page: Page): Promise<string> {
  const first = rows(page).first();
  const area = (await first.getAttribute("data-area"))!;
  await first.locator('[data-part="area-open"]').click();
  await expect(screenUF086(page)).toBeVisible();
  return area;
}

test.describe("T-0997 happy path (UF-08.6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
  });

  test("open an area, Not today and Undo, Back with focus on its row, Remove the last exercise", async ({
    page,
  }) => {
    await toPlan(page, { budget: 60 });
    const area = await openFirstArea(page);
    const name = area[0]!.toUpperCase() + area.slice(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    expect(await detailRows(page).count()).toBeGreaterThan(0);

    // Not today (when the engine has a candidate) replaces the row and Undo brings it back.
    const row = detailRows(page).first();
    const id = (await row.getAttribute("data-id"))!;
    await row.locator('[data-part="not-today"]').click();
    if (await screenUF086(page).isVisible()) {
      const line = page.locator('[data-part="not-today-line"]');
      if ((await line.count()) > 0) {
        await line.getByRole("button", { name: /^Undo Not today, / }).click();
        await expect(page.locator(`[data-part="detail-row"][data-id="${id}"]`)).toBeVisible();
      }
    }
    expect(await activeIsBody(page)).toBe(false);

    // Back returns to UF-08.2 with focus on the area's open button.
    if (await screenUF086(page).isVisible()) {
      await page.getByRole("link", { name: "Back" }).click();
    }
    await expect(screenUF082(page)).toBeVisible();
    await expect(rows(page).first().locator('[data-part="area-open"]')).toBeFocused();

    // Remove every exercise of the first area: UF-08.2 says so.
    await openFirstArea(page);
    while ((await screenUF086(page).isVisible()) && (await detailRows(page).count()) > 0) {
      await detailRows(page).first().locator('[data-part="remove"]').click();
    }
    await expect(screenUF082(page)).toBeVisible();
    expect(await activeIsBody(page)).toBe(false);
    await expect(status(page)).toContainText("removed. Add it back below.");
  });

  test("Add exercise opens UF-08.5 over the area and closes with focus back on the button", async ({
    page,
  }) => {
    await toPlan(page, { budget: 60 });
    await openFirstArea(page);
    const add = page.getByRole("button", { name: "Add exercise" });
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(add).toBeFocused();
  });
});

test.describe("T-0997 offline", () => {
  test("the area detail works with the network off", async ({ page, context }) => {
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
    await openFirstArea(page);
    await expect(page.getByLabel("Offline")).toBeVisible();
    await detailRows(page).first().locator('[data-part="not-today"]').click();
    expect(await activeIsBody(page)).toBe(false);
    await expect(screenUF086(page).or(screenUF082(page))).toBeVisible();
  });
});

for (const width of [390, 320, 160]) {
  test.describe(`T-0997 AC10 layout at ${width} px${width === 160 ? " (200 % zoom)" : ""}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seed(page);
    });

    test("axe finds nothing serious, nothing scrolls sideways, targets are 44 px, names are unique", async ({
      page,
    }) => {
      await toPlan(page, { budget: 60 });
      await openFirstArea(page);
      await expectNoSeriousViolations(page);
      expect(await noSideways(page)).toBe(true);
      const row = detailRows(page).first();
      for (const part of ["swap", "not-today", "remove"]) {
        await expectBox(row.locator(`[data-part="${part}"]`), 96, 44);
      }
      await expectBox(row.locator('[data-part="how-to"]'), 44, 44);
      await expectBox(page.getByRole("link", { name: "Back" }), 44, 44);
      await expectBox(page.getByRole("button", { name: "Add exercise" }), 44, 48);
      const names = await page
        .locator("button, a[href]")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-label") ?? el.textContent!.trim()),
        );
      expect(new Set(names).size).toBe(names.length);
      await page.getByRole("button", { name: "Add exercise" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await noSideways(page)).toBe(true);
      await expectNoSeriousViolations(page);
    });
  });
}
