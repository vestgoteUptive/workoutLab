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
  exerciseAreas as setupExerciseAreas,
  exercises as setupExercises,
  profile as setupProfile,
} from "./fixtures/uf-04-library-data.js";

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
 *  T-0304b: `plan` defaults to `PLAN`. T-0304d: `startedAt` defaults to the page's now. */
async function seedSessionRow(
  page: Page,
  id: string,
  plan: object = PLAN,
  startedAt?: string,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
  await page.evaluate(
    async ({ id, userId, plan, startedAt }) => {
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
            started_at: startedAt ?? new Date().toISOString(),
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
    { id, userId: FAKE_USER_ID, plan, startedAt },
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
    // Pause → UF-09.9. T-0304d (D-0118 §12): the built view on this one-item plan has Resume and
    // End workout (no item follows, so no Skip to next exercise). T-0422 (D-0142 §6, a named
    // change): plus the module's Swap seam. T-0416 (D-0142 §6): plus How to and List view.
    await pause.click();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Swap" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(page.getByRole("button", { name: "End workout" })).toBeVisible();
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
    const gate = await goOffline(page, context);
    await page.reload();

    // UF-09.3 after UF-09.1's 5 s: built content, not just a screen id.
    const current = page.locator('[data-screen-id="UF-09.3"]');
    await expect(current.getByText("Lifting · set 1 of 4")).toBeVisible({ timeout: 10_000 });
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
    expect(gate.writesFulfilledOffline()).toBe(0);
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
 *  no stored focus state, so UF-09.1 starts afresh. Returns the gate; most callers ignore it
 *  (T-0484, D-0175 §3) — only the `setsFor` rows below assert on it. */
async function openOffline(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  plan: object,
): Promise<import("./fixtures/offline.js").OfflineGate> {
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  const id = randomUUID();
  await seedSessionRow(page, id, plan);
  await page.goto(`/session/${id}`);
  await expect(page.locator('[data-screen-id^="UF-09."]')).toBeVisible();
  await precacheSettled(page);
  const gate = await goOffline(page, context);
  await page.evaluate((key) => window.localStorage.removeItem(key), `wl-focus:${id}`);
  await page.reload();
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return gate;
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
    await expect(current.getByText("Lifting · set 1 of 2")).toBeVisible();
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
    await expect(
      page.locator('[data-screen-id="UF-09.3"]').getByText("Lifting · set 2 of 2"),
    ).toBeVisible();
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
    await expect(
      page.locator('[data-screen-id="UF-09.3"]').getByText("Lifting · set 1 of 3"),
    ).toBeVisible();
  });
});

// T-0304c AC-6 (D-0086, D-0091 §1, NFR-OFF-2): UF-09.1 → UF-09.2 → Next move → UF-09.6 → I'm
// ready → UF-09.7 "Get in position" → "Hold", offline after a reload; the hold auto-logs one
// `timed` row and the warm-up none. The hold is 15 s, the smallest `prefill.durationS` the
// SessionPlan contract allows (15..120, D-0062 §5, D-0133): the ticket's 5 s would be an
// unreadable plan (D-0138), so the page clock runs the hold instead (D-0120 §9, D-0150).
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
    const gate = await openOffline(page, context, TIMED_PLAN);
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
    expect(gate.writesFulfilledOffline()).toBe(0);
    const rows = (await setsFor(page, id(page))) as StoredTimedRow[];
    expect(gate.writesFulfilledOffline()).toBe(0);
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

// T-0304d AC-10 (D-0120 §9, D-0086, D-0091 §1, NFR-A11Y-6): UF-09.8 and UF-09.9 by keyboard
// only. The seed is the P1-R8 items with no warm-up, started 1500 s before the page's frozen
// clock (`page.clock.pauseAt`), so rule 8 sees exactly R8-E1 at the check: 105 s behind, and Trim
// cuts lateral-raise from 3 to 2 sets. Every step up to the check is a key press, so no timer has
// to run; the clock resumes once UF-09.8 shows.
const area = (a: string) => ({ code: "area_deficit", area: a, deficit: 1 });
const R8_SEED_PLAN = {
  ...PLAN,
  warmup: [],
  items: [
    { ...PLAN.items[0]!, reasons: [{ code: "main_lift" }, area("chest")] },
    { ...TWO_ITEMS_PLAN.items[1]!, reasons: [area("back")] },
    {
      exerciseId: "leg-curl",
      isMain: false,
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      durationS: null,
      costS: 375,
      backoff: null,
      prefill: { weightKg: 30, reps: 10, durationS: null, kind: "add_rep" },
      reasons: [area("hamstrings")],
    },
    {
      exerciseId: "lateral-raise",
      isMain: false,
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      durationS: null,
      costS: 375,
      backoff: null,
      prefill: { weightKg: 8, reps: 10, durationS: null, kind: "add_rep" },
      reasons: [area("shoulders")],
    },
  ],
  startDeficits: { ...PLAN.startDeficits, chest: 0.8, back: 0.6, hamstrings: 0.9, shoulders: 0.5 },
};

