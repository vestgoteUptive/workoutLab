// T-0304a UF-09 Focus mode e2e (AC-13, AC-7 touch target). Runs against `vite preview` with
// Supabase mocked through `page.route`; T-0304b–e append their rows to this file.
//
// `test`/`expect` come from `fixtures/guarded-test.js` (D-0086): a Supabase request no route
// claims fails the test at teardown. The UF-09 host itself makes no network call (D-0111 §11);
// the requests here are the shell's (AutoSync, the profile gate on `/`), claimed by the mocks.
//
// The "built" row seeds one `sessions` row straight into the app's own IndexedDB, in the
// `QueuedSession` shape `upsertSession` writes (`lib/offline/db.ts`), after the app has opened
// the database. It uses `pending: false`, so AutoSync has nothing to flush.
import { randomUUID } from "node:crypto";
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

const NOT_ON_DEVICE = "This workout isn't on this device";

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

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises: [],
    exerciseAreas: [],
    areaTargets: [],
    profile: PROFILE,
  });
  await mockProfilePresent(page);
  await page.goto("/");
  await injectSession(page);
});

async function expectNotOnDevice(page: Page, timeout?: number): Promise<void> {
  const host = page.locator('[data-screen-id="UF-09"]');
  await expect(host.getByRole("heading", { level: 1, name: NOT_ON_DEVICE })).toBeVisible({
    timeout,
  });
  await expect(host.getByRole("link")).toHaveAttribute("href", "/");
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
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

test.describe("AC-13 not on this device", () => {
  test("online: /session/<random uuid> shows the built not-on-device state and a link to /", async ({
    page,
  }) => {
    await page.goto(`/session/${randomUUID()}`);
    await expectNotOnDevice(page);
  });

  test("offline: after the precache settles, a reload shows the same text within 3 s", async ({
    page,
    context,
  }) => {
    const url = `/session/${randomUUID()}`;
    await page.goto(url);
    await expectNotOnDevice(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await page.reload();
    await expectNotOnDevice(page, 3000);
  });

  test("axe reports 0 serious or critical violations", async ({ page }) => {
    await page.goto(`/session/${randomUUID()}`);
    await expectNotOnDevice(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });
});

const PLAN = {
  version: 1,
  mainLiftId: "bench-press",
  warmup: [{ exerciseId: "wu-arm-circle", durationS: 40 }],
  items: [
    {
      exerciseId: "bench-press",
      isMain: true,
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      durationS: null,
      costS: 720,
      backoff: null,
      prefill: { weightKg: 80, reps: 6, durationS: null, kind: "add_rep" },
      reasons: [],
    },
  ],
  startDeficits: {
    chest: 1,
    back: 1,
    shoulders: 1,
    arms: 1,
    core: 1,
    glutes: 1,
    quads: 1,
    hamstrings: 1,
    calves: 1,
  },
};

/** Puts one `sessions` row into the app's `wl-offline` database (opened by the app first).
 *  T-0304b: `plan` defaults to `PLAN`. */
async function seedSessionRow(page: Page, id: string, plan: object = PLAN): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
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
            started_at: new Date().toISOString(),
            time_budget_min: 45,
            energy: "normal",
            warmup_in_budget: true,
            ended_at: null,
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
    { id, userId: FAKE_USER_ID, plan },
  );
}

test.describe("AC-7 the chrome on a seeded session", () => {
  test("UF-09.1: one screen id, Pause workout is at least 44 x 44, no navigation, axe clean", async ({
    page,
  }) => {
    // TR-0036 (fixed by T-0229, D-0117): the seeded row parses under the app's strict CSP.
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    const id = randomUUID();
    await seedSessionRow(page, id);
    await page.goto(`/session/${id}`);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    const pause = page.getByRole("button", { name: "Pause workout" });
    const box = await pause.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    // T-0304f (D-0118 §12): the built UF-09.1 with a warm-up has Pause, Start now, Skip warm-up.
    await expect(page.getByRole("button")).toHaveCount(3);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
    // Pause → UF-09.9 with its one button, Resume.
    await pause.click();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  });
});

// T-0304b AC-12 (D-0086, D-0091 §1, NFR-OFF-2, NFR-A11Y-2): one set logged offline, from UF-09.3
// through the UF-09.4 auto-save to UF-09.5, with the row in IndexedDB.
const NO_WARMUP_PLAN = { ...PLAN, warmup: [] };

interface StoredSetRow {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: string;
  reps: number | null;
  weightKg: number | null;
  isWarmup: boolean;
  backoff: boolean;
}

async function setsFor(page: Page, sessionId: string): Promise<StoredSetRow[]> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction("sets", "readonly").objectStore("sets").getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (rows as StoredSetRow[]).filter((r) => r.sessionId === id);
  }, sessionId);
}

async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
}

