// T-0546 AC3/AC4/AC5 (visual-foundation T-1, G-1, focus mode untouched). Runs against `vite
// preview` with a session injected and Supabase mocked. The type scale is global, so every
// screen is checked, not one.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  type OfflineFixtures,
} from "./fixtures/supabase-mock.js";
import { UF11_FIXTURES } from "./fixtures/uf-11-plan.js";
import { historyFixtures } from "./fixtures/uf-06-progress-data.js";
import {
  exerciseAreas,
  exerciseVariants,
  exercises,
  profile,
} from "./fixtures/uf-04-library-data.js";

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

const LIBRARY: OfflineFixtures = {
  sets: [],
  exercises,
  exerciseAreas,
  exerciseVariants,
  areaTargets: [],
  profile,
};

const FIXTURES: Record<string, OfflineFixtures> = {
  "/": LIBRARY,
  "/library": LIBRARY,
  "/progress": historyFixtures(),
  "/balance": historyFixtures(),
  "/plan": UF11_FIXTURES,
  "/plan/account": UF11_FIXTURES,
};

async function open(page: Page, path: string): Promise<void> {
  await mockSupabaseData(page, FIXTURES[path]!);
  await page.goto("/welcome");
  await injectSession(page);
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible();
}

test.describe("AC3 type scale on the tab screens (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // `/balance` (`.wl-balance__window`, 20 px) and `/welcome` (`.wl-uf01__title`, 48 px) set their own
  // h1 size in feature CSS, which a global element rule can't override. Migrating them is a later
  // per-feature ticket (spec §2 Migration), so the 32-40 px range is not asserted there; family,
  // weight and case still are. Recorded in the T-0546 log.
  async function expectScale(page: Page, ownSize = false): Promise<void> {
    const got = await page.evaluate(() => {
      const h1 = getComputedStyle(document.querySelector("h1")!);
      return {
        family: h1.fontFamily,
        weight: h1.fontWeight,
        transform: h1.textTransform,
        size: parseFloat(h1.fontSize),
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(got.family.startsWith('"Big Shoulders Display"')).toBe(true);
    expect(got.weight).toBe("800");
    expect(got.transform).toBe("uppercase");
    if (!ownSize) {
      expect(got.size).toBeGreaterThanOrEqual(32);
      expect(got.size).toBeLessThanOrEqual(40);
    }
    expect(got.body.startsWith('"DM Sans"')).toBe(true);
  }

  for (const path of ["/", "/progress", "/balance", "/plan"]) {
    test(`${path} h1 and body follow the scale`, async ({ page }) => {
      await open(page, path);
      await expectScale(page, path === "/balance");
    });
  }

  test("/welcome (no session) follows the scale", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1").first()).toBeVisible();
    await expectScale(page, true);
  });
});

test.describe("AC6 screenshots for the visual check (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const SHOTS = {
    "/": "UF-02.1",
    "/library": "UF-04.1",
    "/progress": "UF-06.1",
    "/balance": "UF-10.1",
    "/plan": "UF-11.2",
    "/plan/account": "UF-11.4",
  } as const;
  for (const [path, id] of Object.entries(SHOTS)) {
    test(`${id} ${path} renders and is captured`, async ({ page }) => {
      await open(page, path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `../../test-results/visual-foundation/${id}.png` });
    });
  }
});

test.describe("AC4 gutter and no overflow on screens that already pad (360 x 740)", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const path of ["/", "/library", "/progress", "/balance"]) {
    test(`${path} keeps 16 px on the left and 344 px on the right, no h-scroll`, async ({
      page,
    }) => {
      await open(page, path);
      const m = await page.evaluate(() => {
        const h1 = document.querySelector("h1")!;
        const root = h1.closest("[data-screen-id]") ?? document.body;
        let maxRight = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const rect of r.getClientRects()) {
            if (rect.width > 0) maxRight = Math.max(maxRight, rect.right);
          }
        }
        for (const el of root.querySelectorAll("a, button, input, select, textarea")) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0) maxRight = Math.max(maxRight, rect.right);
        }
        return {
          left: h1.getBoundingClientRect().left,
          maxRight,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(m.left).toBeGreaterThanOrEqual(16);
      expect(m.maxRight).toBeLessThanOrEqual(344);
      expect(m.scrollWidth).toBeLessThanOrEqual(360);
    });
  }
});

// AC5: values read on `main` at 7b57f2b (before T-0546) and written here as constants.
const MAIN_UF09 = {
  rootPadding: "16px",
  titleFontSize: "32px",
  titleFontWeight: "700",
  titleTextTransform: "none",
  titleLetterSpacing: "normal",
  timerFontSize: "64px",
};

test.describe("AC5 focus mode is untouched (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("/session/<id> keeps main's UF-09 sizes", async ({ page }) => {
    const profileRow = { ...profile, user_id: FAKE_USER_ID };
    const targets = [
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ].map((area) => ({
      area_id: area,
      sets_per_14d: 12,
      source: "default",
      updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    }));
    await mockSupabaseData(page, {
      sets: [],
      exercises,
      exerciseAreas,
      areaTargets: targets,
      profile: profileRow,
    });
    await mockProfilePresent(page, profileRow);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Start workout" }).click();
    await page.getByRole("button", { name: "30 minutes" }).click();
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
    await expect(page.locator(".wl-uf09__timer")).toBeVisible();

    const got = await page.evaluate(() => {
      const root = getComputedStyle(document.querySelector(".wl-uf09")!);
      const title = getComputedStyle(document.querySelector("h1.wl-uf09__title")!);
      const timer = getComputedStyle(document.querySelector(".wl-uf09__timer")!);
      return {
        rootPadding: root.padding,
        titleFontSize: title.fontSize,
        titleFontWeight: title.fontWeight,
        titleTextTransform: title.textTransform,
        titleLetterSpacing: title.letterSpacing,
        timerFontSize: timer.fontSize,
      };
    });
    expect(got).toEqual(MAIN_UF09);
  });
});
