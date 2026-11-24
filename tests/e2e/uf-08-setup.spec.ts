// T-0303a UF-08.1 e2e (AC-12; D-0086, D-0091 §1, D-0108). Runs against `vite preview` with
// Supabase mocked through `page.route`; `test`/`expect` come from the guarded fixture, so an
// unclaimed Supabase request fails the test at teardown. T-0303b–d append their cases here.
//
// Seed (D-0108 §2, §4): the L1+ library from `fixtures/uf-04-library-data.js` (read-only), its
// `profile` with FULL equipment plus `user_id` (the default `mockProfilePresent` row has
// `equipment: []`, which would give the R7-E6 push-up plan instead), the nine F-targets, and no
// sets. No seed row carries a date, so nothing here can drift out of the 14-day window.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
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
import {
  exerciseAreas,
  exercises,
  exercisesLoaded,
  profile,
} from "./fixtures/uf-04-library-data.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";
import { VITE_SUPABASE_URL } from "./playwright.config.js";
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

const FIT_PATTERN = /^Fits: [1-9]\d* exercises?, [1-9]\d* sets? \+ warm-up$/;

const screenUF081 = (page: Page) => page.locator('[data-screen-id="UF-08.1"]');
const fitLine = (page: Page) => page.locator('[data-part="fit-line"]');

test.beforeEach(async ({ page }) => {
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
});

async function openSetup(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(screenUF081(page)).toBeVisible();
  await expect(fitLine(page)).toHaveText(FIT_PATTERN);
}

/** Library and target rows cached for this user (the offline.spec.ts pattern). */
async function cachedCounts(page: Page): Promise<{ library: number; targets: number }> {
  return page.evaluate(async (userId: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    async function countIn(storeName: string): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const countReq = tx
          .objectStore(storeName)
          .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => reject(countReq.error);
      });
    }
    const library = await countIn("libraryCache");
    const targets = await countIn("targetCache");
    db.close();
    return { library, targets };
  }, FAKE_USER_ID);
}

/** Waits until the workbox precache holds the navigation fallback (offline.spec.ts, T-0904). */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return { hasDocument: false };
          const requests = await (await caches.open(precache)).keys();
          return {
            hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
          };
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toMatchObject({ hasDocument: true });
}

test.describe("AC-12 offline cold start (NFR-OFF-3, D-0108 §5)", () => {
  test("the offline fit line equals the online one, and 15 min gives R7-E2", async ({
    page,
    context,
  }) => {
    await openSetup(page);
    await expect(page.locator('[data-part="minutes"]')).toHaveText("45");
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    const online = (await fitLine(page).textContent())!;
    expect(online).toMatch(FIT_PATTERN);

    await context.setOffline(true);
    await page.reload();

    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(online);
    expect((await fitLine(page).textContent())!).toMatch(FIT_PATTERN);

    const less = page.getByRole("button", { name: "5 minutes less" });
    for (let i = 0; i < 6; i += 1) await less.click();
    await expect(page.locator('[data-part="minutes"]')).toHaveText("15");
    await expect(fitLine(page)).toHaveText("Fits: 1 exercise, 4 sets + warm-up");
  });
});