test.describe("T-0304b AC-12 one set offline", () => {
  test("UF-09.3 Done set (≥ 200 px) → UF-09.4 auto-save after 5 s → UF-09.5; one row in wl-offline.sets", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    const id = randomUUID();
    await seedSessionRow(page, id, NO_WARMUP_PLAN);
    await page.goto(`/session/${id}`);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
    await precacheSettled(page);
    await context.setOffline(true);
    await page.reload();

    // UF-09.3 after UF-09.1's 5 s: built content, not just a screen id.
    const current = page.locator('[data-screen-id="UF-09.3"]');
    await expect(current.getByText("Set 1 of 4")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    const done = page.getByRole("button", { name: "Done set" });
    const box = await done.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(200);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expectAxeClean(page);

    // UF-09.4, then the real 5 s auto-save to UF-09.5.
    await done.click();
    const confirm = page.locator('[data-screen-id="UF-09.4"]');
    await expect(confirm.getByRole("button", { name: "Save" })).toBeVisible();
    await expectAxeClean(page);
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });

    const rows = await setsFor(page, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseId: "bench-press",
      setIndex: 0,
      kind: "reps",
      reps: 6,
      weightKg: 80,
      isWarmup: false,
      backoff: false,
    });
  });
});

// T-0304f AC-5 (D-0086, D-0091 §1, NFR-OFF-2): UF-09.1 → Skip warm-up → UF-09.3 → Done set →
// the auto-save → UF-09.5 → +15 s → Skip rest → UF-09.3 set 2, all offline after a reload; axe on
// UF-09.1, .5 and .6 (the two-item variant reaches UF-09.6).
const TWO_SETS_PLAN = {
  ...PLAN,
  items: [{ ...PLAN.items[0]!, sets: 2 }],
};

const TWO_ITEMS_PLAN = {
  ...PLAN,
  warmup: [],
  items: [
    { ...PLAN.items[0]!, sets: 1 },
    {
      exerciseId: "barbell-row",
      isMain: false,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      durationS: null,
      costS: 555,
      backoff: null,
      prefill: { weightKg: 60, reps: 8, durationS: null, kind: "add_rep" },
      reasons: [],
    },
  ],
};

/** Seeds `plan`, opens it once online, settles the precache, then goes offline and reloads with
 *  no stored focus state, so UF-09.1 starts afresh. */
async function openOffline(
  page: Page,
  context: { setOffline(offline: boolean): Promise<void> },
  plan: object,
): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  const id = randomUUID();
  await seedSessionRow(page, id, plan);
  await page.goto(`/session/${id}`);
  await expect(page.locator('[data-screen-id^="UF-09."]')).toBeVisible();
  await precacheSettled(page);
  await context.setOffline(true);
  await page.evaluate((key) => window.localStorage.removeItem(key), `wl-focus:${id}`);
  await page.reload();
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
}

test.describe("T-0304f AC-5 get ready, rest and next, offline", () => {
  test("UF-09.1 Skip warm-up → UF-09.3 → Done set → UF-09.5 'Next · set 2 of 2' → +15 s → Skip rest → set 2", async ({
    page,
    context,
  }) => {
    await openOffline(page, context, TWO_SETS_PLAN);
    const ready = page.locator('[data-screen-id="UF-09.1"]');
    await expect(ready.getByRole("heading", { level: 1, name: "Get ready" })).toBeVisible();
    const skipWarmup = ready.getByRole("button", { name: "Skip warm-up" });
    await expect(skipWarmup).toBeVisible();
    await skipWarmup.click();

    const current = page.locator('[data-screen-id="UF-09.3"]');
    await expect(current.getByText("Set 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Done set" }).click();
    await expect(page.locator('[data-screen-id="UF-09.4"]')).toBeVisible();

    const rest = page.locator('[data-screen-id="UF-09.5"]');
    await expect(rest.getByText("Next · set 2 of 2")).toBeVisible({ timeout: 10_000 });
    const timer = rest.getByRole("timer");
    const before = await timer.textContent();
    await rest.getByRole("button", { name: "+15 s" }).click();
    await expect(timer).not.toHaveText(before ?? "");
    await expect(page.locator('[data-field="announcer"]')).toHaveCount(1);
    await expectAxeClean(page);
    await rest.getByRole("button", { name: "Skip rest" }).click();
    await expect(page.locator('[data-screen-id="UF-09.3"]').getByText("Set 2 of 2")).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });

  test("axe: UF-09.1 (with a warm-up) reports 0 serious or critical violations", async ({
    page,
    context,
  }) => {
    await openOffline(page, context, TWO_SETS_PLAN);
    await expect(page.getByRole("button", { name: "Start now" })).toBeFocused();
    await expectAxeClean(page);
  });

  test("the two-item variant: Start now → set → rest → Skip rest → UF-09.6, axe clean, I'm ready → UF-09.3", async ({
    page,
    context,
  }) => {
    await openOffline(page, context, TWO_ITEMS_PLAN);
    await page.getByRole("button", { name: "Start now" }).click();
    await page.getByRole("button", { name: "Done set" }).click();
    const rest = page.locator('[data-screen-id="UF-09.5"]');
    // The mocked library is empty, so names fall back to the exercise id (D-0118 §8).
    await expect(rest.getByText("Next · barbell-row")).toBeVisible({ timeout: 10_000 });
    await rest.getByRole("button", { name: "Skip rest" }).click();
    const next = page.locator('[data-screen-id="UF-09.6"]');
    await expect(next.getByRole("heading", { level: 1, name: "barbell-row" })).toBeVisible();
    await expect(next.getByText("3 × 8–12")).toBeVisible();
    await expect(next.getByRole("timer")).toHaveText(/^(1:00|0:5\d)$/);
    await expectAxeClean(page);
    await next.getByRole("button", { name: "I'm ready" }).click();
    await expect(page.locator('[data-screen-id="UF-09.3"]').getByText("Set 1 of 3")).toBeVisible();
  });
});

