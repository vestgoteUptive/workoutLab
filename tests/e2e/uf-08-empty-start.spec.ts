// T-0942 UF-08.1, UF-08.2, UF-09.1 e2e: "Start empty" end to end (docs/specs/empty-start-plan.md,
// D-0236, D-0238, D-0239, D-0248; B1-B4, B7, B15-B17, B21, a11y), moved to the area plan by T-1019
// (D-0274, D-0280, D-0286): Start empty opens UF-08.2 with no area; the user adds areas ("Add an
// area", "Fill the rest for me") and taps Start workout. The exercise list, the Suggestions section,
// the "Doesn't fit" line and the Main-lift-first row rules went with D-0274, so B2, B3, B4 and B7
// are rewritten against area rows. Same seed as uf-08-setup.spec.ts:
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
const areaRows = (page: Page) => page.locator('[data-part="area-row"]');
const areaNames = (page: Page) => areaRows(page).locator('[data-part="area-name"]');
const candidateAdd = (page: Page, area: string) =>
  page.locator(`[data-part="candidate"][data-area="${area}"] [data-part="candidate-add"]`);
const candidateAdds = (page: Page) =>
  page.locator('[data-part="candidate"] [data-part="candidate-add"]:not([aria-disabled="true"])');
const fillRest = (page: Page) => page.locator('[data-part="fill-rest"]');
const status = (page: Page) => page.locator('[data-part="status"]');
const looksGood = (page: Page) => page.getByRole("button", { name: "Start workout" });

