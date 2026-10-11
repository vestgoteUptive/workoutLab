// T-0306a UF-04 Library e2e (AC-17): a11y, touch targets and the keyboard happy path, on the
// preview build with an injected session and mocked Supabase.
//
// T-0904 (D-0086): `test` comes from `fixtures/guarded-test.js`, not `@playwright/test`, so a
// Supabase request no route claims fails this spec at teardown instead of reaching the real host
// and surfacing as a timeout three layers from its cause. UF-04 renders through `refreshAll`,
// which selects nine tables, so an unclaimed read here is a live hazard rather than a
// theoretical one: `mockSupabaseData` has to cover every one of them.
import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { expect, test } from "./fixtures/guarded-test.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    exerciseVariants,
    areaTargets: [],
    profile,
  });
  await page.goto("/");
  await injectSession(page);
});

async function openLibrary(page: Page, path: string): Promise<void> {
  await page.goto(path);
}

const SCREENS = [
  ["/library", "UF-04.1"],
  ["/library/back-squat", "UF-04.2"],
  ["/library/back-squat/compare/leg-extension", "UF-04.3"],
] as const;

test.describe("AC-17 accessibility", () => {
  for (const [path, id] of SCREENS) {
    test(`${path} has 0 serious or critical axe violations`, async ({ page }) => {
      await openLibrary(page, path);
      await expect(page.locator(`[data-screen-id="${id}"] h1`)).toBeVisible();
      if (id === "UF-04.1") await expect(page.locator('[data-field="name"]').first()).toBeVisible();
      if (id === "UF-04.2")
        await expect(page.getByText("Sit down between your heels")).toBeVisible();
      if (id === "UF-04.3")
        await expect(page.getByRole("columnheader", { name: "Leg extension" })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious).toEqual([]);
    });
  }

  test("every chip and list row is at least 44 x 44 CSS px", async ({ page }) => {
    await openLibrary(page, "/library");
    await expect(page.locator('[data-field="name"]')).toHaveCount(24);
    const targets = page.locator(".wl-chip, .wl-uf04-browse__list li");
    const count = await targets.count();
    expect(count).toBe(11 + 24);
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      expect(box, `target ${i}`).not.toBeNull();
      expect(box!.width, `target ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `target ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("AC-17 keyboard happy path", () => {
  test("Tab to Hamstrings, Space filters to 2 rows, Tab to Leg curl, Enter opens it", async ({
    page,
  }) => {
    await openLibrary(page, "/library");
    await expect(page.locator('[data-field="name"]')).toHaveCount(24);
    const chip = page.getByRole("button", { name: "Hamstrings" });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if (await chip.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(chip).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator('[data-field="name"]')).toHaveCount(2);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const leg = page.getByRole("link", { name: /^Leg curl/ });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      if (await leg.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(leg).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library\/leg-curl$/);
    await expect(page.getByRole("heading", { level: 1, name: "Leg curl" })).toBeVisible();
  });
});

// T-0607 (D-0208, D-0210, D-0211; UF-04.1, UF-04.3): the plan state, computed in a real browser.
// Expected values come from tokens.json, never typed.
const TOKENS = JSON.parse(
  readFileSync(resolvePath(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
);
const PLAN = TOKENS.color.plan;
const rgbOf = (hex: string): string => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
};
const COMPARE = "/library/back-squat/compare/leg-extension";

/** Re-claims the data routes with an excluded and a favorite exercise, then opens the path. */
async function openTagged(page: Page, path: string): Promise<void> {
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    exerciseVariants,
    areaTargets: [],
    profile,
    excludedExercises: [{ exercise_id: "back-squat", created_at: "2026-10-08T10:00:00.000Z" }],
    favoriteExercises: [{ exercise_id: "leg-extension", created_at: "2026-10-08T10:00:00.000Z" }],
  });
  await page.goto(path);
}

async function ready(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("[data-screen-id^='UF-04'] h1")).toBeVisible();
  if (path === "/library") await expect(page.locator('[data-field="name"]')).toHaveCount(24);
  else await expect(page.getByRole("columnheader", { name: "Leg extension" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe(rgbOf(PLAN.bg));
}

test.describe("T-0607 plan state", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 both screens are plan roots with the plan.bg theme-color", async ({ page }) => {
    for (const [path, id] of [
      ["/library", "UF-04.1"],
      [COMPARE, "UF-04.3"],
    ] as const) {
      await ready(page, path);
      const root = page.locator(`[data-screen-id="${id}"]`);
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", PLAN.bg);
      expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        rgbOf(PLAN.bg),
      );
    }
    // The detail screen is still the unmigrated look until T-0608.
    await page.goto("/library/back-squat");
    await expect(page.locator('[data-screen-id="UF-04.2"]')).not.toHaveAttribute("data-wl-state");
  });

  test("AC2 the search has a 1 px plan.ink-muted boundary; Clear is 44 x 44 and empties it", async ({
    page,
  }) => {
    await ready(page, "/library");
    const box = page.getByRole("searchbox", { name: "Search exercises" });
    const style = await box.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor };
    });
    expect(style).toEqual({ w: "1px", style: "solid", color: rgbOf(PLAN["ink-muted"]) });
    await box.fill("squat");
    const clear = page.getByRole("button", { name: "Clear search" });
    const b = (await clear.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    await clear.click();
    await expect(box).toHaveValue("");
    await expect(clear).toHaveCount(0);
  });

  test("AC2 pressed and unpressed chips differ in fill and tick; names unchanged", async ({
    page,
  }) => {
    await ready(page, "/library");
    const probe = (name: string) =>
      page.getByRole("button", { name, exact: true }).evaluate((el) => {
        const cs = getComputedStyle(el);
        const tick = getComputedStyle(el.querySelector(".wl-chip__tick")!);
        return { bg: cs.backgroundColor, color: cs.color, tick: tick.display };
      });
    expect(await probe("All")).toEqual({
      bg: rgbOf(PLAN.selected),
      color: rgbOf(PLAN["on-selected"]),
      tick: "block",
    });
    const off = await probe("Quads");
    expect(off.bg).toBe("rgba(0, 0, 0, 0)");
    expect(off.color).toBe(rgbOf(PLAN.ink));
    expect(off.tick).toBe("none");
    await page.getByRole("button", { name: "Quads", exact: true }).click();
    expect((await probe("Quads")).tick).toBe("block");
    expect((await probe("All")).tick).toBe("none");
    await expect(page.getByRole("button", { name: "Quads", exact: true })).toHaveCount(1);
  });

  test("AC2 an empty search renders the existing line in plan ink", async ({ page }) => {
    await ready(page, "/library");
    await page.getByRole("searchbox", { name: "Search exercises" }).fill("zzzz");
    const line = page.getByText('No exercises match "zzzz"');
    await expect(line).toBeVisible();
    expect(await line.evaluate((el) => getComputedStyle(el).color)).toBe(rgbOf(PLAN.ink));
  });

  test("AC3 the Not suggested tag is an outline chip in plan.ink; untagged rows have none", async ({
    page,
  }) => {
    await page.goto("/library");
    await openTagged(page, "/library");
    const tag = page.locator('[data-field="not-suggested"]');
    await expect(tag).toHaveText("Not suggested");
    const css = await tag.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        bg: cs.backgroundColor,
        border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
      };
    });
    expect(css).toEqual({
      color: rgbOf(PLAN.ink),
      bg: "rgba(0, 0, 0, 0)",
      border: `1px solid ${rgbOf(PLAN.line)}`,
    });
    await expect(page.locator('[data-field="favorite"]')).toHaveText("Favorite");
    await expect(page.locator(".wl-uf04-browse__tag")).toHaveCount(2);
    await expect(
      page.locator("li", { hasText: "Goblet squat" }).locator(".wl-uf04-browse__tag"),
    ).toHaveCount(0);
  });

  for (const path of ["/library", COMPARE]) {
    test(`AC4 ${path}: axe colour-contrast 0 violations and every text pair >= 4.5`, async ({
      page,
    }) => {
      if (path === "/library") {
        await page.goto("/library");
        await openTagged(page, "/library");
        await expect(page.locator(".wl-uf04-browse__tag")).toHaveCount(2);
      }
      await ready(page, path);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(results.violations).toEqual([]);
      const low = await page.evaluate(() => {
        const ctx = document
          .createElement("canvas")
          .getContext("2d", { willReadFrequently: true })!;
        const rgba = (c: string): number[] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = c;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
        };
        const L = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll("[data-screen-id^='UF-04'] *")) {
          const own = [...el.childNodes].some(
            (n) => n.nodeType === 3 && n.textContent!.trim() !== "",
          );
          const box = el.getBoundingClientRect();
          if (!own || box.width <= 1 || box.height <= 1) continue;
          let bg = [0, 0, 0, 0];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3]! > 0.99) {
              bg = c;
              break;
            }
          }
          const [hi, lo] = [L(rgba(getComputedStyle(el).color)), L(bg)].sort((a, b) => b - a);
          const ratio = (hi! + 0.05) / (lo! + 0.05);
          if (ratio < 4.5) out.push(`${el.tagName}.${el.className} ${ratio.toFixed(2)}`);
        }
        return out;
      });
      expect(low).toEqual([]);
    });
  }

  test("AC4 compare: the back link is a 44 x 44 text button and the type is rem", async ({
    page,
  }) => {
    await ready(page, COMPARE);
    const back = page.getByRole("link", { name: /Leg extension/ });
    const b = (await back.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    const h1 = await page.locator("h1").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, weight: cs.fontWeight, transform: cs.textTransform };
    });
    expect(h1).toEqual({ size: "44px", weight: "700", transform: "none" });
  });

  test("AC4 the table rows are 1px plan.line hairlines, laid out inside the page gutter", async ({
    page,
  }) => {
    await ready(page, COMPARE);
    const info = await page
      .locator("tbody th")
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          width: cs.borderBottomWidth,
          color: cs.borderBottomColor,
          right: document.querySelector("table")!.getBoundingClientRect().right,
        };
      });
    expect(info.width).toBe("1px");
    expect(info.color).toBe(rgbOf(PLAN.line));
    expect(info.right).toBeLessThanOrEqual(390 - 20);
  });

  test("AC4 motion: only the root's cross-fade, instant under reduced motion", async ({ page }) => {
    await ready(page, "/library");
    const probe = () =>
      page.locator("[data-screen-id^='UF-04']").evaluate((el) => {
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

  test("AC4 a row layout rule does not leak: the detail variant rows keep the legacy look", async ({
    page,
  }) => {
    await page.goto("/library/back-squat");
    await expect(page.locator('[data-screen-id="UF-04.2"] h1')).toBeVisible();
    const row = page.locator(".wl-uf04__row").first();
    await expect(row).toBeVisible();
    expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe("flex");
    expect(await row.evaluate((el) => el.classList.contains("wl-row"))).toBe(false);
  });
});

test.describe("T-0607 AC6 canvas compare at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [frame, name, path, turn] of [
    ["Exercises", "uf04-1-exercises", "/library", "turn-3"],
    ["Compare variations", "uf04-3-compare", COMPARE, "turn-5"],
  ] as const) {
    test(`AC6 canvas compare: ${frame}`, async ({ page }, testInfo) => {
      await ready(page, path);
      await page.waitForLoadState("networkidle");
      const result = await compareWithCanvas(page, testInfo, { turn, frame, name });
      if (process.env.WL_CANVAS_COMPARE === "1" && !result.skipped) {
        expect(result.files.app).toBeTruthy();
        expect(result.files.canvas).toBeTruthy();
        await page.screenshot({
          path: testInfo.outputPath("cobalt", `${name}-full.png`),
          fullPage: true,
        });
      }
    });
  }
});