test.describe("T-0637 AC8 ?budget=20 (UF-08.1, D-0217)", () => {
  test("opens with the 20 chip pressed and a suggestion that fits in 20 minutes", async ({
    page,
  }) => {
    await page.goto("/");
    await injectSession(page);
    await page.goto("/session/setup?budget=20");
    await expect(screenUF081(page)).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await expect(page.getByRole("button", { name: "20 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[data-part="minutes"]')).toHaveText("20");
    const line = (await fitLine(page).textContent())!;

    // The same line as tapping the 20 chip from the default.
    await page.goto("/session/setup");
    await expect(page.locator('[data-part="minutes"]')).toHaveText("45");
    await page.getByRole("button", { name: "20 minutes" }).click();
    await expect(fitLine(page)).toHaveText(line);

    await page.goto("/session/setup?budget=20");
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(screenUF082(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "20 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("AC-12 a11y (NFR-A11Y-1/2/6)", () => {
  test("axe reports 0 serious or critical violations on UF-08.1", async ({ page }) => {
    await openSetup(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("the stepper buttons, the 5 chips, Close and Suggest are each ≥ 44 × 44 px", async ({
    page,
  }) => {
    await openSetup(page);
    const targets = [
      page.getByRole("button", { name: "5 minutes less" }),
      page.getByRole("button", { name: "5 minutes more" }),
      ...[20, 30, 45, 60, 90].map((m) => page.getByRole("button", { name: `${m} minutes` })),
      page.getByRole("link", { name: "Close" }),
      page.getByRole("button", { name: "Suggest my workout" }),
    ];
    for (const target of targets) {
      const box = await settledBox(target);
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: chip 30 → toggle → Low → Suggest", async ({ page }) => {
    await openSetup(page);
    const isFocused = (name: string, role: "button" | "checkbox" | "radio") =>
      page.getByRole(role, { name }).evaluate((el) => el === document.activeElement);

    async function tabTo(name: string, role: "button" | "checkbox" | "radio"): Promise<void> {
      for (let i = 0; i < 25; i += 1) {
        if (await isFocused(name, role)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${role} "${name}"`);
    }

    await page.locator("body").focus();
    await tabTo("30 minutes", "button");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-part="minutes"]')).toHaveText("30");

    const toggle = page.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" });
    await tabTo("Warm-up counts in this time (3 min)", "checkbox");
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();

    await tabTo("Normal", "radio");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Low" })).toBeChecked();
    await expect(page.getByText("Fewer sets, same weights.")).toBeVisible();

    await tabTo("Suggest my workout", "button");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/session\/setup\?step=suggested$/);
    await expect(page.locator('[data-screen-id="UF-08.2"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });
});

// ---- T-0303b UF-08.2 Suggested workout (AC-12; D-0086, D-0091 §1, D-0108, D-0109) ----

// T-0391 (D-0124 §2): the weight is `formatKg`'s output, so U+00A0 sits before "kg".
const DETAIL_PATTERN = /^[1-4] × (\d+(–\d+)?|\d+ s)( · (Bodyweight|[\d.]+\u00A0kg))? · \d+ min$/;

// T-0391 AC6: a table check on the pattern itself; no browser needed.
test.describe("T-0391 AC6 DETAIL_PATTERN takes U+00A0 before kg, not a plain space", () => {
  for (const [text, matches] of [
    ["4 × 6–8 · 80\u00A0kg · 12 min", true],
    ["4 × 6–8 · 80 kg · 12 min", false],
    ["4 × 6–8 · 77.5\u00A0kg · 12 min", true],
    ["3 × 8–12 · Bodyweight · 10 min", true],
    ["4 × 6–8 · 12 min", true],
  ] as const) {
    test(`T-0391 AC6 ${JSON.stringify(text)} ${matches ? "matches" : "does not match"}`, () => {
      expect(DETAIL_PATTERN.test(text)).toBe(matches);
    });
  }
});

const screenUF082 = (page: Page) => page.locator('[data-screen-id="UF-08.2"]');
const areaRows = (page: Page) => page.locator('[data-part="area-row"]');
const areaNames = (page: Page) => areaRows(page).locator('[data-part="area-name"]');
const screenUF086 = (page: Page) => page.locator('[data-screen-id="UF-08.6"]');
const detailRows = (page: Page) => page.locator('[data-part="detail-row"]');
const detailNames = (page: Page) =>
  detailRows(page).locator('[data-part="row-name"] > span:first-child');

/** T-1019: UF-08.2 area row -> UF-08.6 (the exercises live there, D-0274). Default: first area. */
async function openArea(page: Page, area?: string): Promise<string> {
  const row = area === undefined ? areaRows(page).first() : page.locator(`[data-area="${area}"]`);
  const id = (await row.getAttribute("data-area"))!;
  await row.locator('[data-part="area-open"]').click();
  await expect(screenUF086(page)).toBeVisible();
  return id;
}

/** Name and detail ("4 × 6–8 · 12 min") of each exercise row on UF-08.6, in order. */
async function rowTexts(page: Page): Promise<string[][]> {
  return detailRows(page).evaluateAll((rows) =>
    rows.map((r) => [
      r.querySelector('[data-part="row-name"] > span')!.textContent!,
      r.querySelector('[data-part="row-detail"]')!.textContent!,
    ]),
  );
}

/** Every area's UF-08.6 rows, in the order UF-08.2 lists the areas; returns to UF-08.2. */
async function allRowTexts(page: Page): Promise<string[][]> {
  const areas = await areaRows(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-area")!),
  );
  const out: string[][] = [];
  for (const area of areas) {
    await openArea(page, area);
    out.push(...(await rowTexts(page)));
    await page.getByRole("link", { name: "Back" }).click();
    await expect(screenUF082(page)).toBeVisible();
  }
  return out;
}

/** UF-08.1 at 30 min → Suggest → UF-08.2. Returns the fit line UF-08.1 showed. */
async function suggestAt30(page: Page): Promise<string> {
  await page.getByRole("button", { name: "30 minutes" }).click();
  await expect(fitLine(page)).toHaveText(FIT_PATTERN);
  const line = (await fitLine(page).textContent())!;
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(screenUF082(page)).toBeVisible();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  return line;
}

test.describe("T-0303b AC-12 UF-08.2 online", () => {
  test("T-1019 area rows match the fit line, minus then Remove removes an area, chip 20 rebuilds", async ({
    page,
  }) => {
    await openSetup(page);
    const line = await suggestAt30(page);
    const n = Number(/^Fits: (\d+) exercises?/.exec(line)![1]);
    // UF-08.2 lists areas now (D-0274): the exercises behind them add up to the fit line's count.
    const counts = await page.locator('[data-part="area-count"]').allTextContents();
    expect(counts.reduce((sum, c) => sum + Number(/^(\d+) exercise/.exec(c)![1]), 0)).toBe(n);
    await expect(areaRows(page).first().locator('[data-part="area-minutes"]')).toHaveText(
      /^~\d+ min$/,
    );

    const first = (await areaNames(page).first().textContent())!;
    const second = (await areaNames(page).nth(1).textContent())!;
    const minus = areaRows(page).nth(1).locator('[data-part="minus"]');
    while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
      await minus.click();
    await minus.click();
    await expect(areaNames(page)).not.toContainText([second]);
    expect(await areaNames(page).allTextContents()).not.toContain(second);

    await page.getByRole("button", { name: "20 minutes" }).click();
    await expect(page.getByRole("button", { name: "20 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(areaNames(page).first()).toHaveText(first);
  });
});

test.describe("T-0521 AC7 UF-08.2 Remove does not refill (GitHub #33)", () => {
  test("removing an area's last exercise on UF-08.6 drops one area and no new area appears", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const before = await areaNames(page).allTextContents();
    expect(before.length).toBeGreaterThan(1);
    const last = before.at(-1)!;
    await openArea(page, last.toLowerCase());
    // Remove every exercise of that area: UF-08.2 comes back without it and without a refill.
    while ((await screenUF086(page).isVisible()) && (await detailRows(page).count()) > 0) {
      await detailRows(page).first().locator('[data-part="remove"]').click();
    }
    await expect(screenUF082(page)).toBeVisible();
    await expect(areaRows(page)).toHaveCount(before.length - 1);
    expect(await areaNames(page).allTextContents()).toEqual(before.slice(0, -1));
  });
});

test.describe("T-0303b AC-12 UF-08.2 offline (NFR-OFF-3)", () => {
  test("offline rows equal the online ones for the same inputs; Remove works offline", async ({
    page,
    context,
  }) => {
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    await suggestAt30(page);
    const online = await allRowTexts(page);
    expect(online.length).toBeGreaterThan(0);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await allRowTexts(page)).toEqual(online);

    const second = online[1]![0]!;
    const areas = await areaNames(page).count();
    await openArea(page, (await areaRows(page).nth(1).getAttribute("data-area"))!);
    await page.getByRole("button", { name: `Remove ${second}`, exact: true }).click();
    // Offline, Remove works: the area (one exercise at 30 min) leaves UF-08.2.
    await expect(screenUF082(page)).toBeVisible();
    await expect(areaRows(page)).toHaveCount(areas - 1);
    expect((await allRowTexts(page)).map(([name]) => name)).not.toContain(second);
  });
});

test.describe("T-0581 UF-08.6 how-to sheet from the exercise row", () => {
  test("opens, axe is clean, 44px target, focus returns, plan unchanged, works offline", async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    await suggestAt30(page);
    await openArea(page);
    const before = await rowTexts(page);
    const name = before[0]![0]!;
    const button = page.getByRole("button", { name: `How to do ${name}` });
    const box = (await settledBox(button))!;
    expect(box.height).toBeGreaterThanOrEqual(44);

    await button.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog", { name: `How to: ${name}` })).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("uf08-howto-after.png") });

    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    expect(await rowTexts(page)).toEqual(before);

    await context.setOffline(true);
    await button.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });
});

test.describe("T-0303b AC-12 UF-08.2 a11y (NFR-A11Y-1/2/6)", () => {
  test("axe reports 0 serious or critical violations on UF-08.2", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("the area rows, their set controls, the 5 chips, Start workout and Back are each ≥ 44 × 44 px", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    expect(await areaRows(page).count()).toBeGreaterThan(0);
    const targets = [
      ...(await areaRows(page).locator('[data-part="area-open"]').all()),
      ...(await areaRows(page).locator('[data-part="minus"]').all()),
      ...(await areaRows(page).locator('[data-part="plus"]').all()),
      ...[20, 30, 45, 60, 90].map((m) => page.getByRole("button", { name: `${m} minutes` })),
      page.getByRole("button", { name: "Start workout" }),
      page.getByRole("link", { name: "Back" }),
    ];
    for (const target of targets) {
      const box = await settledBox(target);
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Suggest → Remove an area → Start workout", async ({ page }) => {
    await openSetup(page);
    const focused = (locator: ReturnType<Page["getByRole"]>) =>
      locator.evaluate((el) => el === document.activeElement);
    async function tabTo(locator: ReturnType<Page["getByRole"]>, label: string): Promise<void> {
      for (let i = 0; i < 40; i += 1) {
        if (await focused(locator)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${label}`);
    }

    await page.locator("body").focus();
    const suggestButton = page.getByRole("button", { name: "Suggest my workout" });
    await tabTo(suggestButton, "Suggest my workout");
    await page.keyboard.press("Enter");
    await expect(screenUF082(page)).toBeVisible();

    // The last area: its control reads Remove after the sets come down to 2 (D-0274).
    const before = await areaNames(page).allTextContents();
    const last = before.at(-1)!;
    const minus = page.locator(`[data-area="${last.toLowerCase()}"] [data-part="minus"]`);
    await tabTo(minus, `the sets control of ${last}`);
    while (
      (await minus.count()) > 0 &&
      (await minus.getAttribute("aria-label")) !== `Remove ${last}`
    ) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.press("Enter");
    await expect.poll(() => areaNames(page).allTextContents()).not.toContain(last);
    // D-0109 §6: focus lands on a control, never on the body.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

    const go = page.getByRole("button", { name: "Start workout" });
    await tabTo(go, "Start workout");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible();
  });
});

// ---- T-0303d, T-1009 UF-08.2 Start (AC-10; D-0086, D-0091 §1, D-0108, D-0110, D-0112) ----
// The spec registers its own `sessions` route after `mockSupabaseData` (the later-registered
// handler wins) to record what AutoSync upserts. Start itself makes no request (D-0110 §5): the
// row goes to IndexedDB, and the sync handle flushes it 250 ms later when online (D-0116), or on
// the `online` event when offline (D-0112 §2).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

interface SessionUpsert {
  id: string;
  time_budget_min: number;
}

/** Records every `sessions` write; reads answer `[]` as `mockSupabaseData` does. */
async function recordSessions(page: Page): Promise<SessionUpsert[][]> {
  const writes: SessionUpsert[][] = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    const body = request.postDataJSON() as SessionUpsert | SessionUpsert[];
    writes.push(Array.isArray(body) ? body : [body]);
    await route.fulfill({ status: 201, json: [] });
  });
  return writes;
}

function requestsCarrying(writes: SessionUpsert[][], id: string): SessionUpsert[][] {
  return writes.filter((rows) => rows.some((r) => r.id === id));
}

/** The app's own `wl-offline.sessions` entry for `id`, or null. */
async function storedSession(
  page: Page,
  id: string,
): Promise<{ pending: boolean; time_budget_min: number } | null> {
  return page.evaluate(async (key: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<
      { pending: boolean; row: { time_budget_min: number } } | undefined
    >((resolve, reject) => {
      const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
      get.onsuccess = () => resolve(get.result as never);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return entry ? { pending: entry.pending, time_budget_min: entry.row.time_budget_min } : null;
  }, id);
}

/** T-1009 (D-0280): UF-08.4 is gone, Start is on UF-08.2. Open its Focus mode disclosure. */
async function toReady(page: Page): Promise<void> {
  await expect(screenUF082(page)).toBeVisible();
  await page.locator('[data-part="focus-mode-summary"]').click();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
}

/** Start → `/session/<uuid v4>` with focus mode on screen. Returns the id. */
async function startWorkout(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(SESSION_URL);
  const id = SESSION_URL.exec(page.url())![1]!;
  expect(id).toMatch(UUID_V4);
  await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible();
  return id;
}

test.describe("T-0303d AC-10 UF-08.2 Start online", () => {
  test("Start → /session/<uuid>, and within 5 s, with no reload, one request sends the row", async ({
    page,
  }) => {
    const writes = await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await expect(page.locator('[data-part="done-by"]')).toHaveText(
      /^Done by \d{1,2}:\d{2}( [AP]M)?$/,
    );
    // D-0116 §6: the enqueue flush (250 ms after the IDB commit) sends the row. No reload, and
    // no IndexedDB `pending: true` read, which would race that flush.
    const tappedAt = Date.now();
    const id = await startWorkout(page);
    await expect
      .poll(() => requestsCarrying(writes, id).length, {
        timeout: Math.max(1, 5000 - (Date.now() - tappedAt)),
      })
      .toBeGreaterThanOrEqual(1);
    expect(Date.now() - tappedAt).toBeLessThan(5000);
    const carrying = requestsCarrying(writes, id);
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.find((r) => r.id === id)!.time_budget_min).toBe(30);
  });

  test("browser Back from /session/<id> never lands on UF-08.2 Start (D-0123 §2)", async ({
    page,
  }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await startWorkout(page);
    // A user activation after the guard is armed, so Chromium keeps the entry (D-0123 §3 note).
    await page.waitForFunction(() => history.state?.wlFocusGuard === true);
    await page.mouse.click(5, 300);
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page).toHaveURL(SESSION_URL);
    await page.waitForTimeout(50);
    await expect(page).not.toHaveURL(/step=ready/);
    await expect(screenUF082(page)).toHaveCount(0);
    const ids = page.locator("[data-screen-id]");
    await expect(ids).toHaveCount(1);
    expect(await ids.getAttribute("data-screen-id")).toBe("UF-09.9");
  });
});

test.describe("T-0303d AC-10 UF-08.2 Start offline (NFR-OFF-2)", () => {
  test("offline Start writes IndexedDB and navigates; going online sends it once", async ({
    page,
    context,
  }) => {
    const writes = await recordSessions(page);
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);

    // `goOffline` is registered after `recordSessions` (T-0484, D-0175 §3), so its write-abort
    // gate is the last handler on `sessions*` and wins while armed; the gate also goes offline
    // itself, so there is no window where the context is offline but `recordSessions` could still
    // fulfill a write.
    const gate = await goOffline(page, context);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(screenUF082(page)).toBeVisible();
    const id = await startWorkout(page);
    expect(await storedSession(page, id)).toEqual({ pending: true, time_budget_min: 45 });
    expect(gate.writesFulfilledOffline()).toBe(0);

    await gate.goOnline();
    await expect.poll(() => requestsCarrying(writes, id).length, { timeout: 5000 }).toBe(1);
    expect(requestsCarrying(writes, id)).toHaveLength(1);
  });
});

test.describe("T-0303d AC-10 UF-08.2 Start a11y (NFR-A11Y-1/2/6)", () => {
  test("axe reports 0 serious or critical violations on UF-08.2 with Focus mode open", async ({
    page,
  }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("Start, Back and the 3 switches are each ≥ 44 × 44 px", async ({ page }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    const targets = [
      page.getByRole("button", { name: "Start workout" }),
      page.getByRole("link", { name: "Back" }),
      // T-0599: the switch is 48 × 28 inside its label, and the label row is the 44 px target
      // (state-patterns "Toggle"); the checkbox itself is asserted to sit inside that row.
      page.locator("label.wl-toggle", { hasText: "Sound cues" }),
      page.locator("label.wl-toggle", { hasText: "Voice countdown 3-2-1" }),
      page.locator("label.wl-toggle", { hasText: "Keep screen awake" }),
    ];
    for (const target of targets) {
      const box = await settledBox(target);
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Focus mode → toggle a switch → Start workout", async ({ page }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    const focused = (locator: ReturnType<Page["getByRole"]>) =>
      locator.evaluate((el) => el === document.activeElement);
    async function tabTo(locator: ReturnType<Page["getByRole"]>, label: string): Promise<void> {
      for (let i = 0; i < 30; i += 1) {
        if (await focused(locator)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${label}`);
    }

    await page.locator("body").focus();
    const summary = page.locator('[data-part="focus-mode-summary"]');
    await tabTo(summary, "Focus mode");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-part="focus-mode"]')).toHaveJSProperty("open", true);

    const voice = page.getByRole("checkbox", { name: "Voice countdown 3-2-1" });
    await tabTo(voice, "Voice countdown 3-2-1");
    await page.keyboard.press("Space");
    await expect(voice).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("wl-focus-prefs"))).toBe(
      '{"version":1,"sound":true,"voice":false,"keepAwake":true}',
    );

    const start = page.getByRole("button", { name: "Start workout" });
    await tabTo(start, "Start workout");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible();
  });
});

// ---- T-0393 UF-08.2 a loaded library renders a kg weight (D-0071 §10, D-0086, D-0108, D-0109) ----
// Same seed as above (FULL-equipment `profileRow`, F-targets, `mockProfilePresent`), with
// `exercisesLoaded` in place of `exercises`. Each case re-registers `mockSupabaseData` in its
// body; the later-registered page route wins over the file's `beforeEach`. The AC1 case only
// reads the fixture module: it never touches `page` beyond the file-level `beforeEach`.

const LOADED_IDS = [
  "back-squat",
  "romanian-deadlift",
  "hip-thrust",
  "leg-extension",
  "leg-curl",
  "calf-raise",
  "bench-press",
  "db-bench-press",
  "overhead-press",
  "lateral-raise",
  "barbell-row",
  "db-row",
  "lat-pulldown",
  "seated-cable-row",
  "straight-arm-pulldown",
  "biceps-curl",
  "goblet-squat",
  "leg-press",
];
const UNLOADED_IDS = [
  "push-up",
  "inverted-row",
  "pull-up",
  "plank",
  "dead-bug",
  "hanging-knee-raise",
  "wu-scap-push-up",
  "wu-arm-circle",
  "wu-band-pull-apart",
  "wu-cat-cow",
  "wu-bodyweight-squat",
  "wu-leg-swing",
  "wu-jumping-jack",
  "wu-march-in-place",
];

/** `exercisesLoaded` by its display `name` (UF-08.2 rows render the library `name`). */
function loadedByName(name: string): Record<string, unknown> {
  const row = exercisesLoaded.find((e) => e.name === name);
  if (!row) throw new Error(`no exercisesLoaded row is named "${name}"`);
  return row;
}

// D-0124: T-0391 moves the UF-08.2 weight to `formatKg` (U+00A0 before `kg`). Main today renders
// a plain space, so the kg literal accepts either separator, and the "no kg" check below looks
// for `kg` itself rather than " kg", so it cannot pass vacuously after T-0391.
const KG_42_5 = /42\.5[ \u00A0]kg/;
const KG_ROW = / · 42\.5[ \u00A0]kg · \d+ min$/;

/**
 * AC3's history: one session 3 days ago, 3 hard sets of 42.5 kg × 7 for every loaded exercise
 * (the `uf-02-today.spec.ts` sets-row shape). `completed_at` is relative to `Date.now()`
 * (D-0108 §4), so it stays inside the 14-day window and outside rule 6's 48 h recovery span.
 */
function loadedSets(): Record<string, unknown>[] {
  const completedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  return LOADED_IDS.flatMap((exerciseId) =>
    Array.from({ length: 3 }, (_, i) => ({
      client_id: `t0393-${exerciseId}-${i}`,
      session_id: "T0393-S1",
      exercise_id: exerciseId,
      is_warmup: false,
      completed_at: completedAt,
      edited_at: completedAt,
      deleted_at: null,
      reps: 7,
      weight_kg: 42.5,
      duration_s: null,
    })),
  );
}

async function seedLoaded(page: Page, sets: unknown[]): Promise<void> {
  await mockSupabaseData(page, {
    sets,
    exercises: exercisesLoaded,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
}

test.describe("T-0393 UF-08.2 loaded library (D-0044, D-0109 §4)", () => {
  test("T-0393 AC1 exercisesLoaded equals exercises apart from external_load", () => {
    expect(exercisesLoaded.length).toBe(exercises.length);
    exercisesLoaded.forEach((row, i) => {
      const { external_load: _loaded, ...rest } = row;
      const { external_load: _old, ...restOld } = exercises[i]!;
      expect(rest).toEqual(restOld);
    });
    const loaded = exercisesLoaded.filter((e) => e.external_load === true).map((e) => e.id);
    expect([...loaded].sort()).toEqual([...LOADED_IDS].sort());
    const unloaded = exercisesLoaded.filter((e) => e.external_load === false).map((e) => e.id);
    expect([...unloaded].sort()).toEqual([...UNLOADED_IDS].sort());
    expect(LOADED_IDS.length + UNLOADED_IDS.length).toBe(exercises.length);
    for (const row of exercises) expect(row.external_load).toBe(false);
  });

  test("T-0393 AC2 zero history: Bodyweight exactly on unloaded rows, and no kg", async ({
    page,
  }) => {
    await seedLoaded(page, []);
    await openSetup(page);
    await suggestAt30(page);
    const rows = await allRowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    // Rule 14.1: no history gives a loaded exercise a null weight, and a bodyweight one 0.
    expect(rows.some(([name]) => loadedByName(name!).external_load === true)).toBe(true);
    for (const [name, detail] of rows) {
      const bodyweight = loadedByName(name!).external_load === false;
      expect(detail!.includes("Bodyweight"), `${name}: ${detail}`).toBe(bodyweight);
      expect(detail, name).not.toMatch(/kg/);
      expect(detail, name).toMatch(DETAIL_PATTERN);
    }
  });

  test("T-0393 AC3 one session at 42.5 kg × 7: every loaded row shows 42.5 kg", async ({
    page,
  }) => {
    await seedLoaded(page, loadedSets());
    await openSetup(page);
    await suggestAt30(page);
    const rows = await allRowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    // Rule 14 per slot (build_muscle, rule 7.2): main lift 6–8, other compounds 8–12, isolation
    // 10–15. Gap 3 days < 10, so rules 14.2/14.3 don't apply. 7 < every high (8, 12, 15), so
    // 14.4 `increase` doesn't apply; one session only, so 14.5 `deload` doesn't. Main lift:
    // 7 ≥ low 6 → 14.7 `add_rep` (W × 8). Other compound: 7 < low 8 → 14.6 `hold` (W × 8).
    // Isolation: 7 < low 10 → 14.6 `hold` (W × 10). Every branch keeps W = 42.5.
    expect(rows.some(([, detail]) => KG_ROW.test(detail!))).toBe(true);
    for (const [name, detail] of rows) {
      const loaded = loadedByName(name!).external_load === true;
      if (loaded) expect(detail, name).toMatch(KG_ROW);
      else {
        expect(detail, name).toContain("Bodyweight");
        expect(detail, name).not.toMatch(KG_42_5);
      }
      expect(detail, name).toMatch(DETAIL_PATTERN);
    }
  });

  test("T-0393 AC4 offline rows equal the online ones, kg text included (NFR-OFF-3)", async ({
    page,
    context,
  }) => {
    await seedLoaded(page, loadedSets());
    await openSetup(page);
    await expect
      .poll(() => cachedCounts(page))
      .toEqual({ library: exercisesLoaded.length, targets: 9 });
    await precacheSettled(page);
    await suggestAt30(page);
    const online = await allRowTexts(page);
    expect(online.some(([, detail]) => KG_ROW.test(detail!))).toBe(true);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await allRowTexts(page)).toEqual(online);
  });
});

// ---- T-0412 UF-08.2 / UF-09.3 a loaded main lift renders its 14.7 add_rep pre-fill ----
// (D-0071, D-0086, D-0108, D-0044, D-0109, D-0124.) T-0393's seed (FULL-equipment `profileRow`,
// F-targets, `mockProfilePresent`, `exercisesLoaded`) with `mainSeed` as the history. Every
// `completed_at` is relative to `Date.now()` (D-0108 §4).

/**
 * `mainSeed`, derived by hand (engine rules 3, 6, 7.2, 14; F-targets):
 *
 * - Session T0412-M, 7 days ago: bench-press 3 × 42.5 kg × 6. Session T0412-R, 3 days ago:
 *   back-squat × 4, barbell-row × 4, overhead-press × 3, leg-curl × 3, calf-raise × 3,
 *   plank × 3 (bodyweight, 45 s). Both are inside the 14-day window (rule 3), and both are
 *   more than 48 h old, so no area is recovering (rule 6).
 * - Rule 3 loads / targets → r: chest 3/20 = 0.15; back 4/20 = 0.20; shoulders
 *   (1.5 + 3)/16 = 0.28; arms (1.5 + 2 + 1.5)/12 = 0.42; core (2 + 1.5 + 3)/12 = 0.54;
 *   glutes 4/20 = 0.20; quads 4/20 = 0.20; hamstrings (2 + 3)/16 = 0.31; calves 3/12 = 0.25.
 *   Chest has the lowest r, so rule 7.2 step 1 takes chest's top compound candidate.
 * - Chest compounds: bench-press, db-bench-press, push-up. The most recent session with hard
 *   sets is T0412-R (rank 1), and none of them is in it, so rank (1) ties. Rank (2) gap fit
 *   (deficit = 1 − r): bench-press and db-bench-press 0.85 + 0.5 × 0.72 + 0.5 × 0.58 = 1.50;
 *   push-up 0.85 + 0.5 × 0.58 + 0.5 × 0.46 = 1.37 (plank keeps core's deficit low). Rank (3)
 *   id ascending: bench-press before db-bench-press. M = bench-press, loaded, 4 sets
 *   (4 × 165 + 60 = 720 s ≤ 1620 s available at 30 min with the warm-up).
 * - Rule 14 for M: last performance is T0412-M, W = 42.5, minReps 6, gap 7 < 10 (14.2/14.3 no);
 *   build_muscle main slot 6–8: 6 < high 8, so no 14.4 `increase`; one session at W, so no
 *   14.5 `deload`; 6 ≥ low 6, so no 14.6 `hold`; 14.7 `add_rep` → 42.5 × min(8, 6 + 1) = 7.
 */
function mainSeed(): Record<string, unknown>[] {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const rows: Record<string, unknown>[] = [];
  const add = (
    sessionId: string,
    days: number,
    exerciseId: string,
    count: number,
    set: { reps: number | null; weight_kg: number | null; duration_s: number | null },
  ) => {
    const completedAt = at(days);
    for (let i = 0; i < count; i += 1) {
      rows.push({
        client_id: `t0412-${exerciseId}-${i}`,
        session_id: sessionId,
        exercise_id: exerciseId,
        is_warmup: false,
        completed_at: completedAt,
        edited_at: completedAt,
        deleted_at: null,
        ...set,
      });
    }
  };
  add("T0412-M", 7, "bench-press", 3, { reps: 6, weight_kg: 42.5, duration_s: null });
  const lifted = { reps: 10, weight_kg: 40, duration_s: null };
  add("T0412-R", 3, "back-squat", 4, lifted);
  add("T0412-R", 3, "barbell-row", 4, lifted);
  add("T0412-R", 3, "overhead-press", 3, lifted);
  add("T0412-R", 3, "leg-curl", 3, lifted);
  add("T0412-R", 3, "calf-raise", 3, lifted);
  add("T0412-R", 3, "plank", 3, { reps: null, weight_kg: 0, duration_s: 45 });
  return rows;
}

const MAIN_NAME = "Bench press";
const MAIN_DETAIL = /^4 × 6–8 · 42\.5\u00a0kg · \d+ min$/;

test.describe("T-0412 UF-08.2 loaded main lift with history (D-0071 §10, D-0109)", () => {
  test("T-0412 AC1 mainSeed names a loaded compound M with 3 × 42.5 kg × 6, 3–9 days ago", () => {
    const m = exercisesLoaded.find((e) => e.name === MAIN_NAME)!;
    expect(m).toBeDefined();
    expect(m.id).toBe("bench-press");
    expect(m.external_load).toBe(true);
    const mine = mainSeed().filter((s) => s.exercise_id === m.id);
    expect(mine).toHaveLength(3);
    for (const s of mine) {
      expect(s).toMatchObject({ reps: 6, weight_kg: 42.5, is_warmup: false });
      const days = (Date.now() - Date.parse(s.completed_at as string)) / 86_400_000;
      expect(days).toBeGreaterThanOrEqual(3);
      expect(days).toBeLessThanOrEqual(9);
    }
  });

  test("T-0412 AC2 UF-08.6 main row is M at 4 × 6–8 · 42.5 kg", async ({ page }) => {
    await seedLoaded(page, mainSeed());
    await openSetup(page);
    await suggestAt30(page);
    const rows = await allRowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    const [name, detail] = rows[0]!;
    expect(name).toBe(MAIN_NAME);
    expect(loadedByName(name!).external_load).toBe(true);
    expect(detail).toMatch(MAIN_DETAIL);
    for (const [n, d] of rows) expect(d, n).toMatch(DETAIL_PATTERN);
  });

  test("T-0412 AC3 UF-09.3 shows the add_rep pre-fill 42.5 kg × 7 for M's first set", async ({
    page,
  }) => {
    await seedLoaded(page, mainSeed());
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await startWorkout(page);
    await page
      .locator('[data-screen-id="UF-09.1"]')
      .getByRole("button", { name: "Skip warm-up" })
      .click();
    const current = page.locator('[data-screen-id="UF-09.3"]');
    await expect(current).toBeVisible();
    await expect(current.getByRole("heading", { level: 1, name: MAIN_NAME })).toBeVisible();
    await expect(current.getByText("Lifting · set 1 of 4")).toBeVisible();
    // 7 reps is 14.7 `add_rep`: 14.6 `hold` would show 6, 14.4 `increase` 45 kg.
    await expect(current.locator(".wl-uf09__load")).toHaveText("42.5 kg × 7");
  });

  test("T-0412 AC4 offline rows equal the online ones, main kg text included (NFR-OFF-3)", async ({
    page,
    context,
  }) => {
    await seedLoaded(page, mainSeed());
    await openSetup(page);
    await expect
      .poll(() => cachedCounts(page))
      .toEqual({ library: exercisesLoaded.length, targets: 9 });
    await precacheSettled(page);
    await suggestAt30(page);
    const online = await allRowTexts(page);
    expect(online[0]![0]).toBe(MAIN_NAME);
    expect(online[0]![1]).toMatch(MAIN_DETAIL);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await allRowTexts(page)).toEqual(online);
  });
});

// ---- T-0303c UF-08.3 Swap before starting (AC-9) ----

const screenUF051 = (page: Page) => page.locator('[data-screen-id="UF-05.1"]');

/** The plan's exercise ids in the app's own `wl-offline.sessions` entry for `id`. */
async function storedPlanIds(page: Page, id: string): Promise<string[]> {
  return page.evaluate(async (key: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: { plan: { items: { exerciseId: string }[] } } }>(
      (resolve, reject) => {
        const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
        get.onsuccess = () => resolve(get.result as never);
        get.onerror = () => reject(get.error);
      },
    );
    db.close();
    return entry.row.plan.items.map((i) => i.exerciseId);
  }, id);
}

test.describe("T-0303c AC-9 UF-08.3 swap before starting", () => {
  test("Swap an exercise on UF-08.6, apply the first candidate, then start with the new exercise", async ({
    page,
  }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page, "back");
    const before = await detailNames(page).allTextContents();
    expect(before.length).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: `Swap ${before[0]!}` }).click();
    await expect(page).toHaveURL(/\/session\/setup\?step=swap&item=\d+$/);
    await expect(screenUF051(page)).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);

    await page.getByRole("radio", { name: "Variety" }).check();
    const use = page.getByRole("button", { name: /^Use / });
    await expect(use).toBeVisible();
    const picked = (await use.textContent())!.replace(/^Use /, "");
    await use.click();

    await expect(screenUF086(page)).toBeVisible();
    await expect(page).toHaveURL(/\/session\/setup\?step=area&area=back$/);
    const after = await detailNames(page).allTextContents();
    expect(after[0]).toBe(picked);
    expect(after[0]).not.toBe(before[0]);

    await page.getByRole("link", { name: "Back" }).click();
    await expect(screenUF082(page)).toBeVisible();
    const id = await startWorkout(page);
    const ids = await storedPlanIds(page, id);
    expect(ids).toContain(picked.toLowerCase().replace(/[ ]/g, "-"));
    expect(ids).not.toContain(before[0]!.toLowerCase().replace(/[ ]/g, "-"));
  });

  test("axe reports 0 serious or critical violations on the sheet", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    await page.locator('[data-part="swap"]').first().click();
    await expect(screenUF051(page)).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Replacement" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("every Swap button is at least 44 x 44 px", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    const buttons = page.locator('[data-part="swap"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await settledBox(buttons.nth(i));
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Swap, a reason chip, Use", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    const before = await detailNames(page).allTextContents();
    async function tabTo(locator: ReturnType<Page["getByRole"]>, label: string): Promise<void> {
      for (let i = 0; i < 40; i += 1) {
        if (await locator.evaluate((el) => el === document.activeElement)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${label}`);
    }
    await page.locator("body").focus();
    await tabTo(page.locator('[data-part="swap"]').first(), "Swap");
    await page.keyboard.press("Enter");
    await expect(screenUF051(page)).toBeVisible();
    // A radio group is one tab stop (the checked chip); arrows move within it.
    await tabTo(page.getByRole("radio", { name: "Best match", exact: true }), "Best match");
    const variety = page.getByRole("radio", { name: "Variety" });
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    await expect(variety).toBeChecked();
    const use = page.getByRole("button", { name: /^Use / });
    await expect(use).toBeVisible();
    const picked = (await use.textContent())!.replace(/^Use /, "");
    await tabTo(use, "Use");
    await page.keyboard.press("Enter");
    await expect(screenUF086(page)).toBeVisible();
    expect((await detailNames(page).allTextContents())[0]).toBe(picked);
    expect(picked).not.toBe(before[0]);
  });
});

test.describe("T-0520 UF-08.1 Skip today (D-0191, GitHub #33)", () => {
  test("Quads and Glutes skipped: no row has them as primary, the line shows, axe is clean", async ({
    page,
  }) => {
    await openSetup(page);
    const group = page.getByRole("group", { name: "Skip today" });
    await expect(group.getByRole("button")).toHaveCount(9);
    await group.getByRole("button", { name: "Quads" }).click();
    await group.getByRole("button", { name: "Glutes" }).click();
    await expect(group.getByRole("button", { name: "Quads" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const b of await group.getByRole("button").all()) {
      const box = (await settledBox(b))!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);

    await suggestAt30(page);
    await expect(page.locator('[data-part="skipping"]')).toHaveText(
      "Skipping today: Glutes, Quads",
    );
    const skipped = new Set(
      exerciseAreas
        .filter((r) => (r.area_id === "quads" || r.area_id === "glutes") && r.weight === 1)
        .map((r) => r.exercise_id),
    );
    const skippedNames = new Set(
      exercises.filter((e) => skipped.has(e.id)).map((e) => e.name as string),
    );
    const names = (await allRowTexts(page)).map(([name]) => name!);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(skippedNames.has(n)).toBe(false);
    // No area row is a skipped area either (UF-08.2 lists areas, D-0274).
    const listed = await areaNames(page).allTextContents();
    expect(listed).not.toContain("Quads");
    expect(listed).not.toContain("Glutes");
  });
});

// ---- T-0599 UF-08.1, UF-08.2 Cobalt plan restyle (D-0208, D-0211, D-0213) ----
// Expected values come from tokens.json, never typed.
type Colours = Record<string, string>;
const tokens = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Colours } };
const plan = tokens.color.plan;
const rgb = (hex: string): string => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
};
const TRANSPARENT = "rgba(0, 0, 0, 0)";

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
/** WCAG ratio of two computed `rgb(r, g, b)` strings. */
function ratio(a: string, b: string): number {
  const lum = (css: string) => {
    const [r, g, bl] = css
      .match(/\d+(\.\d+)?/g)!
      .slice(0, 3)
      .map(Number) as [number, number, number];
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

interface Pair {
  text: string;
  fg: string;
  bg: string;
}
/** Every visible text node's colour on its effective background, from the real computed styles. */
async function textPairs(page: Page): Promise<Pair[]> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-screen-id]")!;
    const bgOf = (el: Element): string => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const out: { text: string; fg: string; bg: string }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent!.trim();
      const el = n.parentElement!;
      if (!text || el.closest("[aria-hidden='true']") || el.closest("svg")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || el.getClientRects().length === 0) {
        continue;
      }
      out.push({ text, fg: cs.color, bg: bgOf(el) });
    }
    return out;
  });
}

const cssOf = (page: Page, selector: string, props: string[]): Promise<string[]> =>
  page.evaluate(
    ([sel, ps]) => {
      const cs = getComputedStyle(document.querySelector(sel as string)!);
      return (ps as string[]).map((p) => cs.getPropertyValue(p));
    },
    [selector, props] as const,
  );

const themeColor = (page: Page) =>
  page.evaluate(
    () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
  );

test.describe("T-0599 plan restyle at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 UF-08.1 (zero history): plan state, plan.bg, theme-color, 28 px gutter, unboxed card", async ({
    page,
  }) => {
    await openSetup(page);
    const root = screenUF081(page);
    await expect(root).toHaveAttribute("data-wl-state", "plan");
    expect((await cssOf(page, '[data-screen-id="UF-08.1"]', ["background-color"]))[0]).toBe(
      rgb(plan.bg!),
    );
    expect((await cssOf(page, '[data-screen-id="UF-08.1"]', ["padding-left"]))[0]).toBe("28px");
    await expect.poll(() => themeColor(page)).toBe(plan.bg);
    // Load order must not box the card or the rows (D-0208 §3).
    expect(
      await cssOf(page, ".wl-card", ["padding-top", "border-top-width", "background-color"]),
    ).toEqual(["0px", "0px", TRANSPARENT]);
  });

  test("AC1 UF-08.2 Start: plan state, plan.bg, theme-color, 28 px gutter", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await expect(page.locator('[data-screen-id="UF-08.2"]')).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
    const sel = '[data-screen-id="UF-08.2"]';
    expect(await cssOf(page, sel, ["background-color", "padding-left"])).toEqual([
      rgb(plan.bg!),
      "28px",
    ]);
    await expect.poll(() => themeColor(page)).toBe(plan.bg);
    expect(
      await cssOf(page, ".wl-card", ["padding-top", "border-top-width", "background-color"]),
    ).toEqual(["0px", "0px", TRANSPARENT]);
  });

  test("AC7 a returning user (history) renders in plan with a fit line", async ({ page }) => {
    const completedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await mockSupabaseData(page, {
      sets: Array.from({ length: 5 }, (_, i) => ({
        client_id: `t0599-squat-${i}`,
        session_id: "S1",
        exercise_id: "back-squat",
        is_warmup: false,
        completed_at: completedAt,
        edited_at: completedAt,
        deleted_at: null,
        reps: 8,
        weight_kg: 60,
        duration_s: null,
      })),
      exercises,
      exerciseAreas,
      areaTargets: AREA_TARGETS,
      profile: profileRow,
    });
    await openSetup(page);
    await expect(screenUF081(page)).toHaveAttribute("data-wl-state", "plan");
    expect((await cssOf(page, '[data-screen-id="UF-08.1"]', ["background-color"]))[0]).toBe(
      rgb(plan.bg!),
    );
  });

  test("AC7 offline from the cached plan: UF-08.1 renders in plan", async ({ page, context }) => {
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    await context.setOffline(true);
    await page.reload();
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await expect(screenUF081(page)).toHaveAttribute("data-wl-state", "plan");
    expect((await cssOf(page, '[data-screen-id="UF-08.1"]', ["background-color"]))[0]).toBe(
      rgb(plan.bg!),
    );
    await expect.poll(() => themeColor(page)).toBe(plan.bg);
  });

  test("AC2 the stepper and keys change the minutes; the selected quick pick is plan.selected", async ({
    page,
  }) => {
    await openSetup(page);
    const pick = (m: number) => page.getByRole("button", { name: `${m} minutes` });
    const fill = (m: number) =>
      pick(m).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    expect(await fill(45)).toEqual([rgb(plan.selected!), rgb(plan["on-selected"]!)]);
    expect((await fill(30))[0]).toBe(TRANSPARENT);
    await pick(30).click();
    expect(await fill(30)).toEqual([rgb(plan.selected!), rgb(plan["on-selected"]!)]);
    expect((await fill(45))[0]).toBe(TRANSPARENT);
    const more = page.getByRole("button", { name: "5 minutes more" });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-part="minutes"]')).toHaveText("35");
    await page.keyboard.press("Space");
    await expect(page.locator('[data-part="minutes"]')).toHaveText("40");
    // The minutes are the hero: far larger than the 1.0625 rem body.
    const size = await page
      .locator('[data-part="minutes"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(96);
  });

  test("AC2 the time control is first in tab order, after Close (principle 2)", async ({
    page,
  }) => {
    await openSetup(page);
    const tabbed: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      tabbed.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.textContent ??
            "",
        ),
      );
    }
    expect(tabbed).toEqual(["Close", "5 minutes less", "5 minutes more"]);
  });

  test("AC3 Skip today chip: pressed is a plan.selected fill with a visible tick, unpressed is transparent with none", async ({
    page,
  }) => {
    await openSetup(page);
    const quads = page.getByRole("button", { name: "Quads", exact: true });
    const read = () =>
      quads.evaluate((el) => {
        const tick = el.querySelector(".wl-chip__tick")!;
        const box = tick.getBoundingClientRect();
        return {
          bg: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          tickDisplay: getComputedStyle(tick).display,
          tickWidth: box.width,
          pressed: el.getAttribute("aria-pressed"),
        };
      });
    const off = await read();
    expect(off.pressed).toBe("false");
    expect(off.bg).toBe(TRANSPARENT);
    expect(off.tickDisplay).toBe("none");
    await quads.click();
    const on = await read();
    expect(on.pressed).toBe("true");
    expect(on.bg).toBe(rgb(plan.selected!));
    expect(on.color).toBe(rgb(plan["on-selected"]!));
    expect(on.tickDisplay).not.toBe("none");
    expect(on.tickWidth).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "Quads", exact: true, pressed: true }),
    ).toHaveCount(1);
  });

  test("AC4 toggles: the warm-up switch is a checkbox whose track follows the state; Ready's three too", async ({
    page,
  }) => {
    await openSetup(page);
    const box = page.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" });
    const track = () =>
      box.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, border: cs.borderTopColor, w: cs.width, h: cs.height };
      });
    expect(await track()).toEqual({
      bg: rgb(plan.selected!),
      border: rgb(plan.selected!),
      w: "48px",
      h: "28px",
    });
    await box.click();
    await page.mouse.move(0, 0);
    await expect(box).not.toBeChecked();
    expect(await track()).toEqual({
      bg: TRANSPARENT,
      border: rgb(plan["ink-muted"]!),
      w: "48px",
      h: "28px",
    });
    await box.click();
    await suggestAt30(page);
    await toReady(page);
    for (const name of ["Sound cues", "Voice countdown 3-2-1", "Keep screen awake"]) {
      const sw = page.getByRole("checkbox", { name });
      expect((await sw.evaluate((el) => getComputedStyle(el).width)) as string).toBe("48px");
    }
  });

  test("AC5 contrast on UF-08.1: every text pair, the named pairs, and axe colour-contrast", async ({
    page,
  }) => {
    await openSetup(page);
    // The error line, shown: a time earlier than now.
    await page.getByRole("button", { name: "Set a finish time" }).click();
    await page.getByLabel("Finish by").fill("00:01");
    const error = page.getByText("Pick a time later today");
    await expect(error).toBeVisible();
    await page.getByRole("button", { name: "Quads", exact: true }).click();
    const pairs = await textPairs(page);
    expect(pairs.length).toBeGreaterThan(15);
    for (const p of pairs) {
      expect(ratio(p.fg, p.bg), `${p.text}: ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const pair = (text: string | RegExp) =>
      pairs.find((p) => (typeof text === "string" ? p.text === text : text.test(p.text)))!;
    const primary = pair("Suggest my workout");
    expect([primary.fg, primary.bg]).toEqual([rgb(plan["on-action"]!), rgb(plan.action!)]);
    expect(oneDecimal(ratio(primary.fg, primary.bg))).toBeGreaterThanOrEqual(8.6);
    for (const label of ["Finish by", "How's your energy?", "Skip today", /^done by /, "minutes"]) {
      const p = pair(label);
      if (!p) continue;
      expect([p.fg, p.bg], String(label)).toEqual([rgb(plan["ink-muted"]!), rgb(plan.bg!)]);
      expect(oneDecimal(ratio(p.fg, p.bg)), String(label)).toBeGreaterThanOrEqual(5.9);
    }
    const err = pair("Pick a time later today");
    expect([err.fg, err.bg]).toEqual([rgb(plan.attention!), rgb(plan.bg!)]);
    expect(oneDecimal(ratio(err.fg, err.bg))).toBeGreaterThanOrEqual(5.0);
    const selected = pair("Quads");
    expect([selected.fg, selected.bg]).toEqual([rgb(plan["on-selected"]!), rgb(plan.selected!)]);
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations).toEqual([]);
    // Hidden: the error line is gone once a valid time is picked.
    await page.getByLabel("Finish by").fill("23:59");
    await expect(error).toHaveCount(0);
  });

  test("AC5 contrast on UF-08.2 with Focus mode open: every text pair and axe colour-contrast", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    const pairs = await textPairs(page);
    expect(pairs.length).toBeGreaterThan(10);
    for (const p of pairs) {
      expect(ratio(p.fg, p.bg), `${p.text}: ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const start = pairs.find((p) => p.text === "Start workout")!;
    expect([start.fg, start.bg]).toEqual([rgb(plan["on-action"]!), rgb(plan.action!)]);
    expect(oneDecimal(ratio(start.fg, start.bg))).toBeGreaterThanOrEqual(8.6);
    const body = pairs.find(
      (p) => p.text === "The current set, its weight and reps. Nothing else.",
    )!;
    expect([body.fg, body.bg]).toEqual([rgb(plan["ink-muted"]!), rgb(plan.bg!)]);
    expect(oneDecimal(ratio(body.fg, body.bg))).toBeGreaterThanOrEqual(5.9);
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations).toEqual([]);
    await expect(page.locator(".wl-uf08__error")).toHaveCount(0);
    expect(await page.locator(".wl-button--primary").count()).toBe(1);
  });

  test("AC5 exactly one .wl-button--primary on UF-08.1", async ({ page }) => {
    await openSetup(page);
    await expect(page.locator(".wl-button--primary")).toHaveCount(1);
  });

  test("AC6 every control on UF-08.1 is at least 44 x 44, each chip included", async ({ page }) => {
    await openSetup(page);
    await page.getByRole("button", { name: "Set a finish time" }).click();
    const controls = [
      page.getByRole("link", { name: "Close" }),
      page.getByRole("button", { name: "5 minutes less" }),
      page.getByRole("button", { name: "5 minutes more" }),
      ...[20, 30, 45, 60, 90].map((m) => page.getByRole("button", { name: `${m} minutes` })),
      page.getByLabel("Finish by"),
      page.locator("label.wl-toggle"),
      ...["Low", "Normal", "High"].map((n) =>
        page.locator("label", { has: page.getByRole("radio", { name: n }) }),
      ),
      ...[
        "Chest",
        "Back",
        "Shoulders",
        "Arms",
        "Core",
        "Glutes",
        "Quads",
        "Hamstrings",
        "Calves",
      ].map((n) => page.getByRole("button", { name: n, exact: true })),
      page.getByRole("button", { name: "Suggest my workout" }),
    ];
    for (const control of controls) {
      const box = await settledBox(control);
      expect(box, String(control)).not.toBeNull();
      expect(box!.width, String(control)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(control)).toBeGreaterThanOrEqual(44);
    }
  });

  test("AC5 contrast: disabled Suggest (Checking), disabled steppers at the limits", async ({
    page,
  }) => {
    await openSetup(page);
    const less = page.getByRole("button", { name: "5 minutes less" });
    for (let i = 0; i < 12; i += 1) await less.click({ force: true });
    await expect(less).toHaveAttribute("aria-disabled", "true");
    // The Checking state is brief, so the same attribute-driven rule is forced on the real button.
    await page.evaluate(() => {
      document.querySelector('[data-part="fit-line"]')!.textContent = "Checking what fits…";
      document.querySelector(".wl-button--primary")!.setAttribute("aria-disabled", "true");
    });
    const sugg = await page
      .getByRole("button", { name: "Suggest my workout" })
      .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    expect(sugg).toEqual([rgb(plan.ink!), rgb(plan.raise!)]);
    expect(oneDecimal(ratio(sugg[0]!, sugg[1]!))).toBeGreaterThanOrEqual(6.2);
    const step = await less.evaluate((el) => [getComputedStyle(el).color]);
    expect(oneDecimal(ratio(step[0]!, rgb(plan.bg!)))).toBeGreaterThanOrEqual(5.9);
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations).toEqual([]);
  });

  test("AC5 contrast: the UF-08.2 start-failed alert is plan.attention on plan.bg", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.setAttribute("role", "alert");
      p.className = "wl-input__error wl-uf08__error";
      p.textContent = "Couldn't start the workout. Try again.";
      document.querySelector(".wl-button--primary")!.before(p);
    });
    const pairs = await textPairs(page);
    const err = pairs.find((p) => p.text.startsWith("Couldn't start"))!;
    expect([err.fg, err.bg]).toEqual([rgb(plan.attention!), rgb(plan.bg!)]);
    expect(oneDecimal(ratio(err.fg, err.bg))).toBeGreaterThanOrEqual(5.0);
  });

  test("AC6 motion: the only transition is the state cross-fade, instant under reduced motion", async ({
    page,
  }) => {
    await openSetup(page);
    const read = () =>
      page.evaluate(() => {
        const dur = (el: Element) => getComputedStyle(el).transitionDuration;
        const root = document.querySelector('[data-screen-id="UF-08.1"]')!;
        const controls = [
          ...root.querySelectorAll(
            ".wl-chip, .wl-uf08__step, .wl-button--primary, .wl-toggle > input, .wl-segmented > label",
          ),
        ];
        return { root: dur(root), controls: [...new Set(controls.map(dur))] };
      });
    expect(await read()).toEqual({ root: "0.2s", controls: ["0s"] });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read()).toEqual({ root: "0s", controls: ["0s"] });
  });

  test("AC7 'Nothing fits' is a plain line in plan ink, not an error", async ({ page }) => {
    await openSetup(page);
    for (const n of [
      "Chest",
      "Back",
      "Shoulders",
      "Arms",
      "Core",
      "Glutes",
      "Quads",
      "Hamstrings",
      "Calves",
    ]) {
      await page.getByRole("button", { name: n, exact: true }).click();
    }
    await expect(fitLine(page)).toHaveText(/^Nothing fits in \d+ min$/);
    const [color] = await cssOf(page, '[data-part="fit-line"]', ["color"]);
    expect(color).toBe(rgb(plan.ink!));
    expect(color).not.toBe(rgb(plan.attention!));
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});

