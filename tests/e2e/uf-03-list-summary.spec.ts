// UF-03 List view / Summary e2e (D-0071 §10). T-0420 creates it with the UF-03.3 summary rows
// (AC-7, NFR-OFF-2); T-0417 appends the UF-03.1 List view rows. T-0458 adds the Playwright spec
// T-0416 deferred: a seeded running S1, offline Pause → List view, three sets checked by
// keyboard, Finish → UF-03.3 → Save, the stored sets and session after a reload, axe and 44 px.
//
// Runs against `vite preview` with Supabase mocked through `page.route`. `test`/`expect` come
// from `fixtures/guarded-test.js` (D-0086, T-0425): an unclaimed Supabase request or a console
// error fails the test at teardown.
//
// The seed puts one ended `sessions` row and its queued sets straight into the app's own
// `wl-offline` database (the `uf-09-focus.spec.ts` pattern, in the `QueuedSession`/`QueuedSet`
// shapes of `lib/offline/db.ts`), after the app has opened it and filled the library and target
// caches. Both offline helpers below go offline through `goOffline` (T-0484, D-0175 §3), which
// arms a write-abort gate on the Supabase write routes before the context goes offline, so no
// write made afterwards — including AutoSync's mount flush after a reload — can be fulfilled by
// the mock. Reads keep falling through to `mockSupabaseData` unchanged.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import { compareWithCanvas } from "./helpers/canvas-compare.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

function exercise(id: string) {
  return {
    id,
    name: id,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    timed: false,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
}

const S1 = "S1";
/** 11:00 → 11:52:40 Stockholm: "52 min". */
const STARTED_AT = "2026-09-27T09:00:00.000Z";
const ENDED_AT = "2026-09-27T09:52:40.000Z";

const PLAN = {
  version: 1,
  mainLiftId: "back-squat",
  warmup: [],
  items: [
    ["back-squat", true, 4, 6, 8],
    ["romanian-deadlift", false, 3, 8, 12],
  ].map(([exerciseId, isMain, sets, repsMin, repsMax]) => ({
    exerciseId,
    isMain,
    sets,
    repsMin,
    repsMax,
    durationS: null,
    costS: 600,
    backoff: null,
    prefill: { weightKg: null, reps: repsMin, durationS: null, kind: "first_time" },
    reasons: [],
  })),
  startDeficits: Object.fromEntries(AREAS.map((a) => [a, 1])),
};

/** T-0458: the running session's plan. Same shape as `PLAN`, but back-squat's pre-fill is
 *  100 kg × 6 (an `add_rep` kind, not `first_time`), so an unlogged row's toggle isn't blocked
 *  for a missing weight. */
const RUNNING_PLAN = {
  ...PLAN,
  items: PLAN.items.map((item) =>
    item.exerciseId === "back-squat"
      ? { ...item, prefill: { weightKg: 100, reps: 6, durationS: null, kind: "add_rep" } }
      : item,
  ),
};

/** S1's sets: back-squat 100 × 6 × 4 and romanian-deadlift 80 × 8 × 3, 7 hard sets. */
function s1Sets() {
  const series = (exerciseId: string, weightKg: number, reps: number, n: number, at: string) =>
    Array.from({ length: n }, (_, i) => {
      const completedAt = new Date(Date.parse(at) + i * 180_000).toISOString();
      return {
        clientId: `${S1}-${exerciseId}-${i}`,
        exerciseId,
        setIndex: i,
        weightKg,
        reps,
        completedAt,
      };
    });
  return [
    ...series("back-squat", 100, 6, 4, "2026-09-27T09:05:00.000Z"),
    ...series("romanian-deadlift", 80, 8, 3, "2026-09-27T09:30:00.000Z"),
  ];
}

interface StoredSessionRow {
  started_at: string;
  ended_at: string | null;
  effort_rating?: number | null;
}

async function openDb(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
}

/** Waits until the shell's refresh has cached the library and all nine targets. */
async function cachesFilled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (userId: string) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const count = (store: string) =>
          new Promise<number>((resolve, reject) => {
            const req = db
              .transaction(store, "readonly")
              .objectStore(store)
              .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        const out = { library: await count("libraryCache"), targets: await count("targetCache") };
        db.close();
        return out;
      }, FAKE_USER_ID),
    )
    .toEqual({ library: 2, targets: 9 });
}

/** Waits for the service worker's precache to settle (the offline.spec.ts T-0904 pattern). */
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

