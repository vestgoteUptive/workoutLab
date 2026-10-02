// T-0303a UF-08.1 e2e (AC-12; D-0086, D-0091 §1, D-0108). Runs against `vite preview` with
// Supabase mocked through `page.route`; `test`/`expect` come from the guarded fixture, so an
// unclaimed Supabase request fails the test at teardown. T-0303b–d append their cases here.
//
// Seed (D-0108 §2, §4): the L1+ library from `fixtures/uf-04-library-data.js` (read-only), its
// `profile` with FULL equipment plus `user_id` (the default `mockProfilePresent` row has
// `equipment: []`, which would give the R7-E6 push-up plan instead), the nine F-targets, and no
// sets. No seed row carries a date, so nothing here can drift out of the 14-day window.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";
import { VITE_SUPABASE_URL } from "./playwright.config.js";

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
      const box = await target.boundingBox();
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

const DETAIL_PATTERN = /^[1-4] × (\d+(–\d+)?|\d+ s)( · (Bodyweight|[\d.]+ kg))? · \d+ min$/;

const screenUF082 = (page: Page) => page.locator('[data-screen-id="UF-08.2"]');
const itemRows = (page: Page) => page.locator('[data-part="item-row"]');
const rowNames = (page: Page) => itemRows(page).locator('[data-part="row-name"]');

