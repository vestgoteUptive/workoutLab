// T-0942 UF-08.1, UF-08.2, UF-08.4, UF-09.1 e2e: "Start empty" end to end (docs/specs/empty-start-plan.md,
// D-0236, D-0238, D-0239, D-0248; B1-B4, B7, B15-B17, B21, a11y). Same seed as uf-08-setup.spec.ts:
// the L1+ library, the profile with FULL equipment, the nine F-targets and zero history unless a
// test passes `sets`. Supabase is mocked through `page.route`; the guarded fixture fails an
// unclaimed request at teardown.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
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
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";
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

// ---- Histories (relative to now, so nothing drifts out of the 14-day window) ----

let seq = 0;
function setsDaysAgo(n: number, exerciseId: string, daysAgo: number): unknown[] {
  // Local noon of the calendar day, so a DST shift or the time of day never moves it across a day.
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  const at = day.toISOString();
  return Array.from({ length: n }, () => ({
    client_id: `t0942-${seq++}`,
    session_id: `T0942-S-${daysAgo}`,
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps: 8,
    weight_kg: 40,
    duration_s: null,
  }));
}
function balancedSession(daysAgo: number): unknown[] {
  return [
    ...setsDaysAgo(3, "bench-press", daysAgo),
    ...setsDaysAgo(3, "barbell-row", daysAgo),
    ...setsDaysAgo(3, "back-squat", daysAgo),
    ...setsDaysAgo(2, "overhead-press", daysAgo),
    ...setsDaysAgo(2, "romanian-deadlift", daysAgo),
    ...setsDaysAgo(2, "calf-raise", daysAgo),
    ...setsDaysAgo(2, "biceps-curl", daysAgo),
    ...setsDaysAgo(2, "dead-bug", daysAgo),
  ];
}
/** The engine's returning-after-10-days fixture (R7-E30), as day offsets from now: four balanced
 *  sessions 24, 21, 18 and 15 days ago, then squats 12 days and deadlifts 10 days ago. */
const returningAfter10Days = (): unknown[] => [
  ...[24, 21, 18, 15].flatMap(balancedSession),
  ...setsDaysAgo(3, "back-squat", 12),
  ...setsDaysAgo(4, "romanian-deadlift", 10),
];

// ---- Helpers ----

const screenUF081 = (page: Page) => page.locator('[data-screen-id="UF-08.1"]');
const screenUF082 = (page: Page) => page.locator('[data-screen-id="UF-08.2"]');
const fitLine = (page: Page) => page.locator('[data-part="fit-line"]');
const budgetText = (page: Page) => page.locator('[data-part="budget-text"]');
const itemRows = (page: Page) => page.locator('[data-part="item-row"]');
const itemNames = (page: Page) => itemRows(page).locator('[data-part="row-name"]');
const suggestions = (page: Page) => page.locator('[data-part="suggestions"]');
const suggestionRows = (page: Page) => suggestions(page).locator('[data-part="suggestion"]');
const suggestionNames = (page: Page) => suggestionRows(page).locator('[data-part="row-name"]');
const status = (page: Page) => page.locator('[data-part="status"]');
const looksGood = (page: Page) => page.getByRole("button", { name: "Start workout" });
const addButton = (page: Page, name: string) => page.getByRole("button", { name: `Add ${name}` });

async function seed(page: Page, sets: unknown[] = []): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets,
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
}

async function openSetup(page: Page, minutes = 30): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(screenUF081(page)).toBeVisible();
  await page.getByRole("button", { name: `${minutes} minutes` }).click();
  await expect(fitLine(page)).toHaveText(/^Fits:/);
}

async function startEmpty(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start empty" }).click();
  await expect(screenUF082(page)).toBeVisible();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(suggestionRows(page).first()).toBeVisible();
}