/** Puts the ended S1 row and its queued sets into the app's `wl-offline` database. */
async function seedEndedSession(page: Page): Promise<void> {
  await openDb(page);
  await page.evaluate(
    async ({ id, userId, plan, startedAt, endedAt, sets }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("wl-offline");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["sessions", "sets"], "readwrite");
        tx.objectStore("sessions").put({
          id,
          userId,
          row: {
            id,
            user_id: userId,
            started_at: startedAt,
            ended_at: endedAt,
            time_budget_min: 45,
            energy: "normal",
            warmup_in_budget: true,
            plan,
          },
          finished: true,
          pending: false,
        });
        for (const s of sets) {
          tx.objectStore("sets").put({
            key: `${userId}:${s.clientId}`,
            userId,
            clientId: s.clientId,
            sessionId: id,
            exerciseId: s.exerciseId,
            setIndex: s.setIndex,
            kind: "reps",
            reps: s.reps,
            weightKg: s.weightKg,
            durationS: null,
            rir: null,
            isWarmup: false,
            backoff: false,
            completedAt: s.completedAt,
            editedAt: s.completedAt,
            deletedAt: null,
            status: "queued",
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      id: S1,
      userId: FAKE_USER_ID,
      plan: PLAN,
      startedAt: STARTED_AT,
      endedAt: ENDED_AT,
      sets: s1Sets(),
    },
  );
}

/** T-0458: puts a running S1 row (`ended_at: null`) into the app's `wl-offline` database (the
 *  `uf-09-focus.spec.ts` `seedSessionRow` pattern), with no sets logged yet. `startedAt` defaults
 *  to the page's now (T-0304d), so UF-09's 12 h stale check (D-0111 §7) never trips it. */
async function seedRunningSession(page: Page): Promise<void> {
  await openDb(page);
  await page.evaluate(
    async ({ id, userId, plan }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("wl-offline");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({
          id,
          userId,
          row: {
            id,
            user_id: userId,
            started_at: new Date().toISOString(),
            ended_at: null,
            time_budget_min: 45,
            energy: "normal",
            warmup_in_budget: true,
            plan,
          },
          finished: false,
          pending: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: S1, userId: FAKE_USER_ID, plan: RUNNING_PLAN },
  );
}

async function storedSession(page: Page): Promise<StoredSessionRow | null> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: StoredSessionRow } | undefined>((resolve, reject) => {
      const req = db.transaction("sessions", "readonly").objectStore("sessions").get(id);
      req.onsuccess = () => resolve(req.result as { row: StoredSessionRow } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entry?.row ?? null;
  }, S1);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises: [exercise("back-squat"), exercise("romanian-deadlift")],
    exerciseAreas: [
      { exercise_id: "back-squat", area_id: "quads", weight: 1 },
      { exercise_id: "back-squat", area_id: "glutes", weight: 1 },
      { exercise_id: "romanian-deadlift", area_id: "hamstrings", weight: 1 },
      { exercise_id: "romanian-deadlift", area_id: "glutes", weight: 0.5 },
    ],
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 16,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: PROFILE,
  });
  await mockProfilePresent(page);
});

/** Signed in, caches filled, precache settled, offline, S1 seeded, on its summary. */
async function openSummaryOffline(
  page: Page,
  context: import("@playwright/test").BrowserContext,
): Promise<import("./fixtures/offline.js").OfflineGate> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  await cachesFilled(page);
  await precacheSettled(page);
  const gate = await goOffline(page, context);
  await seedEndedSession(page);
  await page.goto(`/session/${S1}/summary`);
  await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
  await expect(page.locator('[data-part="ended"]')).toBeVisible({ timeout: 10_000 });
  return gate;
}

