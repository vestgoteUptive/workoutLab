// T-1019 UF-08.2, UF-08.6: start a workout of ONE named exercise through the areas-first flow.
// Specs outside uf-08 (UF-09 pre-fill, one-side, rest-next) only need a way to reach UF-09.3 of a
// chosen exercise; the retired exercise list (D-0274) used to be that path. The route now is
// UF-08.1 (budget) -> Start empty -> UF-08.2 Add an area -> UF-08.6 area detail (Add exercise,
// Remove the others, Start with this) -> UF-08.2 Start workout.
import type { Page } from "@playwright/test";
import { expect } from "./guarded-test.js";

export interface StartWithExercise {
  /** The budget chip to press on UF-08.1 (20, 30, 45, 60 or 90). */
  budget?: number;
  /** The body area (lower case id) the exercise is the primary of. */
  area: string;
  /** Search text for the Add exercise sheet. */
  query: string;
  /** The exercise's display name. */
  name: string;
  /** Make it the Main lift with "Start with this" (a compound that is not main yet). */
  main?: boolean;
}

const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);

/** UF-08.1 -> UF-08.2 with no area yet ("Start empty"). */
export async function startEmpty(page: Page, budget = 30): Promise<void> {
  await page.getByRole("button", { name: `${budget} minutes` }).click();
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^(Fits|Nothing)/);
  await page.getByRole("button", { name: "Start empty" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
}

/** UF-08.2: open "Add an area" and add `area`; its row appears. */
export async function addArea(page: Page, area: string): Promise<void> {
  const add = page.locator(
    `[data-part="candidate"][data-area="${area}"] [data-part="candidate-add"]`,
  );
  // The disclosure can re-render closed while UF-08.2 settles: open it until the Add shows.
  await expect(async () => {
    if (!(await add.isVisible())) await page.locator('[data-part="add-area-summary"]').click();
    await expect(add).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await add.click();
  await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toBeVisible();
}

/**
 * UF-08.1 -> Start empty -> that area -> the exercise is the ONLY row of the area (Add exercise,
 * then Remove every other one) -> Start workout -> skip the warm-up: UF-09.3 of that exercise.
 * Returns the row's detail line ("3 × 8–12 · 12 min") and UF-08.2's budget line as they read at Start.
 */
export async function startWithExercise(
  page: Page,
  o: StartWithExercise,
): Promise<{ detail: string; budget: string }> {
  await startEmpty(page, o.budget ?? 30);
  await addArea(page, o.area);
  await page
    .locator(`[data-part="area-row"][data-area="${o.area}"] [data-part="area-open"]`)
    .click();
  const detail = screen(page, "UF-08.6");
  await expect(detail).toBeVisible();

  const rows = detail.locator('[data-part="detail-row"]');
  const names = () =>
    rows.evaluateAll((els) =>
      els.map((el) => el.querySelector('[data-part="row-name"] > span')!.textContent!),
    );
  if (!(await names()).includes(o.name)) {
    await detail.getByRole("button", { name: "Add exercise" }).click();
    const sheet = screen(page, "UF-08.5");
    await sheet.getByLabel("Search exercises").fill(o.query);
    await sheet
      .getByRole("button", { name: new RegExp(`^Add ${o.name}`) })
      .first()
      .click();
    await expect(sheet).toHaveCount(0);
  }
  // Remove every other exercise of the area: the one asked for is the whole plan.
  for (;;) {
    const other = (await names()).find((n) => n !== o.name);
    if (other === undefined) break;
    await detail.getByRole("button", { name: `Remove ${other}`, exact: true }).click();
    await expect(detail.getByRole("button", { name: `Remove ${other}`, exact: true })).toHaveCount(
      0,
    );
  }
  expect(await names()).toEqual([o.name]);
  const mine = rows.first();
  if (o.main === true) {
    // The area's first compound is already the Main lift when nothing else was in the plan.
    if ((await mine.getAttribute("data-main")) !== "true") {
      await mine.getByRole("button", { name: `Start with ${o.name}` }).click();
    }
    await expect(mine).toHaveAttribute("data-main", "true");
  }
  const priced = ((await mine.locator('[data-part="row-detail"]').textContent()) ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
  const budget = ((await page.locator('[data-part="budget-text"]').textContent()) ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  await page.getByRole("button", { name: "Start workout", exact: true }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: o.name })).toBeVisible();
  return { detail: priced, budget };
}
