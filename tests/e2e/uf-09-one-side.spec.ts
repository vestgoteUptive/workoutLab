// T-0977 UF-09.3, UF-09.4, UF-03.1, UF-03.3, UF-06.2, UF-04.2, UF-10.2, UF-01 e2e: "one side at a
// time" exercises (docs/specs/unilateral-exercises.md, D-0260 to D-0263, D-0267). A dumbbell row
// (per arm, 12 kg, reps 10, 10, 9) and a side plank (per side, a 40 s hold) go through focus mode,
// the summary, history, Balance and the how-to, online and offline, in a real browser.
//
// The shared library fixture predates the flag, so this spec seeds its own two flagged rows on top
// of it (`withFlagged`): `dumbbell-row` (arm) and `side-plank` (side). `barbell-row` stays the
// unflagged control. Sessions are seeded straight into the app's IndexedDB with a fixed plan (the
// uf-09-focus.spec.ts pattern) so the first set is known; the engine-cost and 10-days-off rows
// instead build the plan through UF-08 so the engine really prices it.
//
// Supabase is mocked through `page.route`; the guarded fixture fails an unclaimed request.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline, type OfflineGate } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseEmptyReads,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercisesLoaded, profile } from "./fixtures/uf-04-library-data.js";
import { settledBox } from "./helpers/settled-box.js";

type Row = Record<string, unknown>;

const NBSP = /\u00a0/g;
const text = (s: string | null | undefined): string => (s ?? "").replace(NBSP, " ").trim();

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
];
const AREA_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 16,
  source: "default",
  updated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
}));
const START_DEFICITS = Object.fromEntries(AREAS.map((a) => [a, 1]));
const profileRow = { ...profile, user_id: FAKE_USER_ID };

// ---- The library: the shared fixture plus the two flagged rows ----

function row(id: string, name: string, extra: Row): Row {
  return {
    id,
    name,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: ["Set up", "Do the move", "Lower slowly"],
    mistakes: [],
    cue: null,
    source: "workoutlab",
    license: "LicenseRef-workoutLab",
    attribution: null,
    source_url: null,
    kind: "exercise",
    timed: false,
    increment_kg: null,
    default_duration_s: null,
    external_load: false,
    unilateral: null,
    ...extra,
  };
}

/** `dumbbell-row` is `arm` when `flag` is true, and the same row with no flag when it is false. */
function withFlagged(flag = true): Row[] {
  return [
    // The shared fixture already has a `db-row` named "Dumbbell row" (no flag); drop it so search
    // finds only the flagged `dumbbell-row` below.
    ...exercisesLoaded.filter((e) => e.id !== "db-row"),
    row("dumbbell-row", "Dumbbell row", {
      equipment: ["dumbbell", "bench"],
      instructions: ["Brace a hand on the bench", "Row to your hip", "Switch arms and repeat"],
      external_load: true,
      unilateral: flag ? "arm" : null,
    }),
    row("side-plank", "Side plank", {
      type: "isolation",
      timed: true,
      default_duration_s: 40,
      instructions: ["Stack your feet", "Lift your hips", "Hold, then switch sides"],
      unilateral: "side",
    }),
  ];
}
const AREAS_OF: Row[] = [
  { exercise_id: "dumbbell-row", area_id: "back", weight: 1 },
  { exercise_id: "dumbbell-row", area_id: "arms", weight: 0.5 },
  { exercise_id: "side-plank", area_id: "core", weight: 1 },
];
const exerciseAreasAll: Row[] = [...exerciseAreas, ...AREAS_OF];

// ---- Server history (relative to now, so nothing drifts out of a window) ----

let seq = 0;
function histSet(
  exerciseId: string,
  daysAgo: number,
  reps: number | null,
  kg: number | null,
  s = 0,
) {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  const at = new Date(day.getTime() + s * 60_000).toISOString();
  return {
    client_id: `t0977-${seq++}`,
    session_id: `T0977-S-${daysAgo}`,
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps,
    weight_kg: kg,
    duration_s: reps === null ? 40 : null,
  };
}
/** Three dumbbell-row sets: 12 kg for 10, 10 and 9 reps. */
const rowSets = (daysAgo: number, kg = 12) => [
  histSet("dumbbell-row", daysAgo, 10, kg, 0),
  histSet("dumbbell-row", daysAgo, 10, kg, 2),
  histSet("dumbbell-row", daysAgo, 9, kg, 4),
];