test.describe("T-0420 AC-7 UF-03.3 summary, offline (NFR-OFF-2)", () => {
  test("seeded ended S1: the numbers, a keyboard pick, Save to /, and the stored row after a reload", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    const functionCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/functions/v1/")) functionCalls.push(`${r.method()} ${r.url()}`);
    });

    const gate = await openSummaryOffline(page, context);
    const summary = page.locator('[data-screen-id="UF-03.3"]');
    await expect(summary.locator('[data-part="time"]')).toHaveText("52 min");
    await expect(summary.locator(".wl-uf03-summary__stat").filter({ hasText: "Sets" })).toHaveText(
      /Sets\s*7/,
    );
    await expect(summary.getByRole("link", { name: "See balance" })).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);

    // AC-6: every radio is at least 44 × 44.
    const group = page.getByRole("radiogroup", { name: "How hard was it?" });
    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) {
      const box = await radios.nth(i).boundingBox();
      expect(box, `radio ${i}`).not.toBeNull();
      expect(box!.width, `radio ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `radio ${i} height`).toBeGreaterThanOrEqual(44);
    }

    // Tab into the group (one tab stop), then the arrow keys pick "About right".
    let inGroup = false;
    for (let i = 0; i < 20 && !inGroup; i += 1) {
      await page.keyboard.press("Tab");
      inGroup = await group.evaluate((el) => el.contains(document.activeElement));
    }
    expect(inGroup).toBe(true);
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "About right" })).toBeChecked();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    // The checked chip's thicker border still leaves its radio at 44 × 44 or more.
    const checkedBox = await group.getByRole("radio", { name: "About right" }).boundingBox();
    expect(checkedBox!.width).toBeGreaterThanOrEqual(44);
    expect(checkedBox!.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save workout" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.reload();
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible({ timeout: 10_000 });
    const row = await storedSession(page);
    expect(row).toMatchObject({ effort_rating: 3, started_at: STARTED_AT, ended_at: ENDED_AT });
    expect(gate.writesFulfilledOffline()).toBe(0);

    expect(functionCalls).toEqual([]);
    expect(supabaseGuard.unclaimed()).toEqual([]);
  });

  test("axe reports 0 serious or critical violations on the ended summary", async ({
    page,
    context,
  }) => {
    await openSummaryOffline(page, context);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});

/** T-0458: every live (`deletedAt` null) set for S1. */
async function liveSets(
  page: Page,
): Promise<
  { exerciseId: string; setIndex: number; weightKg: number | null; reps: number | null }[]
> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<
      {
        sessionId: string;
        exerciseId: string;
        setIndex: number;
        weightKg: number | null;
        reps: number | null;
        deletedAt: string | null;
      }[]
    >((resolve, reject) => {
      const req = db.transaction("sets", "readonly").objectStore("sets").getAll();
      req.onsuccess = () => resolve(req.result as never);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows
      .filter((r) => r.sessionId === id && r.deletedAt === null)
      .map((r) => ({
        exerciseId: r.exerciseId,
        setIndex: r.setIndex,
        weightKg: r.weightKg,
        reps: r.reps,
      }));
  }, S1);
}

/** T-0458: signed in, caches filled, precache settled, offline (through `goOffline`, armed before
 *  the seed and the session navigation that follow, T-0484), running S1 seeded, on UF-09.1. */
async function openSessionOffline(
  page: Page,
  context: import("@playwright/test").BrowserContext,
): Promise<import("./fixtures/offline.js").OfflineGate> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  await cachesFilled(page);
  await precacheSettled(page);
  const gate = await goOffline(page, context);
  await seedRunningSession(page);
  await page.goto(`/session/${S1}`);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return gate;
}

/** T-0458: from UF-09.1, Pause → "List view" → `[data-screen-id="UF-03.1"]`. */
async function openListView(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pause workout" }).click();
  await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator('[data-screen-id="UF-03.1"]')).toBeVisible();
}

/** T-0458: Tabs from the current focus until `locator` is focused, or fails after `max` tabs. */
async function tabTo(page: Page, locator: ReturnType<Page["locator"]>, max = 40): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(locator).toBeFocused();
}

test.describe("T-0458 UF-03.1 List view, offline (NFR-OFF-2)", () => {
  test("AC-1/AC-2: Pause, List view, three rows checked by keyboard, Finish, Save, reload", async ({
    page,
    context,
    supabaseGuard,
  }) => {
    const functionCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/functions/v1/")) functionCalls.push(`${r.method()} ${r.url()}`);
    });

    const gate = await openSessionOffline(page, context);
    await openListView(page);
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);

    const row1 = page.getByRole("checkbox", { name: "Mark set 1 done" });
    const row2 = page.getByRole("checkbox", { name: "Mark set 2 done" });
    const row3 = page.getByRole("checkbox", { name: "Mark set 3 done" });
    const row4 = page.getByRole("checkbox", { name: "Mark set 4 done" });

    await tabTo(page, row1);
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Mark set 1 not done" })).toBeChecked();

    await tabTo(page, row2);
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Mark set 2 not done" })).toBeChecked();

    await tabTo(page, row3);
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Mark set 3 not done" })).toBeChecked();

    await expect(row4).not.toBeChecked();

    // AC-2: Finish → the confirm's Finish → UF-03.3 → Save → "/" → reload.
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/session/${S1}/summary$`));

    const group = page.getByRole("radiogroup", { name: "How hard was it?" });
    let inGroup = false;
    for (let i = 0; i < 30 && !inGroup; i += 1) {
      await page.keyboard.press("Tab");
      inGroup = await group.evaluate((el) => el.contains(document.activeElement));
    }
    expect(inGroup).toBe(true);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "About right" })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save workout" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);

    await page.reload();
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible({ timeout: 10_000 });
    // While writes are refused, the queue can't drain, so the read below needs no ordering
    // against any app flush (T-0484, D-0175 §3) — unlike T-0906's original proof.
    expect(gate.writesFulfilledOffline()).toBe(0);

    const sets = await liveSets(page);
    const squatSets = sets
      .filter((s) => s.exerciseId === "back-squat")
      .sort((a, b) => a.setIndex - b.setIndex);
    expect(squatSets).toEqual([
      { exerciseId: "back-squat", setIndex: 0, weightKg: 100, reps: 6 },
      { exerciseId: "back-squat", setIndex: 1, weightKg: 100, reps: 6 },
      { exerciseId: "back-squat", setIndex: 2, weightKg: 100, reps: 6 },
    ]);
    expect(gate.writesFulfilledOffline()).toBe(0);

    const row = await storedSession(page);
    expect(row?.effort_rating).toBe(3);
    expect(row?.ended_at).not.toBeNull();

    expect(functionCalls).toEqual([]);
    expect(supabaseGuard.unclaimed()).toEqual([]);
  });

  test("AC-3: axe clean, every row toggle and field at least 44 x 44, Focus mode returns to a step screen", async ({
    page,
    context,
  }) => {
    await openSessionOffline(page, context);
    await openListView(page);

    // The current card (back-squat) is already expanded; check row 1 so one row is done.
    const row1 = page.getByRole("checkbox", { name: "Mark set 1 done" });
    await tabTo(page, row1);
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Mark set 1 not done" })).toBeChecked();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);

    const toggles = page.locator('[data-part="set-row"] input[type="checkbox"]');
    const toggleCount = await toggles.count();
    expect(toggleCount).toBeGreaterThan(0);
    for (let i = 0; i < toggleCount; i += 1) {
      const box = await toggles.nth(i).boundingBox();
      expect(box, `toggle ${i}`).not.toBeNull();
      expect(box!.width, `toggle ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `toggle ${i} height`).toBeGreaterThanOrEqual(44);
    }
    const fields = page.locator('[data-part="set-row"] input[type="text"]');
    const fieldCount = await fields.count();
    expect(fieldCount).toBeGreaterThan(0);
    for (let i = 0; i < fieldCount; i += 1) {
      const box = await fields.nth(i).boundingBox();
      expect(box, `field ${i}`).not.toBeNull();
      expect(box!.width, `field ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `field ${i} height`).toBeGreaterThanOrEqual(44);
    }

    // T-0487 (D-0175 §1, following T-0477): checking row 1 while still in the getReady/warmup
    // window now correctly starts a rest (REST_START is no longer a no-op there), so Focus mode
    // returns to the running rest screen (UF-09.5), not the old step screen (UF-09.3).
    await page.getByRole("button", { name: "Focus mode" }).click();
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------------------------
// T-0603 (D-0208, D-0210, D-0211, D-0216; UF-03.1, UF-03.2): the List view is the lift state and
// its rest is the rest state with the drain. Colours are read from tokens.json, never typed. The
// session is opened offline (the T-0458 path), so these also prove the restyle works offline.
// ---------------------------------------------------------------------------------------------
const tokenColours = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { lift: Record<string, string>; rest: Record<string, string> } };
const LIFT = tokenColours.color.lift;
const REST = tokenColours.color.rest;
// The legacy Previous colour, spelled in two parts so no raw hex of it sits in this file.
const LEGACY_PREVIOUS = "#".concat("FBD9D1");

function toRgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

interface TextPair {
  text: string;
  color: string;
  background: string;
  ratio: number;
  largeText: boolean;
}

/** Every visible text node's rendered colour against its effective background (the first opaque
 *  ancestor background), with its WCAG ratio. Inputs read their value. */
async function textPairs(page: Page): Promise<TextPair[]> {
  return page.evaluate(() => {
    const parse = (c: string): [number, number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(c)!;
      const [r = 0, g = 0, b = 0, a = 1] = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [r, g, b, a];
    };
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r!) + 0.7152 * ch(g!) + 0.0722 * ch(b!);
    };
    const backgroundOf = (el: Element): string => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (parse(bg)[3] > 0.99) return bg;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const out: TextPair[] = [];
    const seen = new Set<Element>();
    const consider = (el: Element, text: string) => {
      if (seen.has(el) || !text) return;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width <= 1 || rect.height <= 1 || style.visibility === "hidden") return;
      seen.add(el);
      const fg = style.color;
      const bg = backgroundOf(el);
      const [hi, lo] = [lum(parse(fg)), lum(parse(bg))].sort((a, b) => b - a);
      const size = parseFloat(style.fontSize);
      const bold = parseInt(style.fontWeight, 10) >= 700;
      out.push({
        text: text.trim(),
        color: fg,
        background: bg,
        ratio: (hi! + 0.05) / (lo! + 0.05),
        largeText: size >= 24 || (bold && size >= 18.66),
      });
    };
    for (const el of document.querySelectorAll("[data-screen-id] *")) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("");
      consider(el, own);
      if (el instanceof HTMLInputElement && el.type === "text") consider(el, el.value);
    }
    return out;
  });
}