/** Name and detail ("4 × 6–8 · 12 min") of each row in a list, in order. */
async function rowTexts(rows: Locator): Promise<string[][]> {
  return rows.evaluateAll((els) =>
    els.map((r) => [
      r.querySelector('[data-part="row-name"]')!.textContent!,
      r.querySelector('[data-part="row-detail"]')!.textContent!,
    ]),
  );
}

async function suggestedPlanAt30(page: Page): Promise<string[][]> {
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(screenUF082(page)).toBeVisible();
  await expect(itemRows(page).first()).toBeVisible();
  const rows = await rowTexts(itemRows(page));
  await page.getByRole("link", { name: /back/i }).first().click();
  await expect(screenUF081(page)).toBeVisible();
  return rows;
}

interface SessionUpsert {
  id: string;
  time_budget_min: number;
  plan?: { items: { exerciseId: string }[] };
}

/** Records every `sessions` write; reads answer `[]` (the uf-08-setup.spec.ts pattern). */
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

const SESSION_URL = /\/session\/([0-9a-f-]{36})$/;

async function storedSession(
  page: Page,
  id: string,
): Promise<{ pending: boolean; ids: string[] } | null> {
  return page.evaluate(async (key: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<
      { pending: boolean; row: { plan: { items: { exerciseId: string }[] } } } | undefined
    >((resolve, reject) => {
      const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
      get.onsuccess = () => resolve(get.result as never);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return entry
      ? { pending: entry.pending, ids: entry.row.plan.items.map((i) => i.exerciseId) }
      : null;
  }, id);
}

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

async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return false;
          const requests = await (await caches.open(precache)).keys();
          return requests.some((r) => new URL(r.url).pathname === "/index.html");
        }),
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toBe(true);
}

/** Tap Start workout on UF-08.2 and wait for focus mode. Returns the session id. */
async function startWorkout(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(SESSION_URL);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return SESSION_URL.exec(page.url())![1]!;
}