/** UF-08.2: open "Add an area" (it can re-render closed while the screen settles) and Add `area`. */
async function addArea(page: Page, area: string): Promise<void> {
  const add = candidateAdd(page, area);
  await expect(async () => {
    if (!(await add.isVisible())) await page.locator('[data-part="add-area-summary"]').click();
    await expect(add).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await add.click();
  await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toBeVisible();
}

/** The names of the exercises in `area`'s UF-08.6 page, in order; returns to UF-08.2. */
async function exercisesOf(page: Page, area: string): Promise<string[]> {
  await page.locator(`[data-part="area-row"][data-area="${area}"] [data-part="area-open"]`).click();
  await expect(page.locator('[data-screen-id="UF-08.6"]')).toBeVisible();
  const names = await page
    .locator('[data-part="detail-row"] [data-part="row-name"] > span:first-child')
    .allTextContents();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(screenUF082(page)).toBeVisible();
  return names;
}

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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today: pick your areas");
}

/** The areas UF-08.2 lists, in order. */
const areasOf = (page: Page): Promise<string[]> => areaNames(page).allTextContents();

/** UF-08.1 "Suggest my workout" at the chosen time: the areas it plans. Returns to UF-08.1. */
async function suggestedAreasAt30(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(screenUF082(page)).toBeVisible();
  await expect(areaRows(page).first()).toBeVisible();
  const areas = await areasOf(page);
  await page.getByRole("link", { name: /back/i }).first().click();
  await expect(screenUF081(page)).toBeVisible();
  return areas;
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

/** Make sure the "Add an area" disclosure is open (it can re-render closed while UF-08.2 settles). */
async function openAddArea(page: Page): Promise<void> {
  await expect(async () => {
    if (!(await candidateAdds(page).first().isVisible()))
      await page.locator('[data-part="add-area-summary"]').click();
    await expect(candidateAdds(page).first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

// ---- AC1, AC2, AC3 (B1, B2, B3), AC4 (B4), zero history ----

test.describe("zero-history user, 30 min", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
  });

  test("AC1 (B1): Start empty opens UF-08.2 with the empty copy, 30 min to fill, disabled Start workout", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await expect(page.locator('[data-part="area-title"]')).toHaveText("Today: pick your areas");
    await expect(page.getByText("30 min to fill")).toBeVisible();
    await expect(areaRows(page)).toHaveCount(0);
    await expect(budgetText(page)).toHaveText("About 3 of 30 min");
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await expect(looksGood(page)).toHaveAccessibleDescription("Add at least one area.");
    // Disabled, not inert: a tap stays on UF-08.2.
    await looksGood(page).click({ force: true });
    await expect(screenUF082(page)).toBeVisible();
    await expect(areaRows(page)).toHaveCount(0);
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await expect(page).toHaveURL(/step=suggested/);
  });

  test("AC2 (B2): Fill the rest for me leads with the areas Suggest my workout leads with, within 30 min", async ({
    page,
  }) => {
    await openSetup(page);
    const suggested = await suggestedAreasAt30(page);
    expect(suggested.length).toBeGreaterThan(1);
    await startEmpty(page);
    await fillRest(page).click();
    // The two areas furthest below target come first in both modes; the rest is chosen by time.
    expect((await areasOf(page)).slice(0, 2)).toEqual(suggested.slice(0, 2));
    await expect(fillRest(page)).toHaveCount(0);
    await expect(looksGood(page)).not.toHaveAttribute("aria-disabled", "true");
    const [, used] = /^About (\d+) of 30 min$/.exec((await budgetText(page).textContent())!)!;
    expect(Number(used)).toBeLessThanOrEqual(30);
  });

  test("AC3 (B3): Add an area puts its row first, announces it, and focuses its set control", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addArea(page, "chest");
    await expect(areaNames(page).first()).toHaveText("Chest");
    await expect(status(page)).toHaveText(/^Chest added\. \d+ min left\.$/);
    await expect(budgetText(page)).toHaveText(/^About \d+ of 30 min$/);
    await expect(
      page.locator('[data-area="chest"]').getByRole("button", { name: "One set more for Chest" }),
    ).toBeFocused();
    await expect(candidateAdd(page, "chest")).toHaveCount(0);
  });

  test("AC4 (B4): every area can be added in any order while time lasts, none is pushed out", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addArea(page, "quads");
    await expect(areasOf(page)).resolves.toEqual(["Quads"]);
    await expect(status(page)).toHaveText(/^Quads added\. \d+ min left\.$/);

    let expected = 1;
    for (;;) {
      await openAddArea(page).catch(() => undefined);
      if ((await candidateAdds(page).count()) === 0) break;
      const area = (await candidateAdds(page)
        .first()
        .locator("xpath=ancestor::*[@data-area][1]")
        .getAttribute("data-area"))!;
      await candidateAdds(page).first().click();
      expected += 1;
      await expect(areaRows(page)).toHaveCount(expected);
      await expect(page.locator(`[data-part="area-row"][data-area="${area}"]`)).toBeVisible();
      await expect(status(page)).toHaveText(/ added\. \d+ min left\.$/);
      await expect(status(page)).not.toContainText(/push out|doesn't fit|min over/i);
    }
    expect(expected).toBeGreaterThanOrEqual(3);
    expect(await areasOf(page)).toContain("Quads");
    await expect(looksGood(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("AC5 (B7, B21): a shorter chip rebuilds an empty plan; 30 asks for areas again", async ({
    page,
  }) => {
    await openSetup(page);
    await startEmpty(page);
    await addArea(page, "chest");
    await addArea(page, "back");
    expect(await areasOf(page)).toEqual(["Chest", "Back"]);

    await page.getByRole("button", { name: "20 minutes" }).click();
    await expect(status(page)).toContainText("Plan rebuilt for 20 min");
    expect(await areasOf(page)).toEqual([]);
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
  });

  test("AC8 (B17): one area at 45 min, Start workout opens UF-09.1 with its exercise", async ({
    page,
  }) => {
    const writes = await recordSessions(page);
    await openSetup(page, 45);
    await startEmpty(page);
    await addArea(page, "calves");
    await expect(areaRows(page)).toHaveCount(1);
    const names = await exercisesOf(page, "calves");
    expect(names.length).toBeGreaterThan(0);

    const id = await startWorkout(page);
    await expectFirstExercise(page, names[0]!);
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.length).toBe(names.length);
    expect((await storedSession(page, id))?.ids).toHaveLength(names.length);
  });
});

// ---- AC6 (B15) returning after 10 days ----

test("AC6 (B15): returning after 10 days off, Fill the rest for me leads with the areas Suggest my workout does at 30 min", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, returningAfter10Days());
  await openSetup(page);
  const suggested = await suggestedAreasAt30(page);
  expect(suggested.length).toBeGreaterThan(1);
  await startEmpty(page);
  await fillRest(page).click();
  expect((await areasOf(page)).slice(0, 2)).toEqual(suggested.slice(0, 2));
});

// ---- AC7 (B16) offline and online ----

test.describe("AC7 (B16) Start empty to UF-09.1", () => {
  test("offline: Start empty, Add areas, Start workout; the sessions write waits in the queue", async ({
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
    await expect(budgetText(page)).toHaveText("About 3 of 30 min");
    await expect(looksGood(page)).toHaveAttribute("aria-disabled", "true");
    await addArea(page, "chest");
    await addArea(page, "back");
    expect(await areasOf(page)).toEqual(["Chest", "Back"]);
    const chest = await exercisesOf(page, "chest");
    const back = await exercisesOf(page, "back");

    const id = await startWorkout(page);
    await expectFirstExercise(page, chest[0]!);
    const stored = await storedSession(page, id);
    expect(stored?.pending).toBe(true);
    expect(stored?.ids).toHaveLength(chest.length + back.length);
    expect(gate.writesFulfilledOffline()).toBe(0);
    expect(writes.flat().filter((r) => r.id === id)).toHaveLength(0);

    await gate.goOnline();
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.map((i) => i.exerciseId)).toEqual(stored!.ids);
  });

  test("online sibling: the same flow writes the sessions row without going offline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    const writes = await recordSessions(page);
    await openSetup(page);
    await startEmpty(page);
    await addArea(page, "chest");
    await addArea(page, "back");
    const id = await startWorkout(page);
    await expect.poll(() => writes.flat().filter((r) => r.id === id).length).toBe(1);
    const row = writes.flat().find((r) => r.id === id)!;
    expect(row.plan?.items.length).toBeGreaterThanOrEqual(2);
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

  test("UF-08.2 empty mode: 0 areas, with one area, and every area added", async ({ page }) => {
    await openSetup(page);
    await startEmpty(page);

    // 0 areas.
    await expectNoSeriousViolations(page);
    await expectTargets44([
      page.locator('[data-part="add-area-summary"]'),
      fillRest(page),
      looksGood(page),
    ]);

    // With one area: after the Add focus is on an element, never body.
    await addArea(page, "chest");
    expect(await activeIsBody(page)).toBe(false);
    await expectNoSeriousViolations(page);
    await expectTargets44([
      page.locator('[data-part="area-open"]'),
      page.locator('[data-part="minus"]'),
      page.locator('[data-part="plus"]'),
      page.locator('[data-part="add-area-summary"]'),
      fillRest(page),
      looksGood(page),
    ]);

    // Every area that can still be added: focus is never on body after each Add.
    for (;;) {
      await openAddArea(page).catch(() => undefined);
      if ((await candidateAdds(page).count()) === 0) break;
      const before = await areaRows(page).count();
      await candidateAdds(page).first().click();
      await expect(areaRows(page)).toHaveCount(before + 1);
      expect(await activeIsBody(page)).toBe(false);
    }
    await expectNoSeriousViolations(page);
    await expectTargets44([page.locator('[data-part="add-area-summary"]'), looksGood(page)]);
  });
});
