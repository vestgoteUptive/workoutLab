// T-0422 AC-10 UF-05.1 Swap inside focus mode (D-0071 §10, NFR-OFF-2). Runs against
// `vite preview` with Supabase mocked through `page.route`. `test`/`expect` come from
// `fixtures/guarded-test.js` (D-0086): an unclaimed Supabase request or a console error fails the
// test at teardown.
//
// The seed (the `uf-09-focus.spec.ts` pattern): the shell's online refresh fills the library and
// profile caches from the mocks, then one P1-like `sessions` row goes straight into the app's own
// `wl-offline` database in the `QueuedSession` shape (`pending: false`). The context then goes
// offline after the precache settles, so the swap is written to the queue and nothing flushes.
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

const FULL_EQUIPMENT = ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"];

const PROFILE = {
  user_id: FAKE_USER_ID,
  goal: "build_muscle",
  level: "beginner",
  equipment: FULL_EQUIPMENT,
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

type Weights = Partial<Record<(typeof AREAS)[number], number>>;

/** [id, name, type, equipment, areas, increment (null: bodyweight), kind] — engine L1 and its
 *  warm-up moves (docs/engine-rules.md §Fixtures), so UF-02.1 can build its suggestion too. */
type Row = [string, string, string, string[], Weights, number | null, ("exercise" | "warmup")?];
const LIBRARY: Row[] = [
  [
    "back-squat",
    "Back squat",
    "compound",
    ["barbell", "rack"],
    { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
    2.5,
  ],
  [
    "romanian-deadlift",
    "Romanian deadlift",
    "compound",
    ["barbell"],
    { hamstrings: 1, glutes: 0.5 },
    2.5,
  ],
  [
    "hip-thrust",
    "Hip thrust",
    "compound",
    ["barbell", "bench"],
    { glutes: 1, hamstrings: 0.5 },
    2.5,
  ],
  ["leg-extension", "Leg extension", "isolation", ["machine"], { quads: 1 }, 5],
  ["leg-curl", "Leg curl", "isolation", ["machine"], { hamstrings: 1 }, 5],
  ["calf-raise", "Calf raise", "isolation", ["machine"], { calves: 1 }, 5],
  [
    "bench-press",
    "Bench press",
    "compound",
    ["barbell", "bench"],
    { chest: 1, shoulders: 0.5, arms: 0.5 },
    2.5,
  ],
  [
    "db-bench-press",
    "Db bench press",
    "compound",
    ["dumbbell", "bench"],
    { chest: 1, shoulders: 0.5, arms: 0.5 },
    2,
  ],
  ["push-up", "Push up", "compound", [], { chest: 1, arms: 0.5, core: 0.5 }, null],
  [
    "overhead-press",
    "Overhead press",
    "compound",
    ["barbell"],
    { shoulders: 1, arms: 0.5, core: 0.5 },
    2.5,
  ],
  ["lateral-raise", "Lateral raise", "isolation", ["dumbbell"], { shoulders: 1 }, 2],
  ["barbell-row", "Barbell row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5],
  ["db-row", "Db row", "compound", ["dumbbell", "bench"], { back: 1, arms: 0.5 }, 2],
  ["lat-pulldown", "Lat pulldown", "compound", ["cable"], { back: 1, arms: 0.5 }, 5],
  ["biceps-curl", "Biceps curl", "isolation", ["dumbbell"], { arms: 1 }, 2],
  ["dead-bug", "Dead bug", "isolation", [], { core: 1 }, null],
  [
    "wu-scap-push-up",
    "Scap push-up",
    "isolation",
    [],
    { chest: 1, shoulders: 0.5 },
    null,
    "warmup",
  ],
  ["wu-arm-circle", "Arm circle", "isolation", [], { shoulders: 1, chest: 0.5 }, null, "warmup"],
  [
    "wu-band-pull-apart",
    "Band pull-apart",
    "isolation",
    [],
    { back: 1, shoulders: 0.5 },
    null,
    "warmup",
  ],
  ["wu-cat-cow", "Cat cow", "isolation", [], { core: 1, back: 0.5 }, null, "warmup"],
  [
    "wu-bodyweight-squat",
    "Bodyweight squat",
    "isolation",
    [],
    { quads: 1, glutes: 1 },
    null,
    "warmup",
  ],
  ["wu-leg-swing", "Leg swing", "isolation", [], { hamstrings: 1, glutes: 0.5 }, null, "warmup"],
  ["wu-jumping-jack", "Jumping jack", "isolation", [], {}, null, "warmup"],
  ["wu-march-in-place", "March in place", "isolation", [], {}, null, "warmup"],
];

function exerciseRow([id, name, type, equipment, , increment, kind = "exercise"]: Row) {
  return {
    id,
    name,
    type,
    level: "beginner",
    equipment,
    instructions: [],
    mistakes: [],
    cue: null,
    timed: kind === "warmup",
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind,
    increment_kg: increment,
    default_duration_s: kind === "warmup" ? 40 : null,
    external_load: increment !== null,
  };
}

const EXERCISE_AREAS = LIBRARY.flatMap(([id, , , , areas]) =>
  Object.entries(areas).map(([area, weight]) => ({ exercise_id: id, area_id: area, weight })),
);

function item(exerciseId: string, isMain: boolean, sets: number, repsMin: number, costS: number) {
  return {
    exerciseId,
    isMain,
    sets,
    repsMin,
    repsMax: repsMin + 4,
    durationS: null,
    costS,
    backoff: null,
    prefill: { weightKg: null, reps: repsMin, durationS: null, kind: "first_time" },
    reasons: [],
  };
}

/** P1-like, with no warm-up: bench-press × 4 (main), barbell-row × 3, leg-curl × 3. */
const PLAN = {
  version: 1,
  mainLiftId: "bench-press",
  warmup: [],
  items: [
    item("bench-press", true, 4, 6, 720),
    item("barbell-row", false, 3, 8, 555),
    item("leg-curl", false, 3, 10, 375),
  ],
  startDeficits: Object.fromEntries(AREAS.map((a) => [a, 1])),
};

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises: LIBRARY.map(exerciseRow),
    exerciseAreas: EXERCISE_AREAS,
    areaTargets: AREAS.map((area) => ({
      user_id: FAKE_USER_ID,
      area_id: area,
      sets_per_14d: 12,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: PROFILE,
  });
  await mockProfilePresent(page, PROFILE);
  await page.goto("/");
  await injectSession(page);
});

async function openDb(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
}

/** Waits until the shell's refresh has cached the library and the profile. */
async function cachesFilled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (userId: string) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const library = await new Promise<number>((resolve, reject) => {
          const req = db
            .transaction("libraryCache", "readonly")
            .objectStore("libraryCache")
            .count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const profile = await new Promise<boolean>((resolve, reject) => {
          const req = db
            .transaction("profileCache", "readonly")
            .objectStore("profileCache")
            .get(userId);
          req.onsuccess = () => resolve(req.result !== undefined);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return { library, profile };
      }, FAKE_USER_ID),
    )
    .toEqual({ library: LIBRARY.length, profile: true });
}

async function seedSessionRow(page: Page, id: string): Promise<void> {
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
    { id, userId: FAKE_USER_ID, plan: PLAN },
  );
}

interface StoredPlan {
  mainLiftId: string | null;
  items: Array<{ exerciseId: string; isMain: boolean }>;
}

async function storedPlan(page: Page, id: string): Promise<StoredPlan> {
  return page.evaluate(async (sessionId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: { plan: unknown } }>((resolve, reject) => {
      const req = db.transaction("sessions", "readonly").objectStore("sessions").get(sessionId);
      req.onsuccess = () => resolve(req.result as { row: { plan: unknown } });
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entry.row.plan as StoredPlan;
  }, id);
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

/** Moves focus with `key` until `target` has it (keyboard only, no clicks). */
async function keyTo(
  page: Page,
  target: ReturnType<Page["locator"]>,
  key: "Tab" | "Shift+Tab" = "Tab",
): Promise<void> {
  for (let i = 0; i < 16; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

test.describe("T-0422 AC-10 Swap from UF-09.9, offline", () => {
  test("Pause → Swap by keyboard → the first option → Use → Resume shows it; a reload reads it back; axe clean", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
    await cachesFilled(page);
    const id = randomUUID();
    await seedSessionRow(page, id);
    await page.goto(`/session/${id}`);
    await expect(page.locator('[data-screen-id="UF-09.1"]')).toBeVisible();
    await precacheSettled(page);
    await context.setOffline(true);
    await page.reload();

    // UF-09.1 (no warm-up) → Start now → UF-09.3 bench-press set 1.
    const ready = page.locator('[data-screen-id="UF-09.1"]');
    await expect(ready.getByRole("button", { name: "Start now" })).toBeFocused();
    await page.keyboard.press("Enter");
    const current = page.locator('[data-screen-id="UF-09.3"]');
    await expect(current.getByRole("heading", { level: 1, name: "Bench press" })).toBeVisible();

    // Pause → UF-09.9 → Swap, by keyboard.
    await keyTo(page, page.getByRole("button", { name: "Pause workout" }), "Shift+Tab");
    await page.keyboard.press("Enter");
    const paused = page.locator('[data-screen-id="UF-09.9"]');
    await expect(paused.getByRole("button", { name: "Resume" })).toBeFocused();
    await keyTo(page, paused.getByRole("button", { name: "Swap" }));
    await page.keyboard.press("Enter");

    const sheet = page.getByRole("dialog", { name: "Replace Bench press" });
    await expect(sheet).toBeVisible();
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    await expect(page.locator('[data-screen-id="UF-05.1"]')).toHaveCount(1);
    await expect(page.locator("a[href]")).toHaveCount(0);
    const rows = sheet.getByRole("radiogroup", { name: "Replacement" }).locator("[data-id]");
    await expect(rows.first()).toBeVisible();
    const box = await rows.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);

    // The first option, then "Use …", by keyboard.
    const firstId = (await rows.first().getAttribute("data-id"))!;
    const firstName = (await rows.first().locator('[data-field="name"]').textContent())!;
    expect(firstId).not.toBe("bench-press");
    const radio = rows.first().getByRole("radio");
    await keyTo(page, radio);
    await page.keyboard.press("Space");
    await expect(radio).toBeChecked();
    const use = sheet.getByRole("button", { name: `Use ${firstName}` });
    await keyTo(page, use);
    await page.keyboard.press("Enter");

    // Back on UF-09.9; Resume → UF-09.3 shows the new exercise.
    await expect(paused.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await paused.getByRole("button", { name: "Resume" }).focus();
    await page.keyboard.press("Enter");
    await expect(current.getByRole("heading", { level: 1, name: firstName })).toBeVisible();
    await expect(current.getByText("Lifting · set 1 of 4")).toBeVisible();

    // After a reload (still offline): the queued row holds the new exercise, and UF-09 shows it.
    await page.reload();
    await expect(current.getByRole("heading", { level: 1, name: firstName })).toBeVisible();
    const plan = await storedPlan(page, id);
    expect(plan.items.map((i) => i.exerciseId)).toEqual([firstId, "barbell-row", "leg-curl"]);
    expect(plan.items[0]!.isMain).toBe(true);
    expect(plan.mainLiftId).toBe(firstId);
  });
});