/** UF-09.1 leads with the warm-up; skip it and the first picked exercise is the current step. */
async function expectFirstExercise(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const activeIsBody = (page: Page) => page.evaluate(() => document.activeElement === document.body);

// ---- AC1, AC2, AC3 (B1, B2, B3), AC4 (B4), zero history ----

test.describe("zero-history user, 30 min", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
  });

  test("AC1 (B1): Start empty opens UF-08.2 with the empty copy, 3 of 30 min, disabled Start workout", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await expect(page.locator('[data-part="empty-plan"]')).toHaveText(
      "Nothing here yet. Pick from the suggestions or add an exercise.",
    );
    await expect(itemRows(page)).toHaveCount(0);
    await expect(budgetText(page)).toHaveText("3 of 30 min · 27 min left");
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await expect(looksGood(page)).toHaveAccessibleDescription("Add at least one exercise.");
    // Disabled, not inert: a tap stays on UF-08.2.
    await looksGood(page).click({ force: true });
    await expect(screenUF082(page)).toBeVisible();
    await expect(itemRows(page)).toHaveCount(0);
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await expect(page).not.toHaveURL(/step=ready/);
  });

  test("AC2 (B2): the first row is the Main lift; the rows are the suggested-mode plan, same order", async ({
    page,
  }) => {
    await openSetup(page);
    const suggested = await suggestedPlanAt30(page);
    await startEmpty(page);
    await expect(suggestionRows(page).first().locator('[data-part="row-main"]')).toHaveText(
      "Main lift",
    );
    await expect(page.locator('[data-part="row-main"]')).toHaveCount(1);
    const empty = await rowTexts(suggestionRows(page));
    expect(empty.map((r) => r[0])).toEqual(["Bench press", "Inverted row", "Leg extension"]);
    expect(empty).toEqual(suggested);
  });

  test("AC3 (B3): Add on the Main lift row puts it first, announces it, and focuses the next Add", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addButton(page, "Bench press").click();
    await expect(itemNames(page).first()).toHaveText("Bench press");
    await expect(itemRows(page).first()).toHaveAttribute("data-main", "true");
    await expect(status(page)).toHaveText("Bench press added. 15 min left.");
    await expect(budgetText(page)).toHaveText("15 of 30 min · 15 min left");
    await expect(suggestionNames(page)).toHaveText(["Inverted row", "Leg extension"]);
    await expect(addButton(page, "Inverted row")).toBeFocused();
  });

  test("AC4 (B4): the last suggestion first leaves no main lift; every other Add is accepted", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addButton(page, "Leg extension").click();
    await expect(itemNames(page)).toHaveText(["Leg extension"]);
    await expect(page.locator('[data-main="true"]')).toHaveCount(0);
    await expect(status(page)).toHaveText(/^Leg extension added\. \d+ min left\.$/);

    let expected = 1;
    while ((await suggestionRows(page).count()) > 0) {
      const name = (await suggestionNames(page).first().textContent())!;
      await addButton(page, name).click();
      expected += 1;
      await expect(itemRows(page)).toHaveCount(expected);
      expect(await itemNames(page).allTextContents()).toContain(name);
      await expect(status(page)).toHaveText(new RegExp(`^${name} added\\. \\d+ min left\\.$`));
      await expect(status(page)).not.toContainText(/push out|doesn't fit|min over/i);
    }
    expect(expected).toBeGreaterThanOrEqual(3);
    expect(await itemNames(page).allTextContents()).toContain("Leg extension");
    await expect(looksGood(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("AC5 (B7, B21): a shorter chip lists the accessory; 30 brings both back, main first", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addButton(page, "Bench press").click();
    await addButton(page, "Inverted row").click();
    await expect(itemNames(page)).toHaveText(["Bench press", "Inverted row"]);

    await page.getByRole("button", { name: "20 minutes" }).click();
    await expect(page.locator('[data-part="doesnt-fit"]')).toHaveText(
      "Doesn't fit in 20 min: Inverted row.",
    );
    await expect(itemNames(page)).toHaveText(["Bench press"]);

    await page.getByRole("button", { name: "30 minutes" }).click();
    await expect(page.locator('[data-part="doesnt-fit"]')).toHaveCount(0);
    await expect(itemNames(page)).toHaveText(["Bench press", "Inverted row"]);
    await expect(itemRows(page).first()).toHaveAttribute("data-main", "true");
  });

  test("AC8 (B17): one pick at 45 min, Start workout opens UF-09.1 with it", async ({ page }) => {
    const writes = await recordSessions(page);
    await openSetup(page, 45);
    await startEmpty(page);
    const name = (await suggestionNames(page).last().textContent())!;
    await addButton(page, name).click();
    await expect(itemRows(page)).toHaveCount(1);
    const pickedId = (await itemRows(page).first().getAttribute("data-id"))!;

    const id = await startWorkout(page);
    await expectFirstExercise(page, name);
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.map((i) => i.exerciseId)).toEqual([pickedId]);
    expect(await storedSession(page, id)).toMatchObject({ ids: [pickedId] });
  });
});

// ---- AC6 (B15) returning after 10 days ----

test("AC6 (B15): returning after 10 days off, the suggestions equal Suggest my workout at 30 min", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, returningAfter10Days());
  await openSetup(page);
  const suggested = await suggestedPlanAt30(page);
  expect(suggested.map((r) => r[0])).toEqual(["Bench press", "Inverted row", "Calf raise"]);
  await startEmpty(page);
  expect(await rowTexts(suggestionRows(page))).toEqual(suggested);
});

// ---- AC7 (B16) offline and online ----