// ---- Plans ----

function plan(exerciseId: string, over: Row = {}, prefill: Row = {}): object {
  return {
    version: 1,
    mainLiftId: null,
    warmup: [],
    items: [
      {
        exerciseId,
        isMain: false,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        durationS: null,
        costS: 420,
        backoff: null,
        prefill: { weightKg: 12, reps: 10, durationS: null, kind: "add_rep", ...prefill },
        reasons: [],
        ...over,
      },
    ],
    startDeficits: START_DEFICITS,
  };
}
const SIDE_PLANK_PLAN = plan(
  "side-plank",
  { sets: 1, repsMin: null, repsMax: null, durationS: 40 },
  { weightKg: null, reps: null, durationS: 40 },
);

// ---- Page helpers ----

const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);

interface SeedOptions {
  sets?: unknown[];
  library?: Row[];
}

async function mockAll(page: Page, opts: SeedOptions = {}): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: opts.sets ?? [],
    exercises: opts.library ?? withFlagged(),
    exerciseAreas: exerciseAreasAll,
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
}

/** Counts the user's rows in one IndexedDB store of the app's offline database. */
async function cachedCount(page: Page, store: string): Promise<number> {
  return page.evaluate(
    async ({ userId, store }) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const n = await new Promise<number>((resolve, reject) => {
        const c = db
          .transaction(store, "readonly")
          .objectStore(store)
          .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        c.onsuccess = () => resolve(c.result);
        c.onerror = () => reject(c.error);
      });
      db.close();
      return n;
    },
    { userId: FAKE_USER_ID, store },
  );
}

/** Signs in on `/` and waits until the library and the exercise details (where the flag lives) are
 *  cached, so a later offline run reads the flag from the cache. */
async function signInAndCache(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(screen(page, "UF-02.1")).toBeVisible();
  await expect.poll(() => cachedCount(page, "libraryCache")).toBeGreaterThan(0);
  await expect.poll(() => cachedCount(page, "exerciseDetails")).toBeGreaterThan(0);
}

/** Puts one `sessions` row (the app's `QueuedSession` shape, not pending) into the offline DB. */
async function seedSessionRow(page: Page, id: string, planBody: object): Promise<void> {
  await page.evaluate(
    async ({ id, userId, planBody }) => {
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
            plan: planBody,
          },
          finished: false,
          pending: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id, userId: FAKE_USER_ID, planBody },
  );
}

/** Seeds `planBody`, opens it, and waits for UF-09.3 (UF-09.1 hands over after about 5 s). */
async function openSeeded(page: Page, planBody: object, screenId = "UF-09.3"): Promise<string> {
  const id = randomUUID();
  await seedSessionRow(page, id, planBody);
  await page.goto(`/session/${id}`);
  await expect(screen(page, screenId)).toBeVisible({ timeout: 15_000 });
  return id;
}

/** The hero line of UF-09.3 as the user reads it, in two parts. */
async function heroLines(page: Page): Promise<string[]> {
  return page
    .locator('[data-screen-id="UF-09.3"] .wl-uf09__load .wl-uf09__hero')
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\u00a0/g, " ").trim()));
}

