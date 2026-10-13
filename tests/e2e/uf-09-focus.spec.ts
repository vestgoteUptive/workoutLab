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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { tokens } from "@workoutlab/design-tokens";
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
  test("UF-09.3 Done (≥ 64 px) → UF-09.4 auto-save after 5 s → UF-09.5; one row in wl-offline.sets", async ({
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
    const done = page.getByRole("button", { name: "Done" });
    const box = await done.boundingBox();
    expect(box).not.toBeNull();
    // T-0595 (D-0208 §2): the 200 px round button became the full-width session button.
    expect(box!.height).toBeGreaterThanOrEqual(64);
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

// T-0304f AC-5 (D-0086, D-0091 §1, NFR-OFF-2): UF-09.1 → Skip warm-up → UF-09.3 → Done →
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
  test("UF-09.1 Skip warm-up → UF-09.3 → Done → UF-09.5 'Next · set 2 of 2' → +15 s → Skip rest → set 2", async ({
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
    await page.getByRole("button", { name: "Done" }).click();
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
    await page.getByRole("button", { name: "Done" }).click();
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

/** "#RRGGBB" as the "rgb(r, g, b)" a computed style reports. */
function rgbOfHex(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
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
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
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
      await expect(current.getByRole("button", { name: "Done" })).toBeFocused();
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
    // T-0598: the options are radios (Continue picked), Continue is the one primary and applies the pick.
    const keep = check.getByRole("radio", { name: "Continue" });
    const trim = check.getByRole("radio", { name: "Trim" });
    const skip = check.getByRole("radio", { name: "Skip next" });
    const apply = check.getByRole("button", { name: "Continue" });
    await expect(trim).toBeAttached();
    await expect(apply).toBeFocused();
    await expect(keep).toBeChecked();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expect(page.locator("[data-screen-id]")).toHaveAttribute("data-wl-state", "plan");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      tokens.color.plan.bg,
    );
    await expectAxeClean(page);
    // Every option row and the primary are at least 44 px tall.
    for (const radio of [keep, trim, skip]) {
      const box = await radio.locator("xpath=ancestor::label").boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath("uf09-8-time-check.png") });
    await compareWithCanvas(page, testInfo, { turn: "turn-4", frame: "Time check" });
    // Arrow keys move the selection (native radios): Shift+Tab to the group, then down and up.
    await keyTo(page, keep, "Shift+Tab");
    await page.keyboard.press("ArrowDown");
    await expect(trim).toBeChecked();
    await expect(trim).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(skip).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await expect(trim).toBeChecked();
    await expect(keep).not.toBeChecked();
    await keyTo(page, apply);
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
    // T-0598: the plan state, theme-color plan.bg, rows and Resume at least 44 px, End last.
    await expect(paused).toHaveAttribute("data-wl-state", "plan");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      tokens.color.plan.bg,
    );
    for (const control of await paused
      .locator("button.wl-row, .wl-uf09__resume, .wl-uf09__end")
      .all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(paused.locator("button, a[href], input").last()).toHaveText("End workout");
    // The 1.5px width is in main.css (t0598.css.test.ts); Chromium rounds it to 1px at 1x.
    await expect(end).toHaveCSS("border-top-color", rgbOfHex(tokens.color.plan.ink));
    await expect(end).not.toHaveClass(/wl-button--primary/);
    await expect(paused.getByRole("button", { name: "Resume" })).toHaveCSS(
      "background-color",
      rgbOfHex(tokens.color.lift.bg),
    );
    await expectAxeClean(page);
    await page.screenshot({ path: testInfo.outputPath("uf09-9-paused.png") });
    await compareWithCanvas(page, testInfo, { turn: "turn-4", frame: "Paused" });

    // End workout → the confirm in place (Cancel focused) → End workout → UF-03.3.
    await keyTo(page, end);
    await page.keyboard.press("Enter");
    await expect(paused.getByText("End workout? Your sets are saved.")).toBeVisible();
    await expect(paused.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expectAxeClean(page);
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

// T-0672 (UF-04.3 in the focus Pause seam): the steps list keeps its list semantics (the `ol` has
// list-style none, which drops them in Safari) and the sheet has no axe violations.
test.describe("T-0672 How-to sheet list semantics", () => {
  test("Pause → How to: the steps are a list with items, axe reports 0 violations", async ({
    page,
  }) => {
    await startFromHome(page);
    await page.getByRole("button", { name: "Pause workout" }).click();
    await expect(page.locator('[data-screen-id="UF-09.9"]')).toBeVisible();
    await page.getByRole("button", { name: "How to" }).click();
    const dialog = page.getByRole("dialog", { name: /^How to: / });
    await expect(dialog).toBeVisible();
    const steps = dialog.getByRole("list");
    await expect(steps).toBeVisible();
    expect(await steps.getByRole("listitem").count()).toBeGreaterThanOrEqual(1);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

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

// ---------------------------------------------------------------------------------------------
// T-0595 (D-0208, D-0210, D-0211, D-0213; UF-09.3, UF-09.4): the lift state on the set and its
// confirm. Colours are read from tokens.json, never typed. Online: the offline path is the
// T-0304b AC-12 test above (its Done height pin moved to 64 px) and the offline line below.
// ---------------------------------------------------------------------------------------------
const tokenColours = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { lift: Record<string, string> } };
const LIFT = tokenColours.color.lift;
const LEGACY_LIFT_RED = ["#D9", "472B"].join("");

function toRgb(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

const NO_BACKOFF_PLAN = { ...PLAN, warmup: [] };

/** Seeds `plan`, opens the session online and taps Start now: lands on UF-09.3. */
async function openSet(page: Page, plan: object = NO_BACKOFF_PLAN): Promise<string> {
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  const id = randomUUID();
  await seedSessionRow(page, id, plan);
  await page.goto(`/session/${id}`);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
  return id;
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
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") return;
      if (el.closest(".wl-uf09__announcer")) return;
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

/** Every colour the screen paints (text, background, border, outline), as rgb strings. */
async function paintedColours(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = new Set<string>();
    for (const el of document.querySelectorAll("[data-screen-id], [data-screen-id] *")) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.outlineColor, s.fill]) {
        if (c) found.add(c);
      }
    }
    return [...found];
  });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
}

async function expectContrast(page: Page): Promise<void> {
  const pairs = await textPairs(page);
  expect(pairs.length).toBeGreaterThan(3);
  for (const p of pairs) {
    const need = p.largeText ? 3 : 4.5;
    expect(p.ratio, `${p.text}: ${p.color} on ${p.background}`).toBeGreaterThanOrEqual(need);
  }
  // White on lift.bg is 4.8 at one decimal (D-0211 §4), as rendered.
  const onBg = pairs.filter(
    (p) => p.background === toRgb(LIFT.bg!) && p.color === toRgb(LIFT.ink!),
  );
  expect(onBg.length).toBeGreaterThan(0);
  for (const p of onBg)
    expect(Number(p.ratio.toFixed(1)), `${p.text} ${p.ratio}`).toBeGreaterThanOrEqual(4.8);
  // The Done / Save text: lift.on-action on white, 6.1.
  const onAction = pairs.filter(
    (p) => p.color === toRgb(LIFT["on-action"]!) && p.background === toRgb(LIFT.action!),
  );
  expect(onAction.length).toBeGreaterThan(0);
  for (const p of onAction)
    expect(Number(p.ratio.toFixed(1)), `${p.text} ${p.ratio}`).toBeGreaterThanOrEqual(6.1);
  expect(await paintedColours(page)).not.toContain(toRgb(LEGACY_LIFT_RED));
  const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(axe.violations).toEqual([]);
}

/** T-0595 AC1/AC2/AC4/AC5: the state, the one primary, the caption and the progress chrome. */
async function expectLiftChrome(page: Page, screenId: string, caption: string): Promise<void> {
  const root = page.locator(`[data-screen-id="${screenId}"]`);
  await expect(root).toHaveAttribute("data-wl-state", "lift");
  await expect(root).toHaveCSS("background-color", toRgb(LIFT.bg!));
  await expect(page.locator("meta[name=theme-color]")).toHaveAttribute(
    "content",
    new RegExp(`^${LIFT.bg}$`, "i"),
  );
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(root.locator(".wl-button--session")).toHaveCount(1);
  await expect(root.getByText(caption, { exact: true })).toBeVisible();
  const pause = await page.getByRole("button", { name: "Pause workout" }).boundingBox();
  expect(pause!.width).toBe(44);
  expect(pause!.height).toBe(44);
}

test.describe("T-0595 UF-09.3 and UF-09.4 in the lift state (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("UF-09.3: state, one primary, Done, caption, progress, contrast; canvas frame", async ({
    page,
  }, testInfo) => {
    await openSet(page);
    await expectLiftChrome(page, "UF-09.3", "Lifting · set 1 of 4");

    // AC3: Done keeps its name; the full content width, 64 px or more, lift.action / on-action.
    const done = page.getByRole("button", { name: "Done" });
    const box = (await done.boundingBox())!;
    const rootPad = await page.locator("[data-screen-id]").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        gutter: parseFloat(s.paddingLeft) + parseFloat(s.paddingRight),
      };
    });
    expect(box.width).toBeGreaterThanOrEqual(rootPad.width - rootPad.gutter - 1);
    expect(box.height).toBeGreaterThanOrEqual(64);
    await expect(done).toHaveCSS("background-color", toRgb(LIFT.action!));
    await expect(done).toHaveCSS("color", toRgb(LIFT["on-action"]!));

    // AC5: the counter and the filled segments (none: the warm-up is skipped, item 1 is current).
    await expect(page.locator(".wl-session-progress__counter")).toHaveText("1 / 1");
    await expect(page.locator(".wl-session-progress__segment")).toHaveCount(2);
    await expect(page.locator(".wl-session-progress__segment--done")).toHaveCount(1);

    // Type roles: the name 2.75 rem / 800, the load and the reps 9.375 rem / 800.
    const sizes = await page.evaluate(() => {
      const px = (el: Element) => getComputedStyle(el).fontSize;
      const wt = (el: Element) => getComputedStyle(el).fontWeight;
      const h1 = document.querySelector("h1")!;
      const hero = document.querySelectorAll(".wl-uf09__load .wl-type-hero-number");
      return { h1: [px(h1), wt(h1)], hero: Array.from(hero).map((e) => [px(e), wt(e)]) };
    });
    expect(sizes.h1).toEqual(["44px", "800"]);
    expect(sizes.hero).toEqual([
      ["150px", "800"],
      ["150px", "800"],
    ]);
    await noHorizontalScroll(page);
    await expectContrast(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-3",
      frame: "In session · set",
      name: "uf-09-3",
    });
  });

  test("UF-09.4: state, one primary, steppers, RIR, error form, contrast; canvas frame", async ({
    page,
  }, testInfo) => {
    await openSet(page);
    await page.getByRole("button", { name: "Done" }).click();
    await expectLiftChrome(page, "UF-09.4", "Lifting · set 1 of 4");
    const root = page.locator('[data-screen-id="UF-09.4"]');

    // AC8: every control is at least 44 x 44. The radios are hidden; their label is the target.
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(
        "[data-screen-id] :is(button, a, input:not([type=radio]), label)",
      )) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.width < 44 || r.height < 44)) {
          bad.push(
            `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent} ${r.width}x${r.height}`,
          );
        }
      }
      return bad;
    });
    expect(small).toEqual([]);

    // RIR is a segmented control on its native radios; the selected one is the on-selected pair.
    await page.getByText("1–2", { exact: true }).click();
    const selected = page.locator(".wl-segmented > label:has(input:checked)");
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveCSS("background-color", toRgb(LIFT.ink!));
    await expect(selected).toHaveCSS("color", toRgb(LIFT["on-action"]!));
    await expect(page.getByRole("radio", { name: "1–2" })).toBeChecked();

    // AC7: a valid weight has the 1 px boundary; an invalid one the 2 px lift.ink border, the
    // aria-hidden icon and the existing words.
    const weight = page.getByRole("textbox", { name: "Weight (kg)" });
    await expect(weight).not.toHaveAttribute("aria-invalid", "true");
    await expect(weight).toHaveCSS("border-top-width", "1px");
    await weight.fill("abc");
    await expect(weight).toHaveAttribute("aria-invalid", "true");
    await expect(weight).toHaveCSS("border-top-width", "2px");
    await expect(weight).toHaveCSS("border-top-color", toRgb(LIFT.ink!));
    const hint = root.locator(".wl-input__error");
    await expect(hint).toHaveText("Enter a weight like 82.5");
    await expect(hint.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(hint.locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // The disabled form stays legible: the outline form, ink on the lift background.
    await expect(page.getByRole("button", { name: "Save" })).toHaveCSS("color", toRgb(LIFT.ink!));
    await expectContrast(page);

    await weight.fill("82.5");
    await expect(weight).not.toHaveAttribute("aria-invalid", "true");
    await expect(weight).toHaveCSS("border-top-width", "1px");
    await noHorizontalScroll(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "In session · log set",
      name: "uf-09-4",
    });
  });

  test("a back-off set shows its caption on UF-09.3", async ({ page }) => {
    const plan = {
      ...NO_BACKOFF_PLAN,
      items: [{ ...PLAN.items[0]!, sets: 1, backoff: { weightKg: 70, reps: 6 } }],
    };
    await openSet(page, plan);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Skip rest" }).click();
    await expectLiftChrome(page, "UF-09.3", "Lifting · back-off set");
  });

  test("the offline line renders on the lift screen and reads", async ({ page, context }) => {
    await openSet(page);
    await context.setOffline(true);
    const icon = page.getByRole("img", { name: "Offline" });
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS("background-color", toRgb(LIFT.ink!));
    await context.setOffline(false);
  });

  test("AC9: the lift root cross-fades its background over 200 ms, instantly under reduced motion", async ({
    page,
  }) => {
    await openSet(page);
    const root = page.locator('[data-screen-id="UF-09.3"]');
    await expect(root).toHaveCSS("transition-duration", "0.2s");
    await expect(root).toHaveCSS("transition-property", "background-color");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root).toHaveCSS("transition-duration", "0s");
    // Nothing else on the screen animates.
    const animated = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-screen-id] *"))
        .filter((el) => {
          const s = getComputedStyle(el);
          return s.transitionDuration !== "0s" || s.animationName !== "none";
        })
        .map((el) => el.tagName + "." + el.className),
    );
    expect(animated).toEqual([]);
  });
});

