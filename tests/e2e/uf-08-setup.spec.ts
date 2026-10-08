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

test.describe("T-0521 AC7 UF-08.2 Remove does not refill (GitHub #33)", () => {
  test("removing the last accessory drops one row and no new exercise appears", async ({
    page,
  }) => {
    await openSetup(page);
    await suggestAt30(page);
    const before = await rowNames(page).allTextContents();
    expect(before.length).toBeGreaterThan(1);
    const last = before.at(-1)!;
    await page.getByRole("button", { name: `Remove ${last}` }).click();
    await expect(itemRows(page)).toHaveCount(before.length - 1);
    const after = await rowNames(page).allTextContents();
    expect(after).toEqual(before.slice(0, -1));
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

test.describe("T-0581 UF-08.2 how-to sheet from the exercise name", () => {
  test("opens, axe is clean, 44px target, focus returns, plan unchanged, works offline", async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSetup(page);
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);
    await suggestAt30(page);
    const before = await rowTexts(page);
    const name = before[0]![0]!;
    const button = page.getByRole("button", { name: `How to do ${name}` });
    const box = (await button.boundingBox())!;
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
    // A user activation after the guard is armed, so Chromium keeps the entry (D-0123 §3 note).
    await page.waitForFunction(() => history.state?.wlFocusGuard === true);
    await page.mouse.click(5, 300);
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page).toHaveURL(SESSION_URL);
    await page.waitForTimeout(50);
    await expect(page).not.toHaveURL(/step=ready/);
    await expect(screenUF084(page)).toHaveCount(0);
    const ids = page.locator("[data-screen-id]");
    await expect(ids).toHaveCount(1);
    expect(await ids.getAttribute("data-screen-id")).toBe("UF-09.9");
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
    await toReady(page);
    const id = await startWorkout(page);
    expect(await storedSession(page, id)).toEqual({ pending: true, time_budget_min: 45 });
    expect(gate.writesFulfilledOffline()).toBe(0);

    await gate.goOnline();
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
    const rows = await rowTexts(page);
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
    const rows = await rowTexts(page);
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
    const online = await rowTexts(page);
    expect(online.some(([, detail]) => KG_ROW.test(detail!))).toBe(true);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await rowTexts(page)).toEqual(online);
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
const MAIN_DETAIL = /^4 × 6–8 · 42\.5 kg · \d+ min$/;

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

  test("T-0412 AC2 UF-08.2 main row is M at 4 × 6–8 · 42.5 kg", async ({ page }) => {
    await seedLoaded(page, mainSeed());
    await openSetup(page);
    await suggestAt30(page);
    const rows = await rowTexts(page);
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
    await expect(current.getByText("Set 1 of 4")).toBeVisible();
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
    const online = await rowTexts(page);
    expect(online[0]![0]).toBe(MAIN_NAME);
    expect(online[0]![1]).toMatch(MAIN_DETAIL);

    await context.setOffline(true);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Offline")).toBeVisible();
    await expect(fitLine(page)).toHaveText(FIT_PATTERN);
    await suggestAt30(page);
    expect(await rowTexts(page)).toEqual(online);
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
  test("Swap the second item, apply the first candidate, then start with the new exercise", async ({
    page,
  }) => {
    await recordSessions(page);
    await openSetup(page);
    await suggestAt30(page);
    const before = await rowNames(page).allTextContents();
    expect(before.length).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: `Swap ${before[1]!}` }).click();
    await expect(page).toHaveURL(/\/session\/setup\?step=swap&item=1$/);
    await expect(screenUF051(page)).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);

    await page.getByRole("radio", { name: "Variety" }).check();
    const use = page.getByRole("button", { name: /^Use / });
    await expect(use).toBeVisible();
    const picked = (await use.textContent())!.replace(/^Use /, "");
    await use.click();

    await expect(screenUF082(page)).toBeVisible();
    await expect(page).toHaveURL(/\/session\/setup\?step=suggested$/);
    const after = await rowNames(page).allTextContents();
    expect(after[1]).toBe(picked);
    expect(after[1]).not.toBe(before[1]);
    expect(after[0]).toBe(before[0]);

    await toReady(page);
    const id = await startWorkout(page);
    const ids = await storedPlanIds(page, id);
    expect(ids).toHaveLength(after.length);
    expect(ids[1]).toBe(picked.toLowerCase().replace(/[ ]/g, "-"));
  });

  test("axe reports 0 serious or critical violations on the sheet", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    await page.locator('[data-part="swap"]').nth(1).click();
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
    const buttons = page.locator('[data-part="swap"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await buttons.nth(i).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard only: Swap, a reason chip, Use", async ({ page }) => {
    await openSetup(page);
    await suggestAt30(page);
    const before = await rowNames(page).allTextContents();
    async function tabTo(locator: ReturnType<Page["getByRole"]>, label: string): Promise<void> {
      for (let i = 0; i < 40; i += 1) {
        if (await locator.evaluate((el) => el === document.activeElement)) return;
        await page.keyboard.press("Tab");
      }
      throw new Error(`Tab never reached ${label}`);
    }
    await page.locator("body").focus();
    await tabTo(page.locator('[data-part="swap"]').nth(1), "Swap");
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
    await expect(screenUF082(page)).toBeVisible();
    expect((await rowNames(page).allTextContents())[1]).toBe(picked);
    expect(picked).not.toBe(before[1]);
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
      const box = (await b.boundingBox())!;
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
    const names = await rowNames(page).allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(skippedNames.has(n)).toBe(false);
  });
});