async function rowTexts(page: Page): Promise<string[][]> {
  return itemRows(page).evaluateAll((rows) =>
    rows.map((r) => [
      r.querySelector('[data-part="row-name"]')!.textContent!,
      r.querySelector('[data-part="row-detail"]')!.textContent!,
    ]),
  );
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
  test("rows match the fit line, Remove removes, chip 20 keeps the main lift", async ({ page }) => {
    await openSetup(page);
    const line = await suggestAt30(page);
    const n = Number(/^Fits: (\d+) exercises?/.exec(line)![1]);
    await expect(itemRows(page)).toHaveCount(n);
    const first = (await rowNames(page).first().textContent())!;
    await expect(itemRows(page).first().locator('[data-part="row-detail"]')).toHaveText(
      DETAIL_PATTERN,
    );

    const second = (await rowNames(page).nth(1).textContent())!;
    await page.getByRole("button", { name: `Remove ${second}` }).click();
    await expect(rowNames(page)).not.toContainText([second]);
    expect(await rowNames(page).allTextContents()).not.toContain(second);

    await page.getByRole("button", { name: "20 minutes" }).click();
    await expect(page.getByRole("button", { name: "20 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rowNames(page).first()).toHaveText(first);
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
    const online = await rowTexts(page);
    expect(online.length).toBeGreaterThan(0);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await rowTexts(page)).toEqual(online);

    const second = online[1]![0]!;
    await page.getByRole("button", { name: `Remove ${second}` }).click();
    await expect.poll(() => rowNames(page).allTextContents()).not.toContain(second);
    await expect(screenUF082(page)).toBeVisible();
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

  test("Remove, Shuffle, the 5 chips, Looks good and Back are each ≥ 44 × 44 px", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const names = await rowNames(page).allTextContents();
    expect(names.length).toBeGreaterThan(0);
    const targets = [
      ...names.map((n) => page.getByRole("button", { name: `Remove ${n}` })),
      page.getByRole("button", { name: "Shuffle" }),
      ...[20, 30, 45, 60, 90].map((m) => page.getByRole("button", { name: `${m} minutes` })),
      page.getByRole("button", { name: "Looks good" }),
      page.getByRole("link", { name: "Back" }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Suggest → Remove → Shuffle → Looks good", async ({ page }) => {
    await openSetup(page);
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
    const suggestButton = page.getByRole("button", { name: "Suggest my workout" });
    await tabTo(suggestButton, "Suggest my workout");
    await page.keyboard.press("Enter");
    await expect(screenUF082(page)).toBeVisible();

    const last = (await rowNames(page).last().textContent())!;
    const remove = page.getByRole("button", { name: `Remove ${last}` });
    await tabTo(remove, `Remove ${last}`);
    await page.keyboard.press("Enter");
    await expect.poll(() => rowNames(page).allTextContents()).not.toContain(last);
    // D-0109 §6: focus lands on a Remove button, never on the body.
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-part") ?? null),
    ).toBe("remove");

    const shuffle = page.getByRole("button", { name: "Shuffle" });
    await tabTo(shuffle, "Shuffle");
    await page.keyboard.press("Enter");
    expect(await focused(shuffle)).toBe(true);

    const go = page.getByRole("button", { name: "Looks good" });
    await tabTo(go, "Looks good");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/session\/setup\?step=ready$/);
    await expect(page.locator('[data-screen-id="UF-08.4"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });
});

// ---- T-0303d UF-08.4 Ready and Start (AC-10; D-0086, D-0091 §1, D-0108, D-0110, D-0112) ----
// The spec registers its own `sessions` route after `mockSupabaseData` (the later-registered
// handler wins) to record what AutoSync upserts. Start itself makes no request (D-0110 §5): the
// row goes to IndexedDB, and the sync handle flushes it 250 ms later when online (D-0116), or on
// the `online` event when offline (D-0112 §2).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

const screenUF084 = (page: Page) => page.locator('[data-screen-id="UF-08.4"]');

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

/** UF-08.2 → Looks good → UF-08.4. */
async function toReady(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page).toHaveURL(/\/session\/setup\?step=ready$/);
  await expect(screenUF084(page)).toBeVisible();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
}

/** Start → `/session/<uuid v4>` with focus mode on screen. Returns the id. */
async function startWorkout(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(SESSION_URL);
  const id = SESSION_URL.exec(page.url())![1]!;
  expect(id).toMatch(UUID_V4);
  await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible();
  // T-0304a is merged: the seeded session renders the focus machine's first step.
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return id;
}

test.describe("T-0303d AC-10 UF-08.4 online", () => {
  test("Start → /session/<uuid>, and within 5 s, with no reload, one request sends the row", async ({
    page,
  }) => {
    const writes = await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await expect(page.locator('[data-part="summary"]')).toHaveText(
      /^\d+ min · warm-up \+ \d+ exercises? · \d+ sets? · done by \d{1,2}:\d{2}( [AP]M)?$/,
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

  test("browser Back from /session/<id> never lands on UF-08.4 (D-0123 §2)", async ({ page }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    await toReady(page);
    await startWorkout(page);
    await page.goBack();
    await expect(page.locator("[data-screen-id]").first()).toBeVisible();
    await page.waitForTimeout(50);
    await expect(page).not.toHaveURL(/step=ready/);
    await expect(screenUF084(page)).toHaveCount(0);
    const ids = page.locator("[data-screen-id]");
    await expect(ids).toHaveCount(1);
    // UF-08.1 today (via ?step=suggested and the host's replace); UF-09.9 once T-0394 lands.
    expect(await ids.getAttribute("data-screen-id")).toMatch(/^(UF-08\.1$|UF-09)/);
  });
});

test.describe("T-0303d AC-10 UF-08.4 offline (NFR-OFF-2)", () => {
  test("offline Start writes IndexedDB and navigates; going online sends it once", async ({
    page,
    context,
  }) => {
    const writes = await recordSessions(page);
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await page.getByRole("button", { name: "Suggest my workout" }).click();
    await expect(screenUF082(page)).toBeVisible();
    await toReady(page);
    const id = await startWorkout(page);
    expect(await storedSession(page, id)).toEqual({ pending: true, time_budget_min: 45 });
    expect(writes).toEqual([]);

    await context.setOffline(false);
    await expect.poll(() => requestsCarrying(writes, id).length, { timeout: 5000 }).toBe(1);
    expect(requestsCarrying(writes, id)).toHaveLength(1);
  });
});

test.describe("T-0303d AC-10 UF-08.4 a11y (NFR-A11Y-1/2/6)", () => {
  test("axe reports 0 serious or critical violations on UF-08.4", async ({ page }) => {
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
      page.getByRole("button", { name: "Start" }),
      page.getByRole("link", { name: "Back" }),
      page.getByRole("checkbox", { name: "Sound cues" }),
      page.getByRole("checkbox", { name: "Voice countdown 3-2-1" }),
      page.getByRole("checkbox", { name: "Keep screen awake" }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, String(target)).toBeGreaterThanOrEqual(44);
      expect(box!.height, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Looks good → toggle a switch → Start", async ({ page }) => {
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
    const go = page.getByRole("button", { name: "Looks good" });
    await tabTo(go, "Looks good");
    await page.keyboard.press("Enter");
    await expect(screenUF084(page)).toBeVisible();

    const voice = page.getByRole("checkbox", { name: "Voice countdown 3-2-1" });
    await tabTo(voice, "Voice countdown 3-2-1");
    await page.keyboard.press("Space");
    await expect(voice).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("wl-focus-prefs"))).toBe(
      '{"version":1,"sound":true,"voice":false,"keepAwake":true}',
    );

    const start = page.getByRole("button", { name: "Start" });
    await tabTo(start, "Start");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(SESSION_URL);
    await expect(page.locator('[data-screen-id^="UF-09"]')).toBeVisible();
  });
});