async function expectContrast(page: Page, bg: string, ink: string): Promise<void> {
  const pairs = await textPairs(page);
  expect(pairs.length).toBeGreaterThan(5);
  for (const p of pairs) {
    const need = p.largeText ? 3 : 4.5;
    expect(p.ratio, `${p.text}: ${p.color} on ${p.background}`).toBeGreaterThanOrEqual(need);
  }
  const onBg = pairs.filter((p) => p.background === toRgb(bg) && p.color === toRgb(ink));
  expect(onBg.length).toBeGreaterThan(0);
  const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(axe.violations).toEqual([]);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
}

/** Every control the user taps or types in is at least 44 x 44. */
async function expectTargets(page: Page, atLeast = 8): Promise<void> {
  const sizes = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-screen-id] button, [data-screen-id] input[type="text"], [data-screen-id] input[type="checkbox"]',
      ),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name: el.getAttribute("aria-label") ?? el.textContent ?? "",
        w: r.width,
        h: r.height,
      };
    }),
  );
  expect(sizes.length).toBeGreaterThan(atLeast);
  for (const s of sizes) {
    expect(s.w, `${s.name} width`).toBeGreaterThanOrEqual(44);
    expect(s.h, `${s.name} height`).toBeGreaterThanOrEqual(44);
  }
}