test.describe("T-0595 AC5 the progress chrome at 320 x 640", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("the counter does not wrap and nothing scrolls sideways on UF-09.3 and UF-09.4", async ({
    page,
  }) => {
    await openSet(page);
    for (const id of ["UF-09.3", "UF-09.4"]) {
      if (id === "UF-09.4") await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator(`[data-screen-id="${id}"]`)).toBeVisible();
      const counter = page.locator(".wl-session-progress__counter");
      const one = await counter.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.height <= parseFloat(getComputedStyle(el).lineHeight || "0") + 1 || r.height < 24;
      });
      expect(one).toBe(true);
      await noHorizontalScroll(page);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// T-0596 (D-0208, D-0211 §5; UF-09.2 Warm-up, UF-09.7 Timed set): the lift state with the deep
// fill (lift.bg-deep over lift.bg) instead of the ring. Colours come from tokens.json.
// ---------------------------------------------------------------------------------------------
const FILL_PLAN = {
  ...TIMED_PLAN,
  items: [{ ...TIMED_PLAN.items[0]!, prefill: { ...TIMED_PLAN.items[0]!.prefill, durationS: 60 } }],
};

/** Opens the seeded session online and taps Start now: lands on UF-09.2. */
async function openWarmup(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  const sid = randomUUID();
  await seedSessionRow(page, sid, FILL_PLAN);
  await page.goto(`/session/${sid}`);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.locator('[data-screen-id="UF-09.2"]')).toBeVisible();
}