test.describe("AC7 (B16) Start empty to UF-09.1", () => {
  test("offline: Start empty, Add, Start workout; the sessions write waits in the queue", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    const writes = await recordSessions(page);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible();
    await expect.poll(() => cachedCounts(page)).toEqual({ library: exercises.length, targets: 9 });
    await precacheSettled(page);

    // Registered after recordSessions, so its write-abort gate wins while armed (T-0484).
    const gate = await goOffline(page, context);
    await page.goto("/session/setup");
    await expect(screenUF081(page)).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "30 minutes" }).click();
    await expect(fitLine(page)).toHaveText(/^Fits:/);

    await startEmpty(page);
    await expect(budgetText(page)).toHaveText("3 of 30 min · 27 min left");
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await addButton(page, "Bench press").click();
    await addButton(page, "Inverted row").click();
    await expect(itemNames(page)).toHaveText(["Bench press", "Inverted row"]);

    const id = await startWorkout(page);
    await expectFirstExercise(page, "Bench press");
    expect(await storedSession(page, id)).toEqual({
      pending: true,
      ids: ["bench-press", "inverted-row"],
    });
    expect(gate.writesFulfilledOffline()).toBe(0);
    expect(writes.flat().filter((r) => r.id === id)).toHaveLength(0);

    await gate.goOnline();
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.map((i) => i.exerciseId)).toEqual(["bench-press", "inverted-row"]);
  });

  test("online sibling: the same flow writes the sessions row without going offline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    const writes = await recordSessions(page);
    await openSetup(page);
    await startEmpty(page);
    await addButton(page, "Bench press").click();
    await addButton(page, "Inverted row").click();
    const id = await startWorkout(page);
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.map((i) => i.exerciseId)).toEqual(["bench-press", "inverted-row"]);
  });
});

// ---- AC9 a11y: axe, 44 px targets, focus never on body ----

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
}

/** Every locator must match at least one element (a missing control is a failure, not a pass). */
async function expectTargets44(locators: Locator[]): Promise<void> {
  for (const l of locators) {
    const n = await l.count();
    expect(n, `${l} should be on screen`).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const box = (await settledBox(l.nth(i)))!;
      const label = (await l.nth(i).textContent()) ?? "";
      expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
    }
  }
}

test.describe("AC9 a11y", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
  });

  test("UF-08.1: axe is clean and Start empty is at least 44 x 44", async ({ page }) => {
    await openSetup(page);
    await expect(page.getByRole("button", { name: "Start empty" })).toBeVisible();
    await expectNoSeriousViolations(page);
    await expectTargets44([page.getByRole("button", { name: "Start empty" })]);
  });

  test("UF-08.2 empty mode: 0 items, with picks, and a full list", async ({ page }) => {
    await openSetup(page);
    await startEmpty(page);

    // 0 items.
    await expectNoSeriousViolations(page);
    await expectTargets44([
      page.locator('[data-part="suggest-add"]'),
      page.locator('[data-part="other-suggestions"]'),
      page.locator('[data-part="fill-rest"]'),
      page.getByRole("button", { name: "Add exercise" }),
      looksGood(page),
    ]);

    // With picks: after each Add focus is on an element, never body.
    await addButton(page, "Bench press").click();
    await expect(itemRows(page)).toHaveCount(1);
    expect(await activeIsBody(page)).toBe(false);
    await expectNoSeriousViolations(page);
    await expectTargets44([
      page.locator('[data-part="suggest-add"]'),
      page.locator('[data-part="other-suggestions"]'),
      page.locator('[data-part="fill-rest"]'),
      looksGood(page),
    ]);

    // Full list: take every remaining suggestion.
    while ((await suggestionRows(page).count()) > 0) {
      const before = await itemRows(page).count();
      await page.locator('[data-part="suggest-add"]').first().click();
      await expect(itemRows(page)).toHaveCount(before + 1);
      expect(await activeIsBody(page)).toBe(false);
    }
    await expect(page.locator('[data-part="suggestions-copy"]')).toBeVisible();
    await expect(addButtonAddExercise(page)).toBeFocused();
    await expectNoSeriousViolations(page);
    await expectTargets44([
      page.locator('[data-part="fill-rest"]'),
      page.getByRole("button", { name: "Add exercise" }),
      looksGood(page),
    ]);
  });
});

function addButtonAddExercise(page: Page): Locator {
  return page.getByRole("button", { name: "Add exercise" });
}