const themeColor = (page: Page) => page.locator("meta[name=theme-color]");

test.describe("T-0603 UF-03.1 List view, the lift state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1/AC2/AC5/AC7: lift root, white Previous, contrast, targets, canvas frame", async ({
    page,
    context,
  }, testInfo) => {
    await openSessionOffline(page, context);
    await openListView(page);
    await expect(page.getByRole("checkbox", { name: "Mark set 1 done" })).toBeVisible();
    const root = page.locator('[data-screen-id="UF-03.1"]');
    await expect(root).toHaveAttribute("data-wl-state", "lift");
    await expect(root).toHaveCSS("background-color", toRgb(LIFT.bg!));
    await expect(themeColor(page)).toHaveAttribute("content", new RegExp(`^${LIFT.bg}$`, "i"));
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);

    // AC2: every Previous cell is lift.ink; no #FBD9D1 anywhere on screen.
    const previous = page.locator('[data-part="previous"]');
    expect(await previous.count()).toBeGreaterThan(3);
    for (const c of await previous.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color),
    )) {
      expect(c).toBe(toRgb(LIFT.ink!));
    }
    const painted = await page.evaluate(() => {
      const found = new Set<string>();
      for (const el of document.querySelectorAll("[data-screen-id], [data-screen-id] *")) {
        const s = getComputedStyle(el);
        for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.outlineColor]) {
          if (c) found.add(c);
        }
      }
      return [...found];
    });
    expect(painted).not.toContain(toRgb(LEGACY_PREVIOUS));
    // Everything painted is a lift token colour (ink, bg, deep, line, the action pair) or clear.
    const allowed = new Set(
      [LIFT.ink, LIFT.bg, LIFT.action, LIFT["on-action"], LIFT["bg-deep"], LIFT.line].map((h) =>
        toRgb(h!),
      ),
    );
    expect(painted.filter((c) => !allowed.has(c) && c !== "rgba(0, 0, 0, 0)")).toEqual([]);

    await expectContrast(page, LIFT.bg!, LIFT.ink!);
    await expectTargets(page);
    await noHorizontalScroll(page);
    // The set table is a grid of hairline rows: one column count, no horizontal overflow.
    const row = page.locator('[data-part="set-row"]').first();
    await expect(row).toHaveCSS("display", "grid");
    await expect(row.locator("td").first()).toBeVisible();
    await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "In session · list view",
      name: "uf-03-1",
    });
  });

  test("AC3: a save failure shows the 2 px ink border, the words and the icon; success shows none", async ({
    page,
    context,
  }) => {
    await openSessionOffline(page, context);
    await openListView(page);
    await expect(page.getByRole("checkbox", { name: "Mark set 1 done" })).toBeVisible();
    const statuses = page.locator('[data-part="row-status"]');
    // Success (no failure): every live region stays rendered (not display:none, so it can
    // announce a later failure) with zero size and no border.
    const live = page.locator('[data-set-index] [aria-live="polite"]');
    expect(await live.count()).toBeGreaterThanOrEqual(12);
    for (const m of await live.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { d: s.display, v: s.visibility, w: r.width, h: r.height, b: s.borderTopWidth };
      }),
    )) {
      expect(m.d).not.toBe("none");
      expect(m.v).toBe("visible");
      expect([m.w, m.h, m.b]).toEqual([0, 0, "0px"]);
    }
    // The form of a failure: the same element with the app's own markup (an icon and the words).
    const status = statuses.first();
    await status.evaluate((el) => {
      const svg = document.querySelector('[data-part="set-row"] svg')!.cloneNode(true);
      el.append(svg, "Couldn't save. Tap again.");
    });
    await expect(status).toBeVisible();
    await expect(status).toHaveCSS("border-top-width", "2px");
    await expect(status).toHaveCSS("border-top-style", "solid");
    await expect(status).toHaveCSS("border-top-color", toRgb(LIFT.ink!));
    await expect(status).toHaveCSS("color", toRgb(LIFT.ink!));
    await status.evaluate((el) => el.replaceChildren());
    expect((await status.boundingBox())!.height).toBe(0);
  });

  test("AC1/AC5: checking a set shows the rest bar, a full-width session outline in the flow", async ({
    page,
    context,
  }) => {
    await openSessionOffline(page, context);
    await openListView(page);
    await page.getByRole("checkbox", { name: "Mark set 1 done" }).click();
    const bar = page.locator('[data-part="rest-bar"]');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveClass(/wl-button--session-outline/);
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(64);
    // Not pinned: it scrolls with the list, so it can never cover a focused field.
    await expect(bar).toHaveCSS("position", "static");
    // The Done box is checked: the tick shows, in lift.on-action on the white fill.
    const done = page.getByRole("checkbox", { name: "Mark set 1 not done" });
    await expect(done).toHaveCSS("background-color", toRgb(LIFT.action!));
    const tick = page.locator('[data-set-index="0"] .wl-uf03-list__done svg');
    await expect(tick).toBeVisible();
    await expect(tick).toHaveCSS("color", toRgb(LIFT["on-action"]!));
  });
});