async function openTimed(page: Page): Promise<void> {
  await openWarmup(page);
  await page.getByRole("button", { name: "Next move" }).click();
  await page.getByRole("button", { name: "I'm ready" }).click();
  await expect(page.locator('[data-screen-id="UF-09.7"]')).toBeVisible();
}

/** The top and bottom pixel (middle column) of a screenshot. */
async function edgePixels(page: Page): Promise<[string, string]> {
  const png = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const px = (y: number) => {
      const d = g.getImageData(Math.floor(img.width / 2), y, 1, 1).data;
      return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    };
    return [px(0), px(img.height - 1)] as [string, string];
  }, png.toString("base64"));
}

/** Pins the fill at `percent` (no transition, so the pixel is final at once). */
async function pinFill(page: Page, screenId: string, percent: number): Promise<void> {
  await page.locator(`[data-screen-id="${screenId}"]`).evaluate((el, p) => {
    (el as HTMLElement).style.transition = "none";
    (el as HTMLElement).style.setProperty("--wl-drain", `${p}%`);
  }, percent);
}

function luminance(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

/** AC1, AC2, AC4, AC5, AC6 for one of the two deep-fill screens. */
async function expectDeepFill(page: Page, id: string, caption: RegExp): Promise<void> {
  const root = page.locator(`[data-screen-id="${id}"]`);
  await expect(root).toHaveAttribute("data-wl-state", "lift");
  await expect(root).toHaveClass(/wl-drain wl-drain--deep/);
  await expect(root.locator(".wl-uf09__ring")).toHaveCount(0);
  await expect(root.getByText(caption)).toBeVisible();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  // AC1: the top pixel is lift.bg-deep at 0 % and lift.bg at 100 %; the bottom is lift.bg.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pinFill(page, id, 0);
  expect((await edgePixels(page))[0]).toBe(toRgb(LIFT["bg-deep"]!));
  await pinFill(page, id, 100);
  expect(await edgePixels(page)).toEqual([toRgb(LIFT.bg!), toRgb(LIFT.bg!)]);
  // AC4: white text on both fills, at 0 %, 50 % and 100 %; axe finds nothing.
  const need = (bg: string) => (luminance(LIFT.ink!) + 0.05) / (luminance(bg) + 0.05);
  expect(Number(need(LIFT["bg-deep"]!).toFixed(1))).toBeGreaterThanOrEqual(6.1);
  expect(Number(need(LIFT.bg!).toFixed(1))).toBeGreaterThanOrEqual(4.8);
  for (const p of [0, 50, 100]) {
    await pinFill(page, id, p);
    const colours = await root.evaluate((el) =>
      Array.from(el.querySelectorAll("*"))
        .filter((e) =>
          Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()),
        )
        .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest(".wl-uf09__announcer"))
        .map((e) => getComputedStyle(e).color),
    );
    expect(colours.length).toBeGreaterThan(3);
    for (const c of colours) expect(c).toBe(toRgb(LIFT.ink!));
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations, `axe at ${p}%`).toEqual([]);
  }
  expect(await paintedColours(page)).not.toContain(toRgb(LEGACY_LIFT_RED));
  await noHorizontalScroll(page);
}

