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

  // `/welcome` (`.wl-uf01__title`, 48 px) sets its own
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

  for (const path of ["/", "/progress", "/plan"]) {
    test(`${path} h1 and body follow the scale`, async ({ page }) => {
      await open(page, path);
      await expectScale(page);
    });
  }

  test("an unmigrated h1 (injected, no state) follows the scale", async ({ page }) => {
    // /welcome is a plan screen now (T-0605), so the no-state case is a fixture.
    await page.goto("/welcome");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.evaluate(() => {
      document.querySelectorAll("[data-screen-id]").forEach((e) => e.remove());
      document.body.insertAdjacentHTML("beforeend", "<div><h1>x</h1></div>");
    });
    await expectScale(page);
  });
});

// T-0589 AC7: the uppercase transform is the unmigrated default; a state root turns it off.
test.describe("T-0589 AC7 no uppercase under a state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("h1 and h2 are text-transform none inside a state, uppercase outside", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1").first()).toBeVisible();
    const got = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML =
        '<div data-wl-state="plan"><h1>a</h1><h2>b</h2></div><div><h1>c</h1><h2>d</h2></div>';
      document.body.appendChild(host);
      const t = (sel: string) => getComputedStyle(host.querySelector(sel)!).textTransform;
      return {
        inH1: t("[data-wl-state] h1"),
        inH2: t("[data-wl-state] h2"),
        outH1: t("div:not([data-wl-state]) > h1"),
        outH2: t("div:not([data-wl-state]) > h2"),
      };
    });
    expect(got).toEqual({ inH1: "none", inH2: "none", outH1: "uppercase", outH2: "uppercase" });
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

// AC5: UF-09.1 keeps the values read on `main` at 7b57f2b (before T-0546), written here as
// constants, until T-0596 to T-0598 restyle it. T-0595 (D-0208, D-0211) restyles UF-09.3 and
// UF-09.4 into the lift state, so their sizes are pinned to the Cobalt values instead:
// the root gutter 26 px (--wl-space-gutter-session) and the session type roles (the 150 px load
// is pinned in uf-09-focus.spec.ts, where the plan has a known weight).
const MAIN_UF09 = {
  rootPadding: "16px",
  titleFontSize: "32px",
  titleFontWeight: "700",
  titleTextTransform: "none",
  titleLetterSpacing: "normal",
  timerFontSize: "64px",
};

const LIFT_UF09 = {
  rootPaddingInline: "26px",
  titleFontSize: "44px",
  titleFontWeight: "800",
  titleTextTransform: "none",
  heroFontWeight: "800",
};

async function openFocusMode(page: Page): Promise<void> {
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
}

test.describe("AC5 focus mode sizes (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("/session/<id> UF-09.1 keeps main's UF-09 sizes", async ({ page }) => {
    await openFocusMode(page);
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

  test("/session/<id> UF-09.3 pins the Cobalt lift sizes (T-0595)", async ({ page }) => {
    await openFocusMode(page);
    const skip = page.getByRole("button", { name: "Skip warm-up" });
    if (await skip.count()) await skip.click();
    else await page.getByRole("button", { name: "Start now" }).click();
    await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
    const got = await page.evaluate(() => {
      const root = getComputedStyle(document.querySelector("[data-screen-id]")!);
      const title = getComputedStyle(document.querySelector("h1")!);
      const hero = getComputedStyle(document.querySelector(".wl-uf09__load .wl-uf09__hero")!);
      return {
        rootPaddingInline: root.paddingLeft,
        titleFontSize: title.fontSize,
        titleFontWeight: title.fontWeight,
        titleTextTransform: title.textTransform,
        heroFontWeight: hero.fontWeight,
      };
    });
    expect(got).toEqual(LIFT_UF09);
  });
});