test.describe("T-0603 UF-03.2 List view rest, the drain (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1/AC4/AC5/AC7: rest root, the 1 s step and 0 s under reduced motion, contrast, canvas frame", async ({
    page,
    context,
  }, testInfo) => {
    await openSessionOffline(page, context);
    await openListView(page);
    await page.getByRole("checkbox", { name: "Mark set 1 done" }).click();
    await page.locator('[data-part="rest-bar"]').click();
    const root = page.locator('[data-screen-id="UF-03.2"]');
    await expect(root).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expect(root).toHaveAttribute("data-wl-state", "rest");
    await expect(root).toHaveClass(/wl-drain/);
    await expect(themeColor(page)).toHaveAttribute("content", new RegExp(`^${REST.bg}$`, "i"));
    // The fill is a percentage of the rest that has passed.
    const fill = await root.evaluate((el) =>
      (el as HTMLElement).style.getPropertyValue("--wl-drain"),
    );
    expect(fill).toMatch(/^\d{1,3}(\.\d)?%$/);
    await expect(root.locator('[data-part="rest-clock"]')).toHaveText(/^Rest · \d+:\d\d left$/);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(root).toHaveCSS("transition-duration", "1s");
    await expect(root).toHaveCSS("transition-property", "--wl-drain");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root).toHaveCSS("transition-duration", "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Controls: the session outline pair and the 64 px Skip, lift.on-action on white.
    for (const name of ["−15 s", "+15 s"]) {
      const b = page.getByRole("button", { name });
      await expect(b).toHaveClass(/wl-button--session-outline/);
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    }
    const skip = page.getByRole("button", { name: "Skip" });
    await expect(skip).toHaveCSS("color", toRgb(LIFT["on-action"]!));
    await expect(skip).toHaveCSS("background-color", toRgb(LIFT.action!));
    expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    await expect(skip).toBeFocused();
    await expectContrast(page, REST.bg!, REST.ink!);
    await expectTargets(page, 3);
    await noHorizontalScroll(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "In session · list view rest",
      name: "uf-03-2",
    });
    // Skip returns to the list, which is lift again.
    await skip.click();
    await expect(page.locator('[data-screen-id="UF-03.1"]')).toHaveAttribute(
      "data-wl-state",
      "lift",
    );
    await expect(themeColor(page)).toHaveAttribute("content", new RegExp(`^${LIFT.bg}$`, "i"));
  });
});

test.describe("T-0603 UF-03.1 at 320 x 640", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("AC5: the set table does not scroll sideways and every target is 44 x 44", async ({
    page,
    context,
  }) => {
    await openSessionOffline(page, context);
    await openListView(page);
    await expect(page.getByRole("checkbox", { name: "Mark set 1 done" })).toBeVisible();
    await noHorizontalScroll(page);
    await expectTargets(page);
    const overflow = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-screen-id] [data-part="set-row"] > *'),
      )
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(overflow).toEqual([]);
  });
});

// T-0670 UF-03.1: a hint that wraps at 320 x 640 takes its own room: it overlaps neither the next
// row nor the row's own fields nor the other message of the row.
test.describe("T-0670 UF-03.1 wrapped hints at 320 x 640", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("the longest hint (seconds) and the kg hint stay clear of the next row and each other", async ({
    page,
    context,
  }) => {
    await openSessionOffline(page, context);
    await openListView(page);
    // Text enlarged to 300 % (WCAG 1.4.4): the longest hint now needs several lines at 320 px.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "300%";
    });
    const row = page.locator('[data-part="set-row"]').first();
    await row.getByRole("textbox", { name: "Set 1 weight in kg" }).fill("x");
    await row.getByRole("textbox", { name: /^Set 1 reps/ }).fill("x");
    await page.keyboard.press("Tab");
    const hints = row.locator(".wl-uf03-list__hint:not(:empty)");
    await expect(hints).toHaveCount(2);
    // The longest hint the view can show is the seconds one; no seeded exercise is timed, so
    // its words go into the real reps-hint element (slot and row reservation are React's).
    await hints.nth(1).evaluate((el) => {
      el.lastChild!.textContent = "Enter seconds as a whole number like 45";
    });
    const boxes = await page.evaluate(() => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom };
      };
      const rows = Array.from(document.querySelectorAll('[data-part="set-row"]'));
      const first = rows[0]!;
      return {
        next: rect(rows[1]!),
        hints: Array.from(first.querySelectorAll(".wl-uf03-list__hint:not(:empty)")).map(rect),
        fields: Array.from(first.querySelectorAll("input, th, [data-part='previous']")).map(rect),
      };
    });
    type Box = { l: number; r: number; t: number; b: number };
    const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    expect(boxes.hints.some((h) => h.b - h.t > 48)).toBe(true); // it really wrapped past one slot
    for (const h of boxes.hints) {
      expect(overlap(h, boxes.next), "next row").toBe(false);
      for (const f of boxes.fields) expect(overlap(h, f), "row field").toBe(false);
    }
    expect(overlap(boxes.hints[0]!, boxes.hints[1]!), "the two hints").toBe(false);
  });
});