interface StoredSessionRow {
  started_at: string;
  ended_at: string | null;
  plan: { items: Array<{ exerciseId: string; sets: number }> };
}

async function sessionRowFor(page: Page, sessionId: string): Promise<StoredSessionRow> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: unknown }>((resolve, reject) => {
      const req = db.transaction("sessions", "readonly").objectStore("sessions").get(id);
      req.onsuccess = () => resolve(req.result as { row: unknown });
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entry.row as StoredSessionRow;
  }, sessionId);
}

/** Moves focus with `key` until `target` has it (keyboard only, no clicks). */
async function keyTo(
  page: Page,
  target: ReturnType<Page["locator"]>,
  key: "Tab" | "Shift+Tab" = "Tab",
): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

test.describe("T-0304d AC-10 time check, pause and end, by keyboard", () => {
  test("UF-09.1 → bench-press × 4 → UF-09.8 Trim → UF-09.6; Pause → UF-09.9 → End workout → UF-03.3", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    const checkAt = (await page.evaluate(() => Date.now())) + 2000;
    await page.clock.pauseAt(checkAt);
    const id = randomUUID();
    const startedAt = new Date(checkAt - 1_500_000).toISOString();
    await seedSessionRow(page, id, R8_SEED_PLAN, startedAt);
    await page.goto(`/session/${id}`);

    // UF-09.1 with no warm-up: no Skip warm-up, Start now focused.
    const ready = page.locator('[data-screen-id="UF-09.1"]');
    await expect(ready.getByRole("button", { name: "Start now" })).toBeFocused();
    await expect(ready.getByRole("button", { name: "Skip warm-up" })).toHaveCount(0);
    await page.keyboard.press("Enter");

    for (let set = 1; set <= 4; set += 1) {
      const current = page.locator('[data-screen-id="UF-09.3"]');
      await expect(current.getByText(`Set ${set} of 4`)).toBeVisible();
      await expect(current.getByRole("button", { name: "Done set" })).toBeFocused();
      await page.keyboard.press("Enter");
      const confirm = page.locator('[data-screen-id="UF-09.4"]');
      await expect(confirm.getByRole("button", { name: "Save" })).toBeFocused();
      await page.keyboard.press("Enter");
      const rest = page.locator('[data-screen-id="UF-09.5"]');
      await expect(rest.getByRole("button", { name: "Skip rest" })).toBeFocused();
      await page.keyboard.press("Enter");
    }

    // UF-09.8: R8-E1, built content, focus on Continue, axe clean.
    const check = page.locator('[data-screen-id="UF-09.8"]');
    await expect(check.getByRole("heading", { level: 1 })).toHaveText(/min behind/);
    // The check has been made at the frozen moment; from here the clock may flow (axe needs it).
    await page.clock.resume();
    await expect(check.getByText("lateral-raise 3 → 2 sets")).toBeVisible();
    const trim = check.getByRole("button", { name: "Trim" });
    await expect(trim).toBeVisible();
    await expect(check.getByRole("button", { name: "Continue" })).toBeFocused();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expectAxeClean(page);
    await keyTo(page, trim);
    await page.keyboard.press("Enter");

    // UF-09.6 barbell-row, on the trimmed plan, saved to IndexedDB.
    const next = page.locator('[data-screen-id="UF-09.6"]');
    await expect(next.getByRole("heading", { level: 1, name: "barbell-row" })).toBeVisible();
    const trimmed = await sessionRowFor(page, id);
    expect(trimmed.plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-curl", 3],
      ["lateral-raise", 2],
    ]);

    // Pause → UF-09.9: Resume focused, Skip to next exercise and End workout, axe clean.
    await keyTo(page, page.getByRole("button", { name: "Pause workout" }), "Shift+Tab");
    await page.keyboard.press("Enter");
    const paused = page.locator('[data-screen-id="UF-09.9"]');
    await expect(paused.getByRole("button", { name: "Resume" })).toBeFocused();
    await expect(paused.getByRole("button", { name: "Skip to next exercise" })).toBeVisible();
    const end = paused.getByRole("button", { name: "End workout" });
    await expect(end).toBeVisible();
    await expect(page.locator("a[href]")).toHaveCount(0);
    await expectAxeClean(page);

    // End workout → the confirm in place (Cancel focused) → End workout → UF-03.3.
    await keyTo(page, end);
    await page.keyboard.press("Enter");
    await expect(paused.getByText("End workout? Your sets are saved.")).toBeVisible();
    await expect(paused.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await keyTo(page, paused.getByRole("button", { name: "End workout" }), "Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
    const ended = await sessionRowFor(page, id);
    expect(ended.ended_at).not.toBeNull();
    expect(ended.started_at).toBe(startedAt);
  });
});