// ---- T-0599 AC8: canvas compare at 390 x 844 (WL_CANVAS_COMPARE=1; skipped otherwise) ----
test.describe("T-0599 AC8 canvas compare at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Set up · time and energy, with two areas skipped", async ({ page }, testInfo) => {
    await openSetup(page);
    await page.getByRole("button", { name: "Quads", exact: true }).click();
    await page.getByRole("button", { name: "Hamstrings", exact: true }).click();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "set-up-time-and-energy-app-full.png"),
      fullPage: true,
    });
    await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Set up · time and energy" });
  });

  test("Set up · ready", async ({ page }, testInfo) => {
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "set-up-ready-app-full.png"),
      fullPage: true,
    });
    await compareWithCanvas(page, testInfo, { turn: "turn-5", frame: "Set up · ready" });
  });
});

// ---- T-0600 UF-08.2 Your workout and UF-08.5 Add exercise (D-0208, D-0210, D-0211 §5, D-0216) ----
// T-0625 retired the Chalk & Iron keys from tokens.json; the "never a legacy colour" checks read
// them from the frozen pre-Cobalt snapshot.
const legacyTokens = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../packages/design-tokens/test/fixtures/tokens.before-T-0587.json"),
    "utf8",
  ),
) as { color: Record<string, string> };