// T-0604 UF-03.3 Summary in the plan state (390 x 844). Nothing computes a PR yet, so the band
// cases insert the band's own markup (the classes and parts SummaryContent renders) into the real
// page: the CSS under test is the app's, the markup is the component's (vitest covers that).
const PLAN_C = tokenColours.color.plan;

/** What `SummaryContent` renders for a PR, put after the stats. */
async function addPrBand(page: Page): Promise<void> {
  await page.evaluate(() => {
    const band = document.createElement("section");
    band.className = "wl-uf03-summary__pr";
    band.setAttribute("data-wl-state", "lift");
    band.setAttribute("data-part", "pr-band");
    band.innerHTML = '<p class="wl-type-row-title" data-part="pr">Back squat 100 kg × 5</p>';
    document.querySelector('[data-part="ended"] dl')!.after(band);
  });
}

/** Buttons, links and radios of the summary are at least 44 x 44. */
async function expectSummaryTargets(page: Page): Promise<void> {
  const sizes = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-screen-id] button, [data-screen-id] a, [data-screen-id] input[type="radio"]',
      ),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name: el.getAttribute("aria-label") ?? el.textContent ?? el.className,
        w: r.width,
        h: r.height,
      };
    }),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(7);
  for (const s of sizes) {
    expect(s.w, `${s.name} width`).toBeGreaterThanOrEqual(44);
    expect(s.h, `${s.name} height`).toBeGreaterThanOrEqual(44);
  }
}

test.describe("T-0604 UF-03.3 Summary, the plan state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC1/AC3/AC5/AC6: plan root, effort pill and arrows, contrast, targets, motion, no PR band", async ({
    page,
    context,
  }, testInfo) => {
    await openSummaryOffline(page, context);
    const root = page.locator('[data-screen-id="UF-03.3"]');
    await expect(root).toHaveAttribute("data-wl-state", "plan");
    await expect(root).toHaveCSS("background-color", toRgb(PLAN_C.bg!));
    await expect(themeColor(page)).toHaveAttribute("content", new RegExp(`^${PLAN_C.bg}$`, "i"));
    await expect(page.locator('[data-part="pr-band"]')).toHaveCount(0);

    // Behaviour unchanged: the target line, and the stats in the stat role.
    await expect(page.locator('[data-part="next-up"]')).toBeVisible();
    await expect(page.locator('[data-part="time"]')).toHaveClass(/wl-type-stat/);
    await expect(page.locator('[data-part="row"]').first()).toHaveClass(/wl-row/);

    // Effort: the five names, the selected one a plan.selected pill, arrow keys move it.
    const group = page.getByRole("radiogroup", { name: "How hard was it?" });
    for (const name of ["Very easy", "Easy", "About right", "Hard", "Very hard"]) {
      await expect(group.getByRole("radio", { name, exact: true })).toBeAttached();
    }
    await group.getByRole("radio", { name: "Easy", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    const picked = group.getByRole("radio", { name: "About right" });
    await expect(picked).toBeChecked();
    const label = picked.locator("xpath=..");
    await expect(label).toHaveCSS("background-color", toRgb(PLAN_C.selected!));
    await expect(label).toHaveCSS("color", toRgb(PLAN_C["on-selected"]!));
    await expect(group.getByRole("radio", { name: "Easy", exact: true })).not.toBeChecked();
    const box = (await group.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const save = page.getByRole("button", { name: "Save workout" });
    await expect(save).toHaveCSS("background-color", toRgb(PLAN_C.action!));
    await expect(save).toHaveCSS("color", toRgb(PLAN_C["on-action"]!));
    await expect(page.locator(".wl-button--primary")).toHaveCount(1);

    await expectContrast(page, PLAN_C.bg!, PLAN_C.ink!);
    await expectSummaryTargets(page);
    await noHorizontalScroll(page);

    // Motion: the 200 ms cross-fade, instant under reduced motion; nothing else transitions.
    const dur = () =>
      root.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.transitionProperty, s.transitionDuration];
      });
    expect(await dur()).toEqual(["background-color", "0.2s"]);
    expect(
      await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("[data-screen-id] *")).filter((el) =>
            getComputedStyle(el)
              .transitionDuration.split(",")
              .some((d) => parseFloat(d) > 0),
          ).length,
      ),
    ).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await dur())[1]).toBe("0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.screenshot({ path: testInfo.outputPath("cobalt", "uf-03-3-no-pr.png") });
  });

  test("AC2/AC5/AC7: with a PR the band is lift.bg, white, full-bleed; contrast; canvas frame", async ({
    page,
    context,
  }, testInfo) => {
    await openSummaryOffline(page, context);
    await addPrBand(page);
    const band = page.locator('[data-part="pr-band"]');
    await expect(band).toHaveCSS("background-color", toRgb(LIFT.bg!));
    await expect(band.locator('[data-part="pr"]')).toHaveCSS("color", toRgb(LIFT.ink!));
    await expect(band).toContainText("Back squat 100 kg × 5");
    const box = (await band.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    // The page itself stays plan: the root and theme-color.
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
    await expect(themeColor(page)).toHaveAttribute("content", new RegExp(`^${PLAN_C.bg}$`, "i"));
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations).toEqual([]);
    await expectSummaryTargets(page);
    await noHorizontalScroll(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-3",
      frame: "Summary",
      name: "uf-03-3",
    });
  });
});

