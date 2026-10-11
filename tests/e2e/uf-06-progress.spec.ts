// T-0307b AC-15: UF-06 Progress in the preview build, with a session injected and Supabase
// mocked. axe on both screens, 44 px targets, and the keyboard path into Balance and an
// exercise's history.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";
import { historyFixtures, zeroHistoryFixtures } from "./fixtures/uf-06-progress-data.js";

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

async function open(page: Page, path: string, fixtures: ReturnType<typeof historyFixtures>) {
  await mockSupabaseData(page, fixtures);
  await page.goto("/welcome");
  await injectSession(page);
  await page.goto(path);
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("AC-15 UF-06 a11y and keyboard (e2e)", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("axe finds no serious violation on /progress with no history", async ({ page }) => {
    await open(page, "/progress", zeroHistoryFixtures());
    await expect(page.getByText("No exercises logged yet")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("axe finds no serious violation on /progress and /progress/back-squat with history", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole("link", { name: /Back squat/ }).click();
    await expect(page).toHaveURL(/\/progress\/back-squat$/);
    await expect(page.getByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the Balance card, every Recent exercises row and How to are at least 44 x 44", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    const card = page.getByRole("link", { name: "Balance, last 14 days" });
    await expect(card).toBeVisible();
    const rows = page.getByRole("link", { name: /Back squat|Bench press/ });
    await expect(rows).toHaveCount(2);
    for (const link of [card, ...(await rows.all())]) {
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // UF-06.2's How to link has the same 44 x 44 floor.
    await page.goto("/progress/back-squat");
    const howTo = page.getByRole("link", { name: "How to" });
    await expect(howTo).toBeVisible();
    const howToBox = await howTo.boundingBox();
    expect(howToBox).not.toBeNull();
    expect(howToBox!.width).toBeGreaterThanOrEqual(44);
    expect(howToBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("Tab to the Balance card and Enter opens /balance; Back, then Tab to Back squat and Enter", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Balance, last 14 days" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/balance$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    // Tab until the Back squat row has focus (Back can leave the focus start point anywhere).
    const row = page.getByRole("link", { name: /Back squat/ });
    for (let i = 0; i < 6 && !(await row.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/progress\/back-squat$/);
  });

  test("focus on today's calendar cell shows the --wl-focus ring", async ({ page }) => {
    await open(page, "/progress", historyFixtures());
    const today = page.locator("td[data-today='true']");
    await expect(today).toBeVisible();
    // Keyboard modality first, so programmatic focus counts as :focus-visible.
    await page.keyboard.press("Tab");
    await today.focus();
    const outlineColor = await today.evaluate((el) => getComputedStyle(el).outlineColor);
    const probe = await page.evaluate(() => {
      const el = document.createElement("i");
      el.style.color = "var(--wl-focus)";
      // Inside the screen root: --wl-focus is a state variable.
      document.querySelector("[data-screen-id]")!.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    });
    expect(outlineColor).toBe(probe);
  });
});

// T-0609 (D-0208, D-0211; UF-06.1, UF-06.2): the Cobalt plan state in a real browser. Expected
// values come from tokens.json, never typed.
const TOKENS = JSON.parse(
  readFileSync(resolvePath(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
);
const PLAN = TOKENS.color.plan as Record<string, string>;
const rgbOf = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test.describe("T-0609 plan state", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 both screens are plan roots with the plan.bg theme-color", async ({ page }) => {
    await open(page, "/progress", historyFixtures());
    for (const [path, id] of [
      ["/progress", "UF-06.1"],
      ["/progress/back-squat", "UF-06.2"],
    ] as const) {
      if (!page.url().endsWith(path)) await page.goto(path);
      const root = page.locator(`[data-screen-id="${id}"]`);
      await expect(root).toBeVisible();
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      await expect(root).toHaveClass(/wl-page/);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
        "content",
        new RegExp(`^${PLAN.bg}$`, "i"),
      );
    }
  });

  test("AC2 calendar: muted days, a marked day is ink and bold with its word, today is underlined", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    const today = page.locator("td[data-today='true']");
    await expect(today).toBeVisible();
    const day = await page
      .locator("td[data-day]:not([data-today='true']):not([data-marked])")
      .first()
      .getAttribute("data-day");
    const other = page.locator(`td[data-day='${day}']`);
    const look = (loc: typeof today) =>
      loc.evaluate((el) => {
        const cs = getComputedStyle(el);
        const num = getComputedStyle(el.querySelector("span")!);
        return {
          color: cs.color,
          weight: cs.fontWeight,
          bg: cs.backgroundColor,
          underline: num.borderBottomWidth,
        };
      });
    const o = await look(other);
    expect(o.color).toBe(rgbOf(PLAN["ink-muted"]!));
    expect(o.bg).toBe("rgba(0, 0, 0, 0)");
    expect((await look(today)).underline).toBe("2px");
    // The seeded sessions table is empty in the mock, so mark one cell the way the screen does.
    await other.evaluate((el) => {
      el.setAttribute("data-marked", "true");
    });
    const m = await look(other);
    expect(m.color).toBe(rgbOf(PLAN.ink!));
    expect(m.weight).toBe("700");
    expect(m.bg).toBe("rgba(0, 0, 0, 0)");
  });

  test("AC3 the history stats use the stat role (2.125rem, 700)", async ({ page }) => {
    await open(page, "/progress/back-squat", historyFixtures());
    await expect(page.locator("dl dd").first()).toBeVisible();
    const got = await page
      .locator("dl dd")
      .evaluateAll((els) =>
        els.map((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight]),
      );
    expect(got).toHaveLength(3);
    for (const g of got) expect(g).toEqual(["34px", "700"]);
  });

  test("AC4 axe colour-contrast is clean on both screens; hover rows keep readable captions", async ({
    page,
  }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    for (const path of ["/progress", "/progress/back-squat"]) {
      await page.goto(path);
      await expect(page.locator("[data-screen-id^='UF-06']")).toBeVisible();
      const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(r.violations).toEqual([]);
    }
  });

  test("AC4 motion: only the root's cross-fade, instant under reduced motion", async ({ page }) => {
    await open(page, "/progress", historyFixtures());
    await expect(page.getByRole("link", { name: /Back squat/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const probe = () =>
      page.locator("[data-screen-id='UF-06.1']").evaluate((el) => {
        const moving = [el, ...el.querySelectorAll("*")].filter((n) => {
          const cs = getComputedStyle(n);
          return (
            cs.animationName !== "none" ||
            (n !== el && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0))
          );
        });
        return {
          property: getComputedStyle(el).transitionProperty,
          duration: getComputedStyle(el).transitionDuration,
          moving: moving.map((n) => `${n.tagName}.${n.className}`),
        };
      });
    const normal = await probe();
    expect(normal.property).toBe("background-color");
    expect(normal.duration).toBe("0.2s");
    expect(normal.moving).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probe();
    expect(reduced.duration).toBe("0s");
    expect(reduced.moving).toEqual([]);
  });
});

test.describe("T-0609 AC6 canvas compare at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [turn, frame, name, path] of [
    ["turn-3", "Progress", "uf06-1-progress", "/progress"],
    ["turn-5", "Exercise history", "uf06-2-history", "/progress/back-squat"],
  ] as const) {
    test(`AC6 canvas compare: ${frame}`, async ({ page }, testInfo) => {
      await open(page, path, historyFixtures());
      await expect(page.locator("[data-screen-id^='UF-06']")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const result = await compareWithCanvas(page, testInfo, { turn, frame, name });
      if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
        expect(result.files.app).toBeTruthy();
        await page.screenshot({
          path: testInfo.outputPath("cobalt", `${name}-full.png`),
          fullPage: true,
        });
      }
    });
  }
});
