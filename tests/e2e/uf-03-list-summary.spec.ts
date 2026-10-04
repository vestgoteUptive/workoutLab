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
// caches. `context.setOffline(true)` does not stop `page.route` interception (T-0906), so
// AutoSync's mount flush still runs after a reload regardless of being "offline" in the test. The
// T-0458 AC-1/AC-2 test below therefore installs its own write-abort gate on the Supabase write
// routes once offline, and waits for the refused flush attempt before it reads the queued sets.
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
  VITE_SUPABASE_URL,
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
async function openSummaryOffline(page: Page, context: import("@playwright/test").BrowserContext) {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  await cachesFilled(page);
  await precacheSettled(page);
  await context.setOffline(true);
  await seedEndedSession(page);
  await page.goto(`/session/${S1}/summary`);
  await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
  await expect(page.locator('[data-part="ended"]')).toBeVisible({ timeout: 10_000 });
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

    await openSummaryOffline(page, context);
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

const WRITE_URL_PATTERNS = [
  `${VITE_SUPABASE_URL}/rest/v1/sessions*`,
  `${VITE_SUPABASE_URL}/rest/v1/session_sets*`,
];

/** T-0906: live counters of non-`GET` writes to the `sessions`/`session_sets` routes, counted
 *  independently of the write-abort gate below so that removing the gate (AC-3 fault 1) makes
 *  `fulfilledWhileOffline` go non-zero rather than leaving the counters trivially green. Only
 *  requests made once `armedAt()` has been called are counted (the test arms it right after
 *  `context.setOffline(true)`, which is also when the gate goes offline), so the online warm-up
 *  traffic in `beforeEach`/`openSessionOffline` never pollutes the counts. */
function writeCounters(page: Page): {
  arm: () => void;
  attemptsSinceArmed: () => number;
  fulfilledSinceArmed: () => number;
} {
  let armed = false;
  let attempts = 0;
  let fulfilled = 0;
  const isWriteUrl = (url: string) =>
    url.startsWith(`${VITE_SUPABASE_URL}/rest/v1/sessions`) ||
    url.startsWith(`${VITE_SUPABASE_URL}/rest/v1/session_sets`);
  page.on("request", (request) => {
    if (!armed || request.method() === "GET" || !isWriteUrl(request.url())) return;
    attempts += 1;
  });
  page.on("requestfinished", (request) => {
    if (!armed || request.method() === "GET" || !isWriteUrl(request.url())) return;
    fulfilled += 1;
  });
  return {
    arm: () => {
      armed = true;
    },
    attemptsSinceArmed: () => attempts,
    fulfilledSinceArmed: () => fulfilled,
  };
}

/** T-0906: once installed, aborts every non-`GET` write to the `sessions`/`session_sets` routes
 *  while `goOffline()` has been called, modelled on `recordWrites` in `uf-09-offline.spec.ts`
 *  (T-0468). Registered after `beforeEach`'s `mockSupabaseData`, so it wins (the last-registered
 *  `page.route` handler runs first) and the mount flush that follows a reload gets a real
 *  `net::ERR_INTERNET_DISCONNECTED` instead of a mocked 201. A `GET` always falls through
 *  unchanged, so `mockSupabaseData` keeps answering reads. While online (before `goOffline()`),
 *  a non-`GET` write also falls through unchanged, so the warm-up behaves exactly as it did
 *  before this gate existed. */
async function installWriteAbortGate(page: Page): Promise<{ goOffline: () => void }> {
  let offline = false;
  for (const pattern of WRITE_URL_PATTERNS) {
    await page.route(pattern, async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fallback();
        return;
      }
      if (!offline) {
        await route.fallback();
        return;
      }
      await route.abort("internetdisconnected");
    });
  }
  return {
    goOffline: () => {
      offline = true;
    },
  };
}

/** T-0458/T-0906: signed in, caches filled, precache settled, offline (with the write-abort gate
 *  armed in the same step as `context.setOffline(true)`, before the seed and the session
 *  navigation that follow), running S1 seeded, on UF-09.1. */
async function openSessionOffline(
  page: Page,
  context: import("@playwright/test").BrowserContext,
): Promise<ReturnType<typeof writeCounters>> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  await cachesFilled(page);
  await precacheSettled(page);
  const gate = await installWriteAbortGate(page);
  const counters = writeCounters(page);
  await context.setOffline(true);
  gate.goOffline();
  counters.arm();
  await seedRunningSession(page);
  await page.goto(`/session/${S1}`);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return counters;
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

    const counters = await openSessionOffline(page, context);
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

    // AC-1: order the `sets` read after the refused mount-flush attempt instead of racing it
    // (T-0906). `context.setOffline(true)` does not stop `page.route`, so AutoSync's mount flush
    // still fires after this reload; the write-abort gate from `openSessionOffline` must have
    // already refused it by the time this poll settles.
    await expect.poll(() => counters.attemptsSinceArmed()).toBeGreaterThanOrEqual(1);
    const fulfilledWhileOffline = counters.fulfilledSinceArmed();
    const abortedWhileOffline = counters.attemptsSinceArmed() - fulfilledWhileOffline;
    expect(fulfilledWhileOffline).toBe(0);
    expect(abortedWhileOffline).toBeGreaterThanOrEqual(1);

    const sets = await liveSets(page);
    const squatSets = sets
      .filter((s) => s.exerciseId === "back-squat")
      .sort((a, b) => a.setIndex - b.setIndex);
    expect(squatSets).toEqual([
      { exerciseId: "back-squat", setIndex: 0, weightKg: 100, reps: 6 },
      { exerciseId: "back-squat", setIndex: 1, weightKg: 100, reps: 6 },
      { exerciseId: "back-squat", setIndex: 2, weightKg: 100, reps: 6 },
    ]);

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