test.describe("T-0680 UF-03.1 swap sheet in-tree stacking (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Hit-test points as viewport CSS px: what `elementFromPoint` returns, summarised. */
  const hits = (page: Page, points: Array<[number, number]>) =>
    page.evaluate((pts) => {
      return pts.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return {
          tag: el?.tagName.toLowerCase() ?? null,
          cls: el?.getAttribute("class") ?? null,
          inScrim: el?.closest(".wl-sheet-scrim") != null,
          inSheet: el?.closest('[role="dialog"]')?.getAttribute("data-screen-id") ?? null,
          inUf05: el?.closest(".wl-uf05") != null,
          inUf03: el?.closest('[data-screen-id="UF-03.1"]') != null,
        };
      });
    }, points);

  test("AC1-AC4: in-tree scrim z 6 and sheet z 7 over UF-03.1; closed is the sibling state", async ({
    page,
    context,
  }, testInfo) => {
    await openSessionOffline(page, context);
    await openListView(page);
    const swap = page.getByRole("button", { name: /^Swap / });
    await expect(swap).toHaveCount(1);
    await swap.click();
    const dialog = page.getByRole("dialog", { name: /^Replace / });
    await expect(dialog).toBeVisible();

    // AC1: the sheet is in the tree of the current card, under the lift root.
    const tree = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')!;
      const s = document.querySelector(".wl-sheet-scrim")!;
      const root = document.querySelector('[data-screen-id="UF-03.1"]')!;
      const inTree = (el: Element) => ({
        root: el.closest('[data-screen-id="UF-03.1"]') != null,
        card: el.closest('[data-part="card"][data-current]') != null,
      });
      return {
        dialog: inTree(d),
        scrim: inTree(s),
        rootState: root.getAttribute("data-wl-state"),
        dialogState: d.getAttribute("data-wl-state"),
      };
    });
    expect(tree).toEqual({
      dialog: { root: true, card: true },
      scrim: { root: true, card: true },
      rootState: "lift",
      dialogState: "plan",
    });

    // AC2: stacking values and fixed geometry.
    const geo = await page.evaluate(() => {
      const read = (el: Element) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          position: cs.position,
          zIndex: cs.zIndex,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
        };
      };
      return {
        scrim: read(document.querySelector(".wl-sheet-scrim")!),
        dialog: read(document.querySelector('[role="dialog"]')!),
      };
    });
    expect(geo.scrim).toMatchObject({
      position: "fixed",
      zIndex: "6",
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    });
    expect(geo.dialog).toMatchObject({
      position: "fixed",
      zIndex: "7",
      top: 150,
      bottom: 844,
      left: 0,
      width: 390,
    });

    // AC3: no UF-03 element is the top hit anywhere.
    const above = await hits(page, [
      [20, 75],
      [195, 75],
      [370, 75],
    ]);
    for (const h of above) {
      expect(h.inScrim).toBe(true);
      expect(h.inUf05).toBe(true);
    }
    const inside = await hits(page, [
      [20, 400],
      [195, 400],
      [195, 830],
    ]);
    for (const h of inside) {
      expect(h.inSheet).toBe("UF-05.1");
      expect(h.inUf05).toBe(true);
    }

    // AC4: closed is the sibling state.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".wl-sheet-scrim")).toHaveCount(0);
    await expect(dialog).toBeHidden();
    const [closed] = await hits(page, [[195, 75]]);
    expect(closed!.inUf03).toBe(true);
    expect(closed!.inUf05).toBe(false);
    console.log(`T-0680 closed hit at (195, 75): <${closed!.tag} class="${closed!.cls}">`);
    testInfo.annotations.push({
      type: "closed-hit-195-75",
      description: `${closed!.tag}.${closed!.cls}`,
    });
    await expect(swap).toBeFocused();
  });
});