test.describe("T-0596 UF-09.2 and UF-09.7 with the deep fill (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("UF-09.2: state, fill, hero time, session outline controls; canvas frame", async ({
    page,
  }, testInfo) => {
    await openWarmup(page);
    // AC5: the step is 1 s linear on the root, 0 s under reduced motion (both values).
    const root = page.locator('[data-screen-id="UF-09.2"]');
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(root).toHaveCSS("transition-duration", "1s");
    await expect(root).toHaveCSS("transition-property", "--wl-drain");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root).toHaveCSS("transition-duration", "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // AC6: the time is the hero number; the controls are the 64 px session outline.
    const size = await page
      .getByRole("timer")
      .evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight]);
    expect(size).toEqual(["150px", "800"]);
    for (const name of ["Restart", "Next move"]) {
      const b = page.getByRole("button", { name });
      await expect(b).toHaveClass(/wl-button--session-outline/);
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(64);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole("button", { name: "Next move" })).toBeFocused();
    await compareWithCanvas(page, testInfo, { turn: "turn-4", frame: "Warm-up", name: "uf-09-2" });
    await expectDeepFill(page, "UF-09.2", /^Warm-up · move 1 of 1$/);
  });

  test("UF-09.7: the position countdown is the countdown role, the hold the hero number", async ({
    page,
  }, testInfo) => {
    await openTimed(page);
    await expect(page.getByText("Get in position")).toBeVisible();
    const timer = page.getByRole("timer");
    await expect(timer).toHaveClass(/wl-type-countdown/);
    expect(await timer.evaluate((el) => getComputedStyle(el).fontSize)).toBe("300px");
    const pause = page.getByRole("button", { name: "Pause timer" });
    await expect(pause).toHaveClass(/wl-button--session-outline/);
    expect((await pause.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-4",
      frame: "Timed set",
      name: "uf-09-7",
    });
    await expect(page.getByText("Hold", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(timer).toHaveClass(/wl-type-hero-number/);
    const root = page.locator('[data-screen-id="UF-09.7"]');
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(root).toHaveCSS("transition-duration", "1s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root).toHaveCSS("transition-duration", "0s");
    await expectDeepFill(page, "UF-09.7", /^Timed set · 1 of 1$/);
  });
});

// ---------------------------------------------------------------------------------------------
// T-0597 (D-0208, D-0211 §5; UF-09.1, UF-09.5, UF-09.6): the rest state with the lift-over-rest
// fill. Colours are read from tokens.json. The fill is pinned (no transition) to read the pixels
// at 0, 50 and 100 %.
// ---------------------------------------------------------------------------------------------
const restTokens = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { rest: Record<string, string> } };
const REST = restTokens.color.rest;