/** Logs `reps.length` sets from UF-09.3: Done, adjust reps on UF-09.4, Save, then skip the rest. */
async function logSets(page: Page, reps: number[], planned = 10): Promise<void> {
  for (let i = 0; i < reps.length; i++) {
    await expect(screen(page, "UF-09.3")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    const confirm = screen(page, "UF-09.4");
    await expect(confirm).toBeVisible();
    for (let n = planned; n > reps[i]!; n--) {
      await confirm.getByRole("button", { name: "Fewer reps" }).click();
    }
    await expect(confirm.locator('[data-field="reps"]')).toHaveText(String(reps[i]));
    await confirm.getByRole("button", { name: /^Save/ }).click();
    if (i < reps.length - 1) {
      await expect(screen(page, "UF-09.5")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Skip rest" }).click();
    }
  }
}

interface SetWrite {
  client_id: string;
  session_id: string;
  exercise_id: string;
  reps: number | null;
  weight_kg: number | null;
  duration_s: number | null;
  [key: string]: unknown;
}

/** Records every `session_sets` write (reads answer `[]`); a write is only "sent" while
 *  `gate.online` is true, otherwise it fails like a dropped connection (the uf-09-offline.spec.ts
 *  pattern). Registered after `mockAll` so it wins. */
async function recordSetWrites(page: Page, gate: { online: boolean }): Promise<() => SetWrite[]> {
  const writes: SetWrite[] = [];
  const answer = async (route: import("@playwright/test").Route, flat: boolean) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    if (!gate.online) return route.abort("internetdisconnected");
    if (flat) {
      const body = request.postDataJSON() as SetWrite | SetWrite[];
      writes.push(...(Array.isArray(body) ? body : [body]));
    }
    return route.fulfill({ status: 201, json: [] });
  };
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, (route) => answer(route, false));
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) => answer(route, true));
  return () => writes.slice();
}

async function waitForPrecache(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const precache = keys.find((k) => k.startsWith("workbox-precache"));
        if (!precache) return false;
        const requests = await (await caches.open(precache)).keys();
        return requests.some((r) => new URL(r.url).pathname === "/index.html");
      }),
    )
    .toBe(true);
}

const serious = (v: { impact?: string | null }) =>
  v.impact === "serious" || v.impact === "critical";

async function expectAxeClean(page: Page, include: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  expect(
    results.violations.filter(serious).map((v) => `${v.id}: ${v.nodes.map((n) => n.target)}`),
  ).toEqual([]);
}