// T-0394 AC-6 (D-0123 §3, D-0086, D-0091 §1): Back means Pause. The real flow from `/`: Start
// workout → UF-08.1 → Suggest → Looks good → Start → UF-09. The describe's own mocks (registered
// after the file's `beforeEach`, so they win) give the planner a library and full equipment.
const SETUP_URL = /\/session\/[0-9a-f-]{36}$/;

async function startFromHome(page: Page): Promise<void> {
  const profileRow = { ...setupProfile, user_id: FAKE_USER_ID };
  await mockSupabaseData(page, {
    sets: [],
    exercises: setupExercises,
    exerciseAreas: setupExerciseAreas,
    areaTargets: [
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ].map((area_id) => ({
      area_id,
      sets_per_14d: 16,
      source: "default",
      updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    })),
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
  await page.goto("/");
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.locator('[data-screen-id="UF-08.1"]')).toBeVisible();
  await page.getByRole("button", { name: "30 minutes" }).click();
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(SETUP_URL);
  const screen = page.locator('[data-screen-id^="UF-09"]');
  await expect(screen).toBeVisible();
  // A user activation after the guard is armed, so Chromium keeps the entry (D-0123 §3 note).
  await page.waitForFunction(() => history.state?.wlFocusGuard === true);
  const before = await screen.getAttribute("data-screen-id");
  await page.mouse.click(5, 300);
  await expect(page.locator(`[data-screen-id="${before}"]`)).toBeVisible();
}

test.describe("T-0394 AC-6 Back means Pause", () => {
  test("Start → Back shows UF-09.9 on the same URL; one more Back leaves", async ({ page }) => {
    await startFromHome(page);
    const url = page.url();
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    expect(page.url()).toBe(url);
    await page.goBack();
    await expect(page).not.toHaveURL(SETUP_URL);
    await expect(page.locator('[data-screen-id="UF-08.4"]')).toHaveCount(0);
  });

  test("offline the same", async ({ page, context }) => {
    await startFromHome(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await page.mouse.click(5, 300);
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page).toHaveURL(SETUP_URL);
  });

  // T-0462 AC-1..3: the guard survives Resume (second and third Back still pause).
  async function backResumeCycle(page: Page, url: string): Promise<void> {
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    expect(page.url()).toBe(url);
    await page.getByRole("button", { name: /resume/i }).click();
    await expect(
      page.locator('[data-screen-id^="UF-09"]:not([data-screen-id="UF-09.9"])'),
    ).toBeVisible();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toHaveCount(0);
    // Resume is a user activation: it is where a Chromium-skippable guard would be re-pushed.
    await page.mouse.click(5, 300);
  }

  test("T-0462 AC-1/AC-2 Back → Resume → Back pauses again, three cycles; one more Back leaves", async ({
    page,
  }) => {
    await startFromHome(page);
    const url = page.url();
    await backResumeCycle(page, url);
    await backResumeCycle(page, url);
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    expect(page.url()).toBe(url);
    await page.goBack();
    await expect(page).not.toHaveURL(SETUP_URL);
  });

  test("T-0462 AC-3 second cycle offline", async ({ page, context }) => {
    await startFromHome(page);
    await precacheSettled(page);
    await context.setOffline(true);
    await page.mouse.click(5, 300);
    const url = page.url();
    await backResumeCycle(page, url);
    await page.goBack();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await expect(page).toHaveURL(SETUP_URL);
  });
});