const SECOND_ITEM = {
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
};
const TWO_ITEMS_WARMUP_PLAN = {
  ...PLAN,
  items: [{ ...PLAN.items[0]!, sets: 1 }, SECOND_ITEM],
};

/** Seeds `plan` and opens its session on UF-09.1 (no tap). */
async function openReady(page: Page, plan: object): Promise<string> {
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  const id = randomUUID();
  await seedSessionRow(page, id, plan);
  await page.goto(`/session/${id}`);
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
  return id;
}

/** UF-09.1 → Skip warm-up → UF-09.3 → Done → Save → UF-09.5. */
async function openRest(page: Page, plan: object = TWO_ITEMS_WARMUP_PLAN): Promise<string> {
  const id = await openReady(page, plan);
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible();
  return id;
}

/** UF-09.5 → Skip rest → UF-09.6 (the plan's second item). */
async function openNext(page: Page): Promise<void> {
  await openRest(page);
  await page.getByRole("button", { name: "Skip rest" }).click();
  await expect(page.locator('[data-screen-id="UF-09.6"]')).toBeVisible();
}

/** Pins the fill with a stylesheet `!important`, which the host's once-a-second inline style
 *  cannot overwrite (an inline `--wl-drain` would be reset by the next render). */
async function pinRestFill(page: Page, percent: number): Promise<void> {
  await page.evaluate((p) => {
    let el = document.getElementById("wl-pin-fill");
    if (!el) {
      el = document.createElement("style");
      el.id = "wl-pin-fill";
      document.head.appendChild(el);
    }
    el.textContent = `[data-screen-id] { --wl-drain: ${p}% !important; transition: none !important; }`;
  }, percent);
}