const SEL_082 = '[data-screen-id="UF-08.2"]';
const sheetOf = (page: Page) => page.locator('[data-screen-id="UF-08.5"]');
const openSheet = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Add exercise" }).click();
  await expect(sheetOf(page)).toBeVisible();
};

/** Every colour a node under `sel` computes (text, fill, borders, outline), as a flat list. */
async function computedColours(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((root) => {
    const out = new Set<string>();
    for (const el of document.querySelectorAll(`${root}, ${root} *, .wl-sheet-scrim`)) {
      const cs = getComputedStyle(el);
      for (const p of [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderBottomColor",
      ] as const) {
        out.add(cs[p]);
      }
      if (cs.outlineStyle !== "none") out.add(cs.outlineColor);
    }
    return [...out];
  }, sel);
}

test.describe("T-0600 UF-08.2, UF-08.6, UF-08.5 plan restyle at 390 x 844 (T-1019: area plan, D-0274)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1 UF-08.2 is plan: plan.bg, theme-color; the open sheet keeps theme-color, 28px radii, 45% scrim", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    await expect(screenUF082(page)).toHaveAttribute("data-wl-state", "plan");
    expect((await cssOf(page, SEL_082, ["background-color"]))[0]).toBe(rgb(plan.bg!));
    await expect.poll(() => themeColor(page)).toBe(plan.bg);
    await openArea(page);
    await expect(screenUF086(page)).toHaveAttribute("data-wl-state", "plan");
    await openSheet(page);
    const sheet = '[data-screen-id="UF-08.5"]';
    await expect(sheetOf(page)).toHaveAttribute("data-wl-state", "plan");
    const [tl, tr, bl, br] = await cssOf(page, sheet, [
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-left-radius",
      "border-bottom-right-radius",
    ]);
    expect([tl, tr, bl, br]).toEqual(["28px", "28px", "0px", "0px"]);
    const scrim = await cssOf(page, ".wl-sheet-scrim", ["background-color"]);
    expect(scrim[0]).toMatch(/\/ 0\.45\)$/);
    await expect.poll(() => themeColor(page)).toBe(plan.bg);
    // The sheet paints plan.bg itself, so it needs no cross-fade.
    expect((await cssOf(page, sheet, ["background-color"]))[0]).toBe(rgb(plan.bg!));
  });

  test("AC2 time bar: warm-up is ink-muted with its label, items ink, track raise; no legacy warn or accent", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const seg = (kind: string) => `[data-part="bar"] [data-segment="${kind}"]`;
    expect((await cssOf(page, seg("warmup"), ["background-color"]))[0]).toBe(
      rgb(plan["ink-muted"]!),
    );
    expect((await cssOf(page, seg("area"), ["background-color"]))[0]).toBe(rgb(plan.ink!));
    expect((await cssOf(page, '[data-part="bar"]', ["background-color"]))[0]).toBe(
      rgb(plan.raise!),
    );
    await expect(page.locator('[data-part="budget-text"]')).toBeVisible();
    await expect(page.locator('[data-part="budget-text"]')).toHaveText(/\d+ min/);
    // Over budget: shrink to the smallest time chip; the bar never takes a warn colour.
    await page.getByRole("button", { name: "20 minutes" }).click();
    const found = await computedColours(page, SEL_082);
    expect(found).not.toContain(rgb(legacyTokens.color.warn!));
    expect(found).not.toContain(rgb(legacyTokens.color.accent!));
    await openArea(page);
    await openSheet(page);
    const inSheet = await computedColours(page, '[data-screen-id="UF-08.5"]');
    expect(inSheet).not.toContain(rgb(legacyTokens.color.warn!));
    expect(inSheet).not.toContain(rgb(legacyTokens.color.accent!));
  });

  // T-1019: "AC3 Reorder: the moved row is raise with ink text" is deleted. Reorder is retired
  // (D-0274 section 4), so no row is ever "moved" and there is no handle to style.

  test("AC4 Add sheet: the search has a 1px ink-muted boundary", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    await openSheet(page);
    const search = '[data-screen-id="UF-08.5"] input[type="search"]';
    expect(
      await cssOf(page, search, ["border-top-width", "border-top-style", "border-top-color"]),
    ).toEqual(["1px", "solid", rgb(plan["ink-muted"]!)]);
    await expect(page.getByRole("dialog", { name: "Add exercise" })).toBeVisible();
  });

  test("AC5 one primary; every text pair >= 4.5; text on raise is never ink-muted; axe on UF-08.2, UF-08.6 and the sheet", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    await expect(page.locator(".wl-button--primary")).toHaveCount(1);
    const checkPairs = async (what: string) => {
      const pairs = await textPairs(page);
      expect(pairs.length, what).toBeGreaterThan(10);
      for (const p of pairs) {
        expect(ratio(p.fg, p.bg), `${what}: ${p.text}: ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
        if (p.bg === rgb(plan.raise!)) {
          expect(p.fg, `${what}: ${p.text} on raise`).not.toBe(rgb(plan["ink-muted"]!));
        }
      }
      const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(axe.violations, what).toEqual([]);
    };
    await checkPairs("UF-08.2");
    const looks = (await textPairs(page)).find((p) => p.text === "Start workout")!;
    expect([looks.fg, looks.bg]).toEqual([rgb(plan["on-action"]!), rgb(plan.action!)]);
    // T-1019: the Reorder pairs are gone with Reorder (D-0274); UF-08.6 takes their place.
    await openArea(page);
    await checkPairs("UF-08.6");
    await openSheet(page);
    await checkPairs("Add sheet");
    await page.evaluate(() => {
      const status = document.querySelector('[data-part="sheet-status"]')!;
      status.textContent = "Test refusal on raise";
    });
    await checkPairs("Add sheet with a refusal");
    await sheetOf(page).getByLabel("Search exercises").fill("squat");
    await checkPairs("Add sheet, results");
  });

  test("AC6 targets: the area rows, Swap, Remove, Not today, the rows and the sheet controls are at least 44 x 44", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const big = async (locators: ReturnType<Page["locator"]>) => {
      const all = await locators.all();
      expect(all.length).toBeGreaterThan(0);
      for (const l of all) {
        const box = await settledBox(l);
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    };
    await big(
      page.locator(
        '[data-part="area-open"], [data-part="minus"], [data-part="plus"], [data-part="area-row"]',
      ),
    );
    await big(page.getByRole("button", { name: /^Start workout$/ }));
    await big(page.locator(".wl-uf08__chip"));
    await openArea(page);
    await big(
      page.locator(
        '[data-part="swap"], [data-part="not-today"], [data-part="remove"], [data-part="how-to"], [data-part="detail-row"]',
      ),
    );
    await big(page.getByRole("button", { name: "Add exercise" }));
    await openSheet(page);
    await sheetOf(page).getByLabel("Search exercises").fill("squat");
    await big(
      sheetOf(page).locator(
        '[data-part="pick-row"], [data-part="pick-add"], button[aria-label="Close"], button[aria-label="Clear search"], input[type="search"]',
      ),
    );
  });

  test("AC6 motion: the sheet has no transition, the screen cross-fade is instant under reduced motion", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    await openSheet(page);
    const read = () =>
      page.evaluate(() => {
        const dur = (sel: string) =>
          getComputedStyle(document.querySelector(sel)!).transitionDuration;
        return {
          root: dur('[data-screen-id="UF-08.6"]'),
          sheet: dur('[data-screen-id="UF-08.5"]'),
          scrim: dur(".wl-sheet-scrim"),
        };
      });
    expect(await read()).toEqual({ root: "0.2s", sheet: "0s", scrim: "0s" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read()).toEqual({ root: "0s", sheet: "0s", scrim: "0s" });
  });

  test("AC6 the empty page status stays in the accessibility tree (a live region is never display:none)", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const status = page.locator('[data-part="status"]');
    await expect(status).toHaveText("");
    // T-0996 AC13: UF-08.2 has exactly one status region (the removed-line one went with the list).
    await expect(page.getByRole("status")).toHaveCount(1);
    expect(await status.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
  });

  test("AC7 an emptied plan is a plain ink hint in plan, not an alert; Remove still removes and Never suggest is a text button", async ({
    page,
  }) => {
    await openSetup(page);
    await page.getByRole("button", { name: "90 minutes" }).click();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(screenUF082(page)).toBeVisible();
    // UF-08.6: an area with two or more exercises; Remove one, its Never suggest is a text button.
    const multi = areaRows(page)
      .filter({ has: page.locator('[data-part="area-count"]', { hasText: /^[2-9] exercises$/ }) })
      .first();
    await openArea(page, (await multi.getAttribute("data-area"))!);
    const first = detailRows(page).first();
    const removedName = (await first
      .locator('[data-part="row-name"] > span')
      .first()
      .textContent())!;
    await first.locator('[data-part="remove"]').click();
    await expect(detailRows(page).filter({ hasText: removedName })).toHaveCount(0);
    const never = page.locator('[data-part="never-suggest"]').first();
    await expect(never).toHaveClass(/wl-button--text/);
    expect((await cssOf(page, '[data-part="never-suggest"]', ["color"]))[0]).toBe(rgb(plan.ink!));
    await page.getByRole("link", { name: "Back" }).click();
    await expect(screenUF082(page)).toBeVisible();
    // Remove every area: Start workout is disabled and its hint is a plain line, no alert.
    while ((await areaRows(page).count()) > 0) {
      const minus = areaRows(page).first().locator('[data-part="minus"]');
      while ((await minus.getAttribute("aria-label"))!.startsWith("One set less"))
        await minus.click();
      await minus.click();
    }
    await expect(page.locator('[data-part="start"]')).toHaveAttribute("aria-disabled", "true");
    const hint = page.locator('[data-part="need-area"]');
    await expect(hint).toHaveText("Add at least one area.");
    expect((await cssOf(page, '[data-part="need-area"]', ["color"]))[0]).not.toBe(
      rgb(plan.attention!),
    );
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});

// ---- T-0600 AC8: canvas compare at 390 x 844 (WL_CANVAS_COMPARE=1; skipped otherwise) ----
test.describe("T-0600 AC8 canvas compare at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Set up · your workout", async ({ page }, testInfo) => {
    await openSetup(page);
    await suggestAt30(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "set-up-your-workout-app-full.png"),
      fullPage: true,
    });
    await compareWithCanvas(page, testInfo, { turn: "turn-3", frame: "Set up · your workout" });
  });

  // No canvas frame draws the area detail or the Add sheet (T-0600 notes): app-only shots. The
  // Reorder shot is gone with Reorder (D-0274 section 4, T-1019).
  test("The area detail and the open Add sheet (app only)", async ({ page }, testInfo) => {
    await openSetup(page);
    await suggestAt30(page);
    await openArea(page);
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "set-up-your-workout-area-app.png"),
      fullPage: true,
    });
    await openSheet(page);
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "add-exercise-sheet-app.png"),
    });
    await sheetOf(page).getByLabel("Search exercises").fill("squat");
    await page.screenshot({
      path: testInfo.outputPath("cobalt", "add-exercise-sheet-results-app.png"),
    });
  });
});
