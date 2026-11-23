// T-0689 UF-11.3 (D-0230, D-0233 §1, D-0178): in a real browser, the arrow keys move the
// selection through the Level radiogroup. T-0682's QA-3 is jsdom and cannot show that the browser
// moves the selection; a CSS or markup change to the `.wl-option` rows could break it unseen.
//
// `test` comes from the guarded fixture: an unmocked Supabase request or a console error fails
// the test at teardown (AC8). Expected colours come from tokens.json, never typed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

const PLAN = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
  ) as { color: { plan: Record<string, string> } }
).color.plan;

function rgbOf(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}
const TRANSPARENT = "rgba(0, 0, 0, 0)";

const level = (page: Page, name: "Beginner" | "Intermediate" | "Advanced"): Locator =>
  page.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name, exact: true });
const goalChecked = (page: Page): Locator =>
  page.getByRole("radiogroup", { name: "Goal" }).getByRole("radio", { checked: true });
const save = (page: Page): Locator => page.getByRole("button", { name: "Save", exact: true });

/** Open /plan/edit and put keyboard focus on the checked Level radio by Tab from the Goal group's
 *  checked radio (the Level group is one tab stop, so one Tab lands on its checked radio). */
async function openAndTabIntoLevel(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, UF11_FIXTURES);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/plan/edit");
  await expect(page.getByRole("radiogroup", { name: "Level" })).toBeVisible();
  await expect(level(page, "Intermediate")).toBeChecked();
  await goalChecked(page).focus();
  await page.keyboard.press("Tab");
  await expect(level(page, "Intermediate")).toBeFocused();
}

async function expectOnly(
  page: Page,
  name: "Beginner" | "Intermediate" | "Advanced",
): Promise<void> {
  await expect(level(page, name)).toBeChecked();
  await expect(level(page, name)).toBeFocused();
  for (const other of ["Beginner", "Intermediate", "Advanced"] as const) {
    if (other !== name) await expect(level(page, other)).not.toBeChecked();
  }
}

test("T-0689 AC1 arrows move the selection, both axes", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expectOnly(page, "Beginner");

  // Right = next, Left = previous.
  await page.keyboard.press("ArrowRight");
  await expectOnly(page, "Intermediate");
  await page.keyboard.press("ArrowRight");
  await expectOnly(page, "Advanced");
  await page.keyboard.press("ArrowLeft");
  await expectOnly(page, "Intermediate");
  await page.keyboard.press("ArrowLeft");
  await expectOnly(page, "Beginner");
});

test("T-0689 AC2 the selection wraps around at both ends", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Beginner");
  await page.keyboard.press("ArrowUp");
  await expectOnly(page, "Advanced");
});

test("T-0689 AC3 the Level group is one tab stop", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");

  // Tab leaves the group, to the first rhythm stepper button.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Decrease minimum" })).toBeFocused();
  // Shift+Tab returns to the radio that was checked, not the first one.
  await page.keyboard.press("Shift+Tab");
  await expectOnly(page, "Advanced");

  // Walk from the Goal group forward to the stepper and count the Level radios that took focus.
  await goalChecked(page).focus();
  const focusedLevels: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return {
        name: el?.getAttribute("name") ?? "",
        value: el?.value ?? "",
        label: el?.getAttribute("aria-label") ?? "",
      };
    });
    if (info.name === "level") focusedLevels.push(info.value);
    if (info.label === "Decrease minimum") break;
  }
  expect(focusedLevels).toEqual(["advanced"]);
});

test("T-0689 AC4 the change is real and the screen reacts", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await expect(save(page)).toHaveAttribute("aria-disabled", "true");
  const row = (name: "Intermediate" | "Advanced") =>
    page.locator(`label.wl-option:has(input[name="level"][value="${name.toLowerCase()}"])`);

  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  await expect(save(page)).toHaveAttribute("aria-disabled", "false");
  await expect(row("Advanced")).toHaveCSS("background-color", rgbOf(PLAN.selected!));
  await expect(row("Intermediate")).toHaveCSS("background-color", TRANSPARENT);

  await page.keyboard.press("ArrowUp");
  await expectOnly(page, "Intermediate");
  await expect(save(page)).toHaveAttribute("aria-disabled", "true");
  await expect(row("Intermediate")).toHaveCSS("background-color", rgbOf(PLAN.selected!));
  await expect(row("Advanced")).toHaveCSS("background-color", TRANSPARENT);
});

test("T-0689 AC5 the Goal group is untouched", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await expect(goalChecked(page)).toHaveAccessibleName("Build muscle");
  for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"]) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).name)).toBe(
      "level",
    );
  }
  await expect(goalChecked(page)).toHaveAccessibleName("Build muscle");
  await expect(page.locator('input[name="goal"]:checked')).toHaveCount(1);
});

test("T-0689 AC6 the keyboard focus ring is 2 px; a mouse click selects", async ({ page }) => {
  await openAndTabIntoLevel(page);
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  const ring = page.locator("label.wl-option:has(input:focus-visible)");
  await expect(ring).toHaveCount(1);
  await expect(ring).toHaveCSS("outline-width", "2px");
  await expect(ring).toHaveCSS("outline-style", "solid");
  await expect(ring).toHaveCSS("outline-color", rgbOf(PLAN.ink!));

  await level(page, "Beginner").click();
  await expect(level(page, "Beginner")).toBeChecked();
  await expect(level(page, "Advanced")).not.toBeChecked();
});

test("T-0689 AC7 offline: the selection moves, Save stays disabled", async ({ page, context }) => {
  await openAndTabIntoLevel(page);
  await context.setOffline(true);
  await expect(page.getByText("Connect to save")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expectOnly(page, "Beginner");
  await expect(page.getByText("Connect to save")).toBeVisible();
  await expect(save(page)).toHaveAttribute("aria-disabled", "true");
});

// AC8: no console error and no unmocked Supabase request is asserted for every test above by the
// guarded fixture at teardown; this one proves the guard is armed on this page.
test("T-0689 AC8 the guards see a clean page", async ({ page, consoleGuard, supabaseGuard }) => {
  await openAndTabIntoLevel(page);
  await page.keyboard.press("ArrowDown");
  await expectOnly(page, "Advanced");
  expect(consoleGuard).toBeDefined();
  expect(supabaseGuard).toBeDefined();
});