/** UF-09.1's 5 s countdown is long enough to leave the screen mid-check: stretch it to an hour. */
async function slowGetReady(page: Page, id: string): Promise<void> {
  await page.evaluate((key) => {
    const state = JSON.parse(window.localStorage.getItem(key)!) as {
      timer: { durationS: number };
    };
    state.timer.durationS = 3600;
    window.localStorage.setItem(key, JSON.stringify(state));
  }, `wl-focus:${id}`);
  await page.reload();
  await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
}

/** AC1, AC2, AC3, AC5, AC6 for one of the three rest-state screens. */
async function expectRestFill(
  page: Page,
  id: string,
  caption: string,
  checkScroll = true,
): Promise<void> {
  const root = page.locator(`[data-screen-id="${id}"]`);
  await expect(root).toHaveAttribute("data-wl-state", "rest");
  await expect(root).toHaveClass(/wl-drain/);
  await expect(root).not.toHaveClass(/wl-drain--deep/);
  await expect(root.locator(".wl-uf09__ring, [data-warn]")).toHaveCount(0);
  await expect(root.getByText(caption, { exact: true })).toBeVisible();
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  await expect(page.locator("meta[name=theme-color]")).toHaveAttribute(
    "content",
    new RegExp(`^${REST.bg}$`, "i"),
  );
  // AC6: the step is 1 s linear, instant under reduced motion; both are read as computed.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(root).toHaveCSS("transition-duration", "1s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).toHaveCSS("transition-duration", "0s");
  // AC1: the top pixel is rest.bg at 0 % and lift.bg at 100 %; the bottom is lift.bg at 100 %.
  await pinRestFill(page, 0);
  expect(await edgePixels(page)).toEqual([toRgb(REST.bg!), toRgb(REST.bg!)]);
  await pinRestFill(page, 100);
  expect(await edgePixels(page)).toEqual([toRgb(LIFT.bg!), toRgb(LIFT.bg!)]);
  // AC5: white on both ends of the fill, lift.on-action on the white buttons, axe clean at 0,
  // 50 and 100 %.
  const white = (bg: string) => (luminance(REST.ink!) + 0.05) / (luminance(bg) + 0.05);
  expect(Number(white(REST.bg!).toFixed(1))).toBeGreaterThanOrEqual(4.9);
  expect(Number(white(LIFT.bg!).toFixed(1))).toBeGreaterThanOrEqual(4.8);
  for (const p of [0, 50, 100]) {
    await pinRestFill(page, p);
    const colours = await root.evaluate((el) =>
      Array.from(el.querySelectorAll("*"))
        .filter((e) =>
          Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()),
        )
        .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest(".wl-uf09__announcer"))
        .map((e) => ({
          onButton: e.closest(".wl-button--session") !== null,
          color: getComputedStyle(e).color,
        })),
    );
    expect(colours.length).toBeGreaterThan(3);
    for (const c of colours) {
      expect(c.color).toBe(toRgb(c.onButton ? LIFT["on-action"]! : REST.ink!));
    }
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(axe.violations, `axe at ${p}%`).toEqual([]);
  }
  expect(await paintedColours(page)).not.toContain(toRgb(LEGACY_LIFT_RED));
  // AC7: every control is at least 44 x 44.
  const small = await root.evaluate((el) =>
    Array.from(el.querySelectorAll("button, a"))
      .map((b) => ({ n: b.textContent, r: b.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && (b.r.width < 44 || b.r.height < 44))
      .map((b) => b.n),
  );
  expect(small).toEqual([]);
  if (checkScroll) await noHorizontalScroll(page);
}

test.describe("T-0597 UF-09.1, UF-09.5 and UF-09.6 with the rest fill (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("UF-09.1: countdown role, buttons, caption; canvas frame", async ({ page }, testInfo) => {
    // The real 5 s countdown: everything here runs in its first second, the canvas shot first.
    await openReady(page, TWO_ITEMS_WARMUP_PLAN);
    const root = page.locator('[data-screen-id="UF-09.1"]');
    await expect(page.getByRole("timer")).toHaveClass(/wl-type-countdown/);
    await expect(page.getByRole("button", { name: "Start now" })).toHaveClass(/wl-button--session/);
    await expect(page.getByRole("button", { name: "Skip warm-up" })).toHaveClass(
      /wl-button--session-outline/,
    );
    await expect(page.getByRole("button", { name: "Start now" })).toBeFocused();
    await expect(root.getByRole("heading", { level: 1, name: "Get ready" })).toBeVisible();
    await noHorizontalScroll(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-4",
      frame: "Get ready",
      name: "uf-09-1",
    });
  });

  test("UF-09.1: state and fill, contrast, motion (the countdown stretched to an hour)", async ({
    page,
  }) => {
    const id = await openReady(page, TWO_ITEMS_WARMUP_PLAN);
    await slowGetReady(page, id);
    await expectRestFill(page, "UF-09.1", "Get ready", false);
  });

  test("UF-09.5: state, hero clock, Skip rest on the fill, -15 s / +15 s outline; canvas frame", async ({
    page,
  }, testInfo) => {
    await openRest(page);
    await expect(page.getByRole("timer")).toHaveClass(/wl-type-hero-number/);
    const skip = page.getByRole("button", { name: "Skip rest" });
    await expect(skip).toHaveClass(/wl-button--session/);
    await expect(skip).toHaveCSS("color", toRgb(LIFT["on-action"]!));
    await expect(skip).toHaveCSS("background-color", toRgb(LIFT.action!));
    for (const name of ["−15 s", "+15 s"]) {
      await expect(page.getByRole("button", { name })).toHaveClass(/wl-button--session-outline/);
    }
    await expect(skip).toBeFocused();
    await compareWithCanvas(page, testInfo, {
      turn: "turn-3",
      frame: "In session · rest",
      name: "uf-09-5",
    });
    await expectRestFill(page, "UF-09.5", "Rest");
  });

  test("UF-09.6: state, section-role name, I'm ready primary; canvas frame", async ({
    page,
  }, testInfo) => {
    await openNext(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveClass(/wl-type-section/);
    await expect(page.getByRole("timer")).toHaveClass(/wl-type-hero-number/);
    await expect(page.getByRole("button", { name: "I'm ready" })).toHaveClass(/wl-button--session/);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-4",
      frame: "Next exercise",
      name: "uf-09-6",
    });
    await expectRestFill(page, "UF-09.6", "Next exercise");
  });

  test("AC3: after Skip rest UF-09.3 is lift with theme-color lift.bg; the cross-fade is 200 ms, 0 s under reduced motion", async ({
    page,
  }) => {
    await openRest(page, TWO_SETS_PLAN);
    await page.getByRole("button", { name: "Skip rest" }).click();
    const root = page.locator('[data-screen-id="UF-09.3"]');
    await expect(root).toHaveAttribute("data-wl-state", "lift");
    await expect(page.locator("meta[name=theme-color]")).toHaveAttribute(
      "content",
      new RegExp(`^${LIFT.bg}$`, "i"),
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(root).toHaveCSS("transition-duration", "0.2s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root).toHaveCSS("transition-duration", "0s");
  });

  test("AC8: a reload mid-rest resumes the fill at the persisted elapsed time (about 50 %)", async ({
    page,
  }) => {
    const id = await openRest(page);
    // The rest started now, 120 s long; move its start back by 60 s and reload.
    await page.evaluate((key) => {
      const state = JSON.parse(window.localStorage.getItem(key)!) as {
        timer: { startedAtMs: number };
      };
      state.timer.startedAtMs -= 60_000;
      window.localStorage.setItem(key, JSON.stringify(state));
    }, `wl-focus:${id}`);
    await page.reload();
    const root = page.locator('[data-screen-id="UF-09.5"]');
    await expect(root).toBeVisible({ timeout: 10_000 });
    const percent = await root.evaluate((el) =>
      parseFloat((el as HTMLElement).style.getPropertyValue("--wl-drain")),
    );
    expect(percent).toBeGreaterThanOrEqual(50);
    expect(percent).toBeLessThan(60);
    await expect(page.getByRole("timer")).toHaveText(/^(1:00|0:5\d)$/);
  });
});