// T-0304c AC-6 (D-0086, D-0091 §1, NFR-OFF-2): UF-09.1 → UF-09.2 → Next move → UF-09.6 → I'm
// ready → UF-09.7 "Get in position" → "Hold", offline after a reload; the hold auto-logs one
// `timed` row and the warm-up none. The hold is 15 s, the smallest `prefill.durationS` the
// SessionPlan contract allows (15..120, D-0062 §5, D-0133): the ticket's 5 s would be an
// unreadable plan (D-0138), so the page clock runs the hold instead (D-0120 §9, D-0142).
const TIMED_PLAN = {
  ...PLAN,
  mainLiftId: null,
  warmup: [{ exerciseId: "wu-arm-circle", durationS: 40 }],
  items: [
    {
      exerciseId: "plank",
      isMain: false,
      sets: 1,
      repsMin: null,
      repsMax: null,
      durationS: 45,
      costS: 120,
      backoff: null,
      prefill: { weightKg: null, reps: null, durationS: 15, kind: "add_rep" },
      reasons: [],
    },
  ],
};

interface StoredTimedRow extends StoredSetRow {
  durationS: number | null;
}

test.describe("T-0304c AC-6 warm-up and a timed set, offline", () => {
  test("UF-09.2 Next move → UF-09.6 → UF-09.7 position → hold; one timed row, no warm-up row; axe clean", async ({
    page,
    context,
  }) => {
    await page.clock.install();
    await openOffline(page, context, TIMED_PLAN);
    await page.getByRole("button", { name: "Start now" }).click();

    // UF-09.2: built content (the move's heading; the mocked library is empty, so its id).
    const warmup = page.locator('[data-screen-id="UF-09.2"]');
    await expect(warmup.getByRole("heading", { level: 1, name: "wu-arm-circle" })).toBeVisible();
    await expect(warmup.getByRole("timer")).toHaveText("0:40");
    await expect(page.getByRole("button", { name: "Next move" })).toBeFocused();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Next move" }).click();

    const next = page.locator('[data-screen-id="UF-09.6"]');
    await expect(next.getByRole("heading", { level: 1, name: "plank" })).toBeVisible();
    await next.getByRole("button", { name: "I'm ready" }).click();

    const timed = page.locator('[data-screen-id="UF-09.7"]');
    // The page clock still flows between steps, so the countdown may have moved on a second.
    await expect(timed.getByText("Get in position")).toBeVisible();
    await expect(timed.getByRole("timer")).toHaveText(/^[1-3]$/);
    await expect(timed.getByText("Hold 0:15")).toBeVisible();
    await page.clock.runFor(3000);
    await expect(timed.getByText("Hold", { exact: true })).toBeVisible();
    await expect(timed.getByRole("timer")).toHaveText(/^0:1[0-5]$/);
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expectAxeClean(page);

    // The hold runs out: one auto-log, then done (the last set) and the summary.
    await page.clock.runFor(15_000);
    await expect
      .poll(async () => (await setsFor(page, id(page))).length, { timeout: 10_000 })
      .toBe(1);
    const rows = (await setsFor(page, id(page))) as StoredTimedRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseId: "plank",
      setIndex: 0,
      kind: "timed",
      durationS: 15,
      reps: null,
      isWarmup: false,
    });
    expect(rows.filter((r) => r.isWarmup || r.exerciseId.startsWith("wu-"))).toEqual([]);
  });
});

/** The session id in the current `/session/<id>…` URL. */
function id(page: Page): string {
  const match = /\/session\/([^/]+)/.exec(new URL(page.url()).pathname);
  if (!match) throw new Error(`not on a session URL: ${page.url()}`);
  return match[1]!;
}
