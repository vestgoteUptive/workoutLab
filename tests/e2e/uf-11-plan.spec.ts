// T-0308b UF-11.2 / UF-11.3 e2e (AC-B15). Runs against `vite preview` with Supabase mocked
// through `page.route`.
//
// `test` comes from `fixtures/guarded-test.js`, not `@playwright/test` (T-0904, D-0086): any
// Supabase request no route claims fails the test at teardown, naming the method and URL, instead
// of going to the real network and surfacing as a timeout three layers away. That is why the
// fixtures here fill `checkins`, `routines` and `routineItems` as well as the obvious tables —
// UF-11.2 reads all of them, and a missing one is a guard failure even when the visible
// assertion passes.
//
// T-0308c appends its UF-11.1 card cases to this file (D-0071 §10).
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { injectSession, mockSupabaseAuth, mockSupabaseData, mockSupabaseRest } from "./fixtures/supabase-mock.js";
import { ROUTINE_A_ID, UF11_FIXTURES } from "./fixtures/uf-11-plan.js";

const MIN_TARGET_PX = 44;

async function open(page: Page, path: "/plan" | "/plan/edit"): Promise<void> {
  await mockSupabaseData(page, UF11_FIXTURES);
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("AC-B15 accessibility (NFR-A11Y-1/-2)", () => {
  for (const [path, screenId] of [
    ["/plan", "UF-11.2"],
    ["/plan/edit", "UF-11.3"],
  ] as const) {
    test(`${path} has no serious or critical axe violation`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator(`[data-screen-id="${screenId}"]`)).toBeVisible();
      // Wait for the content, not just the host: an empty screen trivially passes axe.
      await expect(page.locator("h1")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .include(`[data-screen-id="${screenId}"]`)
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`),
        JSON.stringify(serious, null, 2),
      ).toEqual([]);
    });

    test(`${path}: every button, input, radio and link is at least 44 x 44 CSS px`, async ({
      page,
    }) => {
      await open(page, path);
      const host = page.locator(`[data-screen-id="${screenId}"]`);
      await expect(host).toBeVisible();
      await expect(page.locator("h1")).toBeVisible();

      const candidates = host.locator("button, input, [role=radio], a");
      const count = await candidates.count();
      // Contrast: the screen really does have interactive controls, so a selector typo can't
      // make this test pass by measuring nothing.
      expect(count).toBeGreaterThan(3);

      const tooSmall: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const element = candidates.nth(i);
        if (!(await element.isVisible())) {
          // A visually hidden native radio is measured by its label instead (below).
          const tag = await element.evaluate((el) => el.tagName.toLowerCase());
          const type = await element.getAttribute("type");
          if (tag === "input" && type === "radio") continue;
          continue;
        }
        // A native radio's hit target is its <label>: it either wraps the input or points at it
        // with `for`. So a visually hidden radio inside a 44 px label passes, and a bare 13 px
        // radio fails.
        const measured = await element.evaluate((el) => {
          const isRadio =
            el.tagName.toLowerCase() === "input" &&
            (el as HTMLInputElement).type === "radio";
          if (!isRadio) return null;
          const byWrap = el.closest("label");
          const byFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const label = byWrap ?? byFor;
          if (!label) return "no-label";
          const box = label.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });

        let box: { width: number; height: number } | null;
        if (measured === "no-label") {
          tooSmall.push(`a radio with no label to act as its hit target`);
          continue;
        } else if (measured) {
          box = measured;
        } else {
          box = await element.boundingBox();
        }
        if (!box) continue;
        if (box.width < MIN_TARGET_PX || box.height < MIN_TARGET_PX) {
          const name =
            (await element.getAttribute("aria-label")) ??
            (await element.textContent()) ??
            (await element.evaluate((el) => el.tagName.toLowerCase()));
          tooSmall.push(`${name!.trim()}: ${Math.round(box.width)} x ${Math.round(box.height)}`);
        }
      }
      expect(tooSmall).toEqual([]);
    });
  }

  test("/plan/edit: Tab to the Back chip and Space gives aria-pressed=true", async ({ page }) => {
    await open(page, "/plan/edit");
    await expect(page.locator('[data-screen-id="UF-11.3"]')).toBeVisible();

    const back = page.getByRole("button", { name: "Back", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("aria-pressed", "false");

    // Tab to it for real, rather than calling focus(): the claim is that it is reachable.
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await back.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "the Back chip was not reachable by Tab within 60 presses").toBe(true);

    await page.keyboard.press("Space");
    await expect(back).toHaveAttribute("aria-pressed", "true");
    // The keyup must not toggle it a second time.
    await page.waitForTimeout(150);
    await expect(back).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("AC-B15 the Edit plan / Cancel round trip", () => {
  test("`Edit plan` lands on UF-11.3 and `Cancel` returns to UF-11.2", async ({ page }) => {
    await open(page, "/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();

    await page.getByRole("link", { name: "Edit plan" }).click();
    await expect(page).toHaveURL(/\/plan\/edit$/);
    await expect(page.locator('[data-screen-id="UF-11.3"]')).toBeVisible();
    // Contrast: it really moved. UF-11.2's host is gone.
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toHaveCount(0);

    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
    await expect(page.locator('[data-screen-id="UF-11.3"]')).toHaveCount(0);
  });
});

test.describe("the happy path: the plan renders from the mocked server", () => {
  test("/plan shows the goal, the 9 targets, the newest 3 check-ins and both routines", async ({
    page,
  }) => {
    await open(page, "/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();

    await expect(page.getByText("Build muscle")).toBeVisible();
    await expect(page.getByText("3–4 per week · 6–8 per 14 days")).toBeVisible();

    const targets = page.locator('ul[aria-label="Targets"] li');
    await expect(targets).toHaveCount(9);
    await expect(targets.first()).toHaveText("Chest 20 · From your plan");
    await expect(targets.nth(7)).toHaveText("Hamstrings 16 · From your plan");

    // AC-B4's three newest, in order, and the fourth absent.
    const checkins = page.locator('ul[aria-label="Last check-ins"] li');
    await expect(checkins).toHaveCount(3);
    await expect(checkins.nth(0)).toContainText("Waiting for you");
    await expect(checkins.nth(1)).toContainText("Kept");
    await expect(checkins.nth(2)).toContainText("Withdrawn");
    await expect(page.getByText("16 Aug")).toHaveCount(0);

    const routines = page.locator('ul[aria-label="Routines"] li a');
    await expect(routines).toHaveCount(2);
    await expect(routines.nth(0)).toHaveText("Lower A · 2 exercises");
    await expect(routines.nth(0)).toHaveAttribute("href", `/plan/routines/${ROUTINE_A_ID}`);
    // The singular, asserted exactly.
    await expect(routines.nth(1)).toHaveText("Upper B · 1 exercise");
    await expect(page.getByRole("link", { name: "New routine" })).toHaveAttribute(
      "href",
      "/plan/routines/new",
    );
  });

  test("/plan/edit previews the engine's numbers and enables Save only after a change", async ({
    page,
  }) => {
    await open(page, "/plan/edit");
    await expect(page.locator('[data-screen-id="UF-11.3"]')).toBeVisible();

    const preview = page.locator('ul[aria-label="New targets per 14 days"] li');
    await expect(preview).toHaveCount(9);
    await expect(preview.first()).toHaveText("Chest 20");

    const save = page.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(preview.nth(1)).toHaveText("Back 25");
    await expect(save).toBeEnabled();

    // Back to the loaded value: Save goes quiet again (D-0081 §2).
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(preview.nth(1)).toHaveText("Back 20");
    await expect(save).toBeDisabled();
  });
});