async function expectTargets44(page: Page, scope: string): Promise<void> {
  const controls = page.locator(`${scope} button, ${scope} a, ${scope} input`);
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await settledBox(control);
    const name = (await control.getAttribute("aria-label")) ?? (await control.textContent());
    expect(box, `${scope} ${name}`).not.toBeNull();
    expect(box!.width, `${scope} ${name} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${scope} ${name} height`).toBeGreaterThanOrEqual(44);
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

// ---------------------------------------------------------------------------------------------
// AC1, AC4: UF-09.3 and UF-09.4 read per arm, online, and the set uploads at once, plain.
// ---------------------------------------------------------------------------------------------

test.describe("AC1 dumbbell-row in focus mode (UF-09.3, UF-09.4)", () => {
  test("every set reads '12 kg' over '× 10 per arm'; the stepper says 'Reps per arm'; the uploads are plain 10, 10, 9 at 12 kg", async ({
    page,
  }) => {
    await mockAll(page);
    const gate = { online: true };
    const writes = await recordSetWrites(page, gate);
    await signInAndCache(page);
    await openSeeded(page, plan("dumbbell-row"));
    await expect(screen(page, "UF-09.3")).toHaveCount(1);

    // UF-09.3: two hero lines in one <p>, the word in the second; one reading for a screen reader.
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10 per arm"]);
    const load = screen(page, "UF-09.3").locator("p.wl-uf09__load");
    await expect(load).toHaveCount(1);
    await expect(load.locator(".wl-uf09__sr")).toHaveText(/^12\skg, 10 reps per arm$/);

    // UF-09.4: group name, caption, buttons keep their words, the number stays alone in its node.
    await page.getByRole("button", { name: "Done" }).click();
    const confirm = screen(page, "UF-09.4");
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("group", { name: "Reps per arm" })).toBeVisible();
    await expect(confirm.locator('[data-field="reps-side"]')).toHaveText("per arm");
    await expect(confirm.locator('[data-field="reps"]')).toHaveText("10");
    await expect(confirm.getByRole("button", { name: "More reps" })).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Fewer reps" })).toBeVisible();
    await confirm.getByRole("button", { name: /^Save/ }).click();
    await expect(screen(page, "UF-09.5")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip rest" }).click();

    // Sets 2 and 3: the word is still there ("Fewer reps" once makes 9).
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10 per arm"]);
    await logSets(page, [10, 9]);

    // Online: each set uploaded at once, with the per-arm count and the dumbbell's weight, no
    // doubling and no field for the flag.
    await expect.poll(() => writes().length, { timeout: 10_000 }).toBe(3);
    const sent = writes()
      .slice()
      .sort((a, b) => String(a["set_index"]).localeCompare(String(b["set_index"])));
    expect(sent.map((w) => [w.exercise_id, w.reps, w.weight_kg, w.duration_s])).toEqual([
      ["dumbbell-row", 10, 12, null],
      ["dumbbell-row", 10, 12, null],
      ["dumbbell-row", 9, 12, null],
    ]);
    for (const w of sent) {
      expect(Object.keys(w).filter((k) => /^(unilateral|side|arm|leg|per_side)$/i.test(k))).toEqual(
        [],
      );
    }
  });

  test("a bilateral barbell row with the same plan reads exactly as before (no word anywhere)", async ({
    page,
  }) => {
    await mockAll(page);
    await signInAndCache(page);
    await openSeeded(page, plan("barbell-row"));
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10"]);
    await expect(screen(page, "UF-09.3").locator(".wl-uf09__sr")).toHaveCount(0);
    await page.getByRole("button", { name: "Done" }).click();
    const confirm = screen(page, "UF-09.4");
    await expect(confirm.getByRole("group", { name: "Reps" })).toBeVisible();
    await expect(confirm.locator('[data-field="reps-side"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
  });

  test("a side plank holds 'Hold 0:40 per side' on UF-09.7; one hold logs one 40 s set", async ({
    page,
  }) => {
    await mockAll(page);
    await page.clock.install();
    await signInAndCache(page);
    await openSeeded(page, SIDE_PLANK_PLAN, "UF-09.7");
    const timed = screen(page, "UF-09.7");
    await expect(timed.locator('[data-field="target"]')).toHaveText("Hold 0:40 per side");
    await expect(timed.getByRole("timer")).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    // Past the get-in-position count (3 s) and the hold; the hold ends the only set.
    await page.clock.runFor(3000);
    await page.clock.runFor(40_000);
    await expect(screen(page, "UF-03.3")).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------------------------
// AC1: summary, history (UF-06.2) and the List view's rows after the three sets.
// ---------------------------------------------------------------------------------------------

test.describe("AC1 summary and history (UF-03.3, UF-06.2, UF-03.1)", () => {
  test("UF-03.3 PR band and UF-06.2 rows and Best set read '12 × 10 per arm' after logging 10, 10, 9", async ({
    page,
  }) => {
    // A session 20 days ago at 10 kg, so today's 12 kg is a PR for the summary band.
    await mockAll(page, { sets: rowSets(20, 10) });
    await signInAndCache(page);
    await openSeeded(page, plan("dumbbell-row"));
    await logSets(page, [10, 10, 9]);

    const summary = screen(page, "UF-03.3");
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-part="pr"]')).toHaveText(
      /Dumbbell row 12\skg × 10 per arm/,
    );
    await expectAxeClean(page, '[data-screen-id="UF-03.3"]');

    await page.goto("/progress/dumbbell-row");
    const history = screen(page, "UF-06.2");
    await expect(history).toBeVisible();
    const rows = history.locator(".wl-progress__row");
    await expect(rows.first()).toContainText("12 × 10 per arm, 12 × 10 per arm, 12 × 9 per arm");
    await expect(
      history.locator("dt", { hasText: "Best set" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText(/^12\skg × 10 per arm$/);
  });

  test("a control barbell row shows the same sets with no word on the summary or in history", async ({
    page,
  }) => {
    await mockAll(page, { sets: [] });
    await signInAndCache(page);
    await openSeeded(page, plan("barbell-row"));
    await logSets(page, [10, 10, 9]);
    await expect(screen(page, "UF-03.3")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
    await page.goto("/progress/barbell-row");
    await expect(screen(page, "UF-06.2").locator(".wl-progress__row").first()).toContainText(
      "12 × 10, 12 × 10, 12 × 9",
    );
    await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
  });

  test("a side plank hold of 40 s reads '40 s per side' in history and on the summary", async ({
    page,
  }) => {
    await mockAll(page, { sets: [histSet("side-plank", 20, null, null)] });
    await page.clock.install();
    await signInAndCache(page);
    await openSeeded(page, SIDE_PLANK_PLAN, "UF-09.7");
    await page.clock.runFor(3000);
    await page.clock.runFor(40_000);
    await expect(screen(page, "UF-03.3")).toBeVisible({ timeout: 10_000 });
    await page.goto("/progress/side-plank");
    const history = screen(page, "UF-06.2");
    await expect(history).toBeVisible();
    await expect(history.locator(".wl-progress__row").first()).toContainText("40 s per side");
    await expect(
      history.locator("dt", { hasText: "Best set" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("40 s per side");
  });

  test("UF-03.1 List view: Previous reads '12 × 10 per arm' and each row is named 'Set 2 reps per arm'", async ({
    page,
  }) => {
    await mockAll(page, { sets: rowSets(3) });
    await signInAndCache(page);
    await openSeeded(page, plan("dumbbell-row"));
    await page.getByRole("button", { name: "Pause workout" }).click();
    await expect(screen(page, "UF-09.9")).toBeVisible();
    await page.getByRole("button", { name: "List view" }).click();
    const list = screen(page, "UF-03.1");
    await expect(list).toBeVisible();
    await expect(list.getByLabel("Set 2 reps per arm")).toBeVisible();
    await expect
      .poll(async () =>
        list
          .locator('[data-part="set-row"] [data-part="previous"]')
          .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\u00a0/g, " "))),
      )
      .toEqual(["12 × 10 per arm", "12 × 10 per arm", "12 × 9 per arm"]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC2: back coverage rises by 3 hard sets, not 6, and equals a bilateral row's.
// ---------------------------------------------------------------------------------------------

test.describe("AC2 coverage counts one hard set per both-sides set (UF-10.2)", () => {
  for (const [exerciseId, flagged] of [
    ["dumbbell-row", true],
    ["barbell-row", false],
  ] as const) {
    test(`${exerciseId}: 10, 10, 9 at 12 kg adds 3 to back${flagged ? "" : " (the bilateral control)"}`, async ({
      page,
    }) => {
      await mockAll(page);
      await signInAndCache(page);
      await page.goto("/balance/back");
      await expect(screen(page, "UF-10.2")).toBeVisible();
      await expect(screen(page, "UF-10.2").locator('[data-part="value"]')).toHaveText(/^0 \/ 16$/);

      await page.goto("/");
      await expect(screen(page, "UF-02.1")).toBeVisible();
      await openSeeded(page, plan(exerciseId));
      await logSets(page, [10, 10, 9]);
      await expect(screen(page, "UF-03.3")).toBeVisible();

      await page.goto("/balance/back");
      const value = screen(page, "UF-10.2").locator('[data-part="value"]');
      await expect(value).toHaveText(/^3 \/ 16$/);
      await expect(value).not.toHaveText(/^6 \//);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// AC3, AC4: the engine prices a flagged row like a bilateral one, from zero history and after 10
// days off; the label is there from the first set. The plan is built through UF-08.
// ---------------------------------------------------------------------------------------------

/** UF-08.1 (30 min) → Start empty → Add exercise "Dumbbell row" → Looks good → Start → the first
 *  set. Returns what the engine priced (the row's detail and the budget line) and the first set. */
async function planAndStart(
  page: Page,
): Promise<{ detail: string; budget: string; hero: string[] }> {
  await page.goto("/session/setup");
  await expect(screen(page, "UF-08.1")).toBeVisible();
  await page.getByRole("button", { name: "30 minutes" }).click();
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits:/);
  await page.getByRole("button", { name: "Start empty" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = screen(page, "UF-08.5");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Search exercises").fill("dumbbell row");
  await sheet
    .getByRole("button", { name: /^Add Dumbbell row/ })
    .first()
    .click();
  await expect(sheet).toHaveCount(0);
  const itemRow = page.locator('[data-part="item-row"]').filter({ hasText: "Dumbbell row" });
  await expect(itemRow).toHaveCount(1);
  const detail = text(await itemRow.locator('[data-part="row-detail"]').textContent());
  const budget = text(await page.locator('[data-part="budget-text"]').textContent());
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(screen(page, "UF-08.4")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Dumbbell row" })).toBeVisible();
  // The flag reads from the cache a moment after the screen shows; the unflagged run has no word.
  await page.waitForTimeout(500);
  return { detail, budget, hero: await heroLines(page) };
}

async function runPlanned(
  browserPage: Page,
  flag: boolean,
  sets: unknown[],
): Promise<{ detail: string; budget: string; hero: string[] }> {
  await mockAll(browserPage, { sets, library: withFlagged(flag) });
  await signInAndCache(browserPage);
  return planAndStart(browserPage);
}

test.describe("AC3 the engine cost pin (D-0262), and AC4 zero history and 10 days off", () => {
  test("zero history: 3 sets of the flagged row cost what the same row costs unflagged, in a 30-minute budget; the label is on the first set", async ({
    page,
    browser,
  }) => {
    const flagged = await runPlanned(page, true, []);
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const plain = await runPlanned(await other.newPage(), false, []);
    await other.close();

    expect(flagged.detail).toMatch(/^3 × 8–12 · \d+ min$/);
    expect(flagged.detail).toBe(plain.detail);
    expect(flagged.budget).toBe(plain.budget);
    // The first set of a first-ever workout: no weight yet, but the word is there.
    expect(flagged.hero.join(" ")).toMatch(/per arm$/);
    expect(plain.hero.join(" ")).not.toMatch(/per arm/);
    expect(flagged.hero.join(" ").replace(/\s*per arm$/, "")).toBe(plain.hero.join(" "));
  });

  test("returning after 10 days off: the plan, the pre-fill and the hold rules equal the unflagged row's; the label is unchanged", async ({
    page,
    browser,
  }) => {
    // Dumbbell rows at 12 kg three weeks ago, then 10 days ago, and nothing since.
    const sets = [...rowSets(24), ...rowSets(17), ...rowSets(10)];
    const flagged = await runPlanned(page, true, sets);
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const plain = await runPlanned(await other.newPage(), false, sets);
    await other.close();

    expect(flagged.detail).toBe(plain.detail);
    expect(flagged.budget).toBe(plain.budget);
    // Held at 12 kg (rule 14 and the 10-day return are unchanged); only the word differs.
    expect(plain.hero[0]).toBe("12 kg");
    expect(flagged.hero[0]).toBe(plain.hero[0]);
    expect(flagged.hero.join(" ")).toBe(`${plain.hero.join(" ")} per arm`);
  });

  test("a search of packages/engine and the vendored copy finds no 'unilateral'", () => {
    const root = resolve(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          /\.(ts|js|mjs|json|md)$/.test(name) &&
          /unilateral/i.test(readFileSync(path, "utf8"))
        )
          hits.push(path.slice(root.length + 1));
      }
    };
    const dirs = ["packages/engine", "supabase/functions/_shared/vendor/engine"];
    for (const d of dirs) {
      expect(statSync(join(root, d)).isDirectory(), `${d} exists`).toBe(true);
      walk(join(root, d));
    }
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC5: offline, the label shows from the cached library; the set queues plain and uploads on
// reconnect.
// ---------------------------------------------------------------------------------------------

test.describe("AC5 offline (NFR-OFF-2)", () => {
  async function goOfflineOnSeeded(
    page: Page,
    context: BrowserContext,
  ): Promise<{
    gate: OfflineGate;
    writes: () => SetWrite[];
    net: { online: boolean };
    id: string;
  }> {
    await mockAll(page);
    const net = { online: false };
    const writes = await recordSetWrites(page, net);
    await signInAndCache(page);
    const id = randomUUID();
    await seedSessionRow(page, id, plan("dumbbell-row"));
    await page.goto(`/session/${id}`);
    await expect(screen(page, "UF-09.3")).toBeVisible({ timeout: 15_000 });
    await waitForPrecache(page);
    const gate = await goOffline(page, context);
    await page.evaluate((key) => window.localStorage.removeItem(key), `wl-focus:${id}`);
    await page.reload();
    return { gate, writes, net, id };
  }

  test("network off: the label shows from the cache, the set queues as plain 10 reps at 12 kg, then uploads after reconnect", async ({
    page,
    context,
  }) => {
    const { gate, writes, net } = await goOfflineOnSeeded(page, context);
    await expect(screen(page, "UF-09.3")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10 per arm"]);

    await page.getByRole("button", { name: "Done" }).click();
    const confirm = screen(page, "UF-09.4");
    await expect(confirm.getByRole("group", { name: "Reps per arm" })).toBeVisible();
    await expect(confirm.locator('[data-field="reps-side"]')).toHaveText("per arm");
    await confirm.getByRole("button", { name: /^Save/ }).click();
    await expect(screen(page, "UF-09.5")).toBeVisible({ timeout: 10_000 });

    // Queued: one plain row in the device's own database, nothing sent.
    const queued = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("wl-offline");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const r = db.transaction("sets", "readonly").objectStore("sets").getAll();
        r.onsuccess = () => resolve(r.result as never);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return rows;
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ exerciseId: "dumbbell-row", reps: 10, weightKg: 12 });
    expect(
      Object.keys(queued[0]!).filter((k) => /^(unilateral|side|arm|leg|per_side)$/i.test(k)),
    ).toEqual([]);
    expect(gate.writesFulfilledOffline()).toBe(0);
    expect(writes()).toEqual([]);

    // Reconnect: the same plain set uploads.
    net.online = true;
    await gate.goOnline();
    await expect.poll(() => writes().length, { timeout: 15_000 }).toBe(1);
    expect(writes()[0]).toMatchObject({ exercise_id: "dumbbell-row", reps: 10, weight_kg: 12 });
  });

  test("a side plank offline still reads 'Hold 0:40 per side' from the cache", async ({
    page,
    context,
  }) => {
    await mockAll(page);
    await signInAndCache(page);
    const id = randomUUID();
    await seedSessionRow(page, id, SIDE_PLANK_PLAN);
    await page.goto(`/session/${id}`);
    await expect(screen(page, "UF-09.7")).toBeVisible({ timeout: 15_000 });
    await waitForPrecache(page);
    await goOffline(page, context);
    await page.reload();
    await expect(screen(page, "UF-09.7").locator('[data-field="target"]')).toHaveText(
      "Hold 0:40 per side",
    );
  });
});

// ---------------------------------------------------------------------------------------------
// AC6: axe, 44 px targets, and no new element on UF-09 or in UF-09.9.
// ---------------------------------------------------------------------------------------------

test.describe("AC6 accessibility and one task on screen", () => {
  test("UF-09.3 and UF-09.4 with a flagged row: axe clean, targets at least 44 px, same structure as a bilateral row", async ({
    page,
  }) => {
    await mockAll(page);
    await signInAndCache(page);

    const structure = async (): Promise<{ set: string[]; confirm: string[]; buttons: number }> => {
      const kids = (sel: string) =>
        page
          .locator(`${sel} .wl-uf09__view > *`)
          .evaluateAll((els) => els.map((e) => `${e.tagName}.${e.className.split(" ")[0]}`));
      const set = await kids('[data-screen-id="UF-09.3"]');
      const buttons = await page.getByRole("button").count();
      await page.getByRole("button", { name: "Done" }).click();
      await expect(screen(page, "UF-09.4")).toBeVisible();
      return { set, confirm: await kids('[data-screen-id="UF-09.4"]'), buttons };
    };

    // The flagged row.
    await openSeeded(page, plan("dumbbell-row"));
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10 per arm"]);
    await expectAxeClean(page, '[data-screen-id="UF-09.3"]');
    await expectTargets44(page, '[data-screen-id="UF-09.3"]');
    const colour = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(colour.violations).toEqual([]);
    const flaggedShape = await structure();
    await expect(screen(page, "UF-09.4")).toBeVisible();
    await expectAxeClean(page, '[data-screen-id="UF-09.4"]');
    await expectTargets44(page, '[data-screen-id="UF-09.4"]');
    const colour4 = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(colour4.violations).toEqual([]);

    // The bilateral control: the same blocks, the same buttons.
    await page.goto("/");
    await expect(screen(page, "UF-02.1")).toBeVisible();
    await openSeeded(page, plan("barbell-row"));
    await expect.poll(() => heroLines(page)).toEqual(["12 kg", "× 10"]);
    const plainShape = await structure();
    expect(flaggedShape).toEqual(plainShape);
  });

  test("UF-09.9 Paused has the same buttons for a flagged row as for a bilateral one", async ({
    page,
  }) => {
    await mockAll(page);
    await signInAndCache(page);
    const pausedButtons = async (exerciseId: string): Promise<string[]> => {
      await page.goto("/");
      await expect(screen(page, "UF-02.1")).toBeVisible();
      await openSeeded(page, plan(exerciseId));
      await page.getByRole("button", { name: "Pause workout" }).click();
      await expect(screen(page, "UF-09.9")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
      return page
        .getByRole("button")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent ?? ""));
    };
    const flagged = await pausedButtons("dumbbell-row");
    expect(flagged).toHaveLength(6);
    expect(flagged).toEqual(await pausedButtons("barbell-row"));
  });

  test("UF-04.2 how-to with a flagged row: the one-side line, axe clean, targets at least 44 px; a bilateral row has no line", async ({
    page,
  }) => {
    await mockAll(page);
    await signInAndCache(page);

    await page.goto("/library/dumbbell-row");
    const detail = screen(page, "UF-04.2");
    await expect(detail).toBeVisible();
    await expect(detail.locator('[data-field="one-side"]')).toHaveText(
      "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side.",
    );
    await expectAxeClean(page, '[data-screen-id="UF-04.2"]');
    await expectTargets44(page, '[data-screen-id="UF-04.2"]');

    await page.goto("/library/side-plank");
    await expect(screen(page, "UF-04.2")).toBeVisible();
    await expect(screen(page, "UF-04.2").locator('[data-field="one-side"]')).toHaveText(
      "Hold one side, then switch. Log seconds for one side.",
    );

    await page.goto("/library/barbell-row");
    await expect(screen(page, "UF-04.2")).toBeVisible();
    await expect(screen(page, "UF-04.2").locator('[data-field="one-side"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// AC7: onboarding is untouched, with the flagged rows in the library.
// ---------------------------------------------------------------------------------------------

test.describe("AC7 onboarding to a first plan (principle 5)", () => {
  test("3 activations from /welcome show the 9-area plan in under 5 s (the record says under 60 s), with no per-side wording", async ({
    page,
  }) => {
    await mockSupabaseRest(page);
    await mockSupabaseAuth(page);
    await mockSupabaseEmptyReads(page);
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercises*`, (route) =>
      route.fulfill({ status: 200, json: withFlagged() }),
    );
    await page.setViewportSize({ width: 360, height: 640 });

    const t0 = Date.now();
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(screen(page, "UF-01.2")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(screen(page, "UF-01.3")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    const plan4 = screen(page, "UF-01.4");
    await expect(plan4).toBeVisible();
    await expect(plan4.locator("[data-area]")).toHaveCount(9);
    const wall = Date.now() - t0;

    expect(wall).toBeLessThan(5_000);
    const stored = JSON.parse(
      (await page.evaluate(() => window.localStorage.getItem("wl-onboarding"))) ?? "{}",
    ) as { timingMs: number; planShown: boolean };
    expect(stored.planShown).toBe(true);
    expect(stored.timingMs).toBeLessThan(60_000);
    await expect(page.locator("body")).not.toContainText(/per (arm|leg|side)/);
  });
});
