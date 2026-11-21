// T-0950 UF-09.9 "Add exercise" -> UF-09.10 e2e (D-0243..D-0247; spec docs/specs/add-exercise-in-session.md
// B1-B21). Every row starts from a session seeded straight into the app's own stores, the way
// `uf-09-focus.spec.ts` does: one `sessions` row in IndexedDB (`pending: false`) and one paused
// `wl-focus:<id>` state in localStorage, with `started_at` placed so rule 8's elapsed time is the
// number the spec's example uses (a paused workout's elapsed time stands still). The plan is the
// spec's fixture P: bench-press x 4 (720 s), inverted-row x 3 (555 s), leg-extension x 2 (270 s).
// A hard `page.goto` into `/session/<id>` is also "a reload straight into UF-09, SessionSetup never
// loaded" (D-0246 §16). Helpers are this spec's own copies (D-0168 §1).
import { randomUUID } from "node:crypto";
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
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercisesLoaded, profile } from "./fixtures/uf-04-library-data.js";

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

interface PlanItem {
  exerciseId: string;
  isMain: boolean;
  sets: number;
  repsMin: number;
  repsMax: number;
  durationS: null;
  costS: number;
  backoff: null;
  prefill: { weightKg: number | null; reps: number; durationS: null; kind: string };
  reasons: unknown[];
}

function item(
  exerciseId: string,
  isMain: boolean,
  sets: number,
  [repsMin, repsMax]: [number, number],
  costS: number,
): PlanItem {
  return {
    exerciseId,
    isMain,
    sets,
    repsMin,
    repsMax,
    durationS: null,
    costS,
    backoff: null,
    prefill: { weightKg: 20, reps: repsMin, durationS: null, kind: "add_rep" },
    reasons: [],
  };
}

const bench = () => item("bench-press", true, 4, [6, 8], 720);
const row = () => item("inverted-row", false, 3, [8, 12], 555);
const legExt = () => item("leg-extension", false, 2, [10, 15], 270);

function planOf(items: PlanItem[]): object {
  return {
    version: 1,
    mainLiftId: items[0]?.exerciseId ?? null,
    warmup: [],
    items,
    startDeficits: Object.fromEntries(AREAS.map((a) => [a, 1])),
  };
}

interface Logged {
  itemIndex: number;
  setIndex: number;
  exerciseId: string;
}

interface Seed {
  id: string;
  plan: object;
  budgetMin: number;
  elapsedS: number;
  resumePhase: "rest" | "set" | "next" | "timeCheck";
  itemIndex: number;
  setIndex: number;
  logged: Logged[];
  energy?: "low" | "normal";
}

/** Signs in, loads `/` once so the app opens its database, then writes the session row and the paused focus state. */
async function seedPaused(page: Page, s: Seed): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect(page.locator('[data-screen-id="UF-02.1"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "wl-offline" && (d.version ?? 0) > 0),
      ),
    )
    .toBe(true);
  await page.evaluate(
    async ({ s, userId }) => {
      const nowMs = Date.now();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("wl-offline");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({
          id: s.id,
          userId,
          row: {
            id: s.id,
            started_at: new Date(nowMs - s.elapsedS * 1000).toISOString(),
            time_budget_min: s.budgetMin,
            energy: s.energy ?? "normal",
            warmup_in_budget: true,
            ended_at: null,
            plan: s.plan,
          },
          finished: false,
          pending: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const timer =
        s.resumePhase === "rest"
          ? { startedAtMs: nowMs - 30_000, durationS: 120, pausedMs: 0 }
          : s.resumePhase === "next"
            ? { startedAtMs: nowMs - 5000, durationS: 60, pausedMs: 0 }
            : null;
      localStorage.setItem(
        `wl-focus:${s.id}`,
        JSON.stringify({
          version: 1,
          sessionId: s.id,
          phase: "paused",
          itemIndex: s.itemIndex,
          setIndex: s.setIndex,
          warmupIndex: 0,
          timer,
          pausedAtMs: nowMs,
          resumePhase: s.resumePhase,
          workoutPausedMs: 0,
          warmupStartedAtMs: null,
          warmupSpentMs: 0,
          loggedSets: s.logged.map((l, i) => ({
            clientId: `seed-${i}`,
            itemIndex: l.itemIndex,
            setIndex: l.setIndex,
            exerciseId: l.exerciseId,
            reps: 8,
            weightKg: 20,
            durationS: null,
            rir: null,
            backoff: false,
          })),
          timerPausedAtMs: null,
          skippedItems: [],
        }),
      );
    },
    { s, userId: FAKE_USER_ID },
  );
}

/** A hard set `daysAgo` days back (local-noon-safe: midday UTC), the `session_sets_live` row shape. */
function historySets(
  exerciseId: string,
  n: number,
  daysAgo: number,
  weightKg: number,
  reps: number,
) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  at.setUTCHours(12, 0, 0, 0);
  const completedAt = at.toISOString();
  return Array.from({ length: n }, (_, i) => ({
    client_id: `${exerciseId}-${daysAgo}-${i}`,
    session_id: "S-old",
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: completedAt,
    edited_at: completedAt,
    deleted_at: null,
    reps,
    weight_kg: weightKg,
    duration_s: null,
    rir: null,
  }));
}

async function mockAll(
  page: Page,
  extra: { sets?: unknown[]; favoriteExercises?: unknown[] } = {},
): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: extra.sets ?? [],
    favoriteExercises: extra.favoriteExercises,
    exercises: exercisesLoaded,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile,
  });
  await mockProfilePresent(page, { ...profile, user_id: "e2e-fake-user-0001" });
}

/** Waits until the history cache holds `count` rows (the refresh the shell fires on load). */
async function historyCached(page: Page, count: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const n = await new Promise<number>((resolve, reject) => {
          const req = db
            .transaction("historyCache", "readonly")
            .objectStore("historyCache")
            .count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return n;
      }),
    )
    .toBeGreaterThanOrEqual(count);
}

interface StoredRow {
  ended_at: string | null;
  plan: { mainLiftId: string | null; items: PlanItem[] };
  pending: boolean;
}

async function storedRow(page: Page, id: string): Promise<StoredRow> {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: unknown; pending: boolean }>((resolve, reject) => {
      const req = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
      req.onsuccess = () => resolve(req.result as never);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return { ...(entry.row as object), pending: entry.pending } as never;
  }, id);
}

const ids = (r: StoredRow) => r.plan.items.map((i) => i.exerciseId);

const paused = (page: Page) => page.locator('[data-screen-id="UF-09.9"]');
const addButton = (page: Page) => page.getByRole("button", { name: "Add exercise" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add exercise" });
const addedLine = (page: Page) => page.locator('[data-field="added-line"]');

async function openSession(page: Page, id: string): Promise<void> {
  await page.goto(`/session/${id}`);
  await expect(paused(page)).toBeVisible();
}

async function openSheet(page: Page): Promise<Locator> {
  await addButton(page).click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  // The rows render once the device cache is read.
  await expect(dialog.getByRole("button", { name: /^Add / }).first()).toBeVisible();
  return dialog;
}

/** Searches for Lateral raise (it is not in "Today's areas" for this plan) and taps its Add. */
async function addLateral(dialog: Locator): Promise<void> {
  await dialog.getByRole("searchbox").fill("lateral");
  await dialog.getByRole("button", { name: /^Add Lateral raise/ }).click();
}

/** Sets 1..n of the current item: Done, weight if asked for, Save; the caller handles what follows. */
async function logSet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator('[data-screen-id="UF-09.4"]')).toBeVisible();
  const weight = page.getByRole("textbox", { name: "Weight (kg)" });
  if ((await weight.count()) > 0 && (await weight.inputValue()) === "") await weight.fill("10");
  await page.getByRole("button", { name: /^Save/ }).click();
}

async function serious(page: Page, include?: string): Promise<unknown[]> {
  const builder = new AxeBuilder({ page });
  const results = await (include ? builder.include(include) : builder).analyze();
  return results.violations;
}

const P_PLAN = () => planOf([bench(), row(), legExt()]);
const REST_AFTER_SET_2: Omit<Seed, "id" | "plan"> = {
  budgetMin: 45,
  elapsedS: 600,
  resumePhase: "rest",
  itemIndex: 0,
  setIndex: 1,
  logged: [
    { itemIndex: 0, setIndex: 0, exerciseId: "bench-press" },
    { itemIndex: 0, setIndex: 1, exerciseId: "bench-press" },
  ],
};

test.describe("T-0950 AC1 B1 zero history, paused in a rest", () => {
  test("15 min left, no Favorites, the add lands after Bench press, Resume continues the rest, then UF-09.6 Lateral raise", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await openSession(page, id);
    await expect(paused(page).getByText("2 / 9")).toBeVisible();

    // The Paused node must survive the whole add (D-0246 §7: no remount).
    await page.evaluate(() => {
      document.querySelector(".wl-uf09__view--paused")?.setAttribute("data-probe", "same");
    });

    const dialog = await openSheet(page);
    await expect(dialog.getByText("15 min left")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Favorites" })).toHaveCount(0);
    // Contrast: the plan's own items cannot be added (B10).
    const inPlanRow = dialog.getByRole("button", { name: "Add Inverted row" });
    await dialog.getByRole("searchbox").fill("inverted");
    await expect(inPlanRow).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.locator('[data-part="pick-row"][data-id="inverted-row"] [data-part="pick-reason"]'),
    ).toHaveText("In this workout");
    await dialog.getByRole("searchbox").fill("");

    await addLateral(dialog);
    await expect(dialog).toHaveCount(0);
    await expect(paused(page)).toBeVisible();
    await expect(addedLine(page)).toHaveText("Lateral raise added after Bench press.");
    await expect(addedLine(page)).toHaveAttribute("role", "status");
    await expect(addButton(page)).toBeFocused();
    await expect(page.locator('.wl-uf09__view--paused[data-probe="same"]')).toHaveCount(1);
    await expect(paused(page).getByText("2 / 12")).toBeVisible();

    const stored = await storedRow(page, id);
    expect(ids(stored)).toEqual(["bench-press", "lateral-raise", "inverted-row", "leg-extension"]);
    expect(stored.plan.mainLiftId).toBe("bench-press");
    expect(stored.plan.items[1]).toMatchObject({
      isMain: false,
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      costS: 375,
      prefill: { weightKg: null, reps: 10, kind: "first_time" },
    });

    // Resume returns to the rest where it stopped (~90 s of 120 s left), not past it.
    await page.getByRole("button", { name: "Resume" }).click();
    const rest = page.locator('[data-screen-id="UF-09.5"]');
    await expect(rest).toBeVisible();
    await expect(rest.getByRole("timer")).toHaveText(/^1:(30|29|28)$/);
    await page.getByRole("button", { name: "Skip rest" }).click();
    // Bench press sets 3 and 4, then the added item is next (B1, B17: no UF-09.8).
    await logSet(page);
    await page.getByRole("button", { name: "Skip rest" }).click();
    await logSet(page);
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip rest" }).click();
    const next = page.locator('[data-screen-id="UF-09.6"]');
    await expect(next).toBeVisible({ timeout: 10_000 });
    await expect(next.getByRole("heading", { level: 1 })).toHaveText("Lateral raise");
    await expect(next.locator('[data-field="kg"]')).toHaveCount(0);
    await expect(next.locator('[data-field="summary"]')).toContainText("3");
    await expect(next.locator('[data-field="summary"]')).toContainText("10");
  });
});

test.describe("T-0950 AC2 B13 back after 10 days off", () => {
  test("a lateral raise last done 10 days ago at 10 kg x 12 is pre-filled 10 kg x 10; a favorite shows under Favorites", async ({
    page,
  }) => {
    await mockAll(page, {
      sets: historySets("lateral-raise", 3, 10, 10, 12),
      favoriteExercises: [{ exercise_id: "lateral-raise", created_at: new Date().toISOString() }],
    });
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await page.goto("/");
    await historyCached(page, 3);
    await openSession(page, id);

    const dialog = await openSheet(page);
    // Contrast with AC1: with a favorite, the section is there.
    await expect(dialog.getByRole("heading", { name: "Favorites" })).toBeVisible();
    await addLateral(dialog);
    await expect(addedLine(page)).toHaveText("Lateral raise added after Bench press.");

    const stored = await storedRow(page, id);
    const added = stored.plan.items[1]!;
    expect(added.exerciseId).toBe("lateral-raise");
    expect(added.prefill).toMatchObject({ weightKg: 10, reps: 10, kind: "hold_after_break" });
    expect(added.reasons).toContainEqual({ code: "days_since", area: "shoulders", days: 10 });
  });
});

test.describe("T-0950 AC3 B3/B4 time running out", () => {
  test("under 60 s left: No time left, and the add is refused with no write", async ({ page }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2, budgetMin: 30 });
    await openSession(page, id);
    const dialog = await openSheet(page);
    await expect(dialog.getByText("No time left")).toBeVisible();
    await addLateral(dialog);
    await expect(dialog.getByRole("status")).toHaveText("Lateral raise doesn't fit. No time left.");
    await expect(dialog).toBeVisible();
    const stored = await storedRow(page, id);
    expect(ids(stored)).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(stored.pending).toBe(false);
  });

  test("2 to 3 min left: the refusal names the minutes; the plan is unchanged", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2, budgetMin: 32 });
    await openSession(page, id);
    const dialog = await openSheet(page);
    await expect(dialog.getByText("2 min left")).toBeVisible();
    await addLateral(dialog);
    await expect(dialog.getByRole("status")).toHaveText(
      "Lateral raise doesn't fit in the 2 min left.",
    );
    const stored = await storedRow(page, id);
    expect(ids(stored)).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(stored.pending).toBe(false);
  });

  test("a few minutes more: the same add falls back to 2 sets (B2), so the refusal above is the time and not the exercise", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2, budgetMin: 35 });
    await openSession(page, id);
    const dialog = await openSheet(page);
    await addLateral(dialog);
    await expect(addedLine(page)).toHaveText("Lateral raise added after Bench press.");
    const stored = await storedRow(page, id);
    expect(stored.plan.items[1]).toMatchObject({
      exerciseId: "lateral-raise",
      sets: 2,
      costS: 270,
    });
  });
});

/** The recorder for `sessions` writes, registered before `goOffline` so its gate runs first. */
async function recordSessionWrites(page: Page) {
  const writes: { id: string; ended_at?: string | null; plan?: { items: PlanItem[] } }[] = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    const body = request.postDataJSON() as (typeof writes)[number] | (typeof writes)[number][];
    writes.push(...(Array.isArray(body) ? body : [body]));
    return route.fulfill({ status: 201, json: [] });
  });
  return writes;
}

/** Waits for the service worker's precache to settle before going offline (T-0904). */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  let previous = -1;
  await expect
    .poll(async () => {
      const counts = await page.evaluate(async () => {
        const precache = (await caches.keys()).find((k) => k.startsWith("workbox-precache"));
        if (!precache) return { entries: 0, hasDocument: false };
        const requests = await (await caches.open(precache)).keys();
        return {
          entries: requests.length,
          hasDocument: requests.some((r) => new URL(r.url).pathname === "/index.html"),
        };
      });
      const stable = counts.entries > 0 && counts.entries === previous;
      previous = counts.entries;
      return stable && counts.hasDocument;
    })
    .toBe(true);
}

test.describe("T-0950 AC4/AC5 B14/B21 offline, reload, finish while queued", () => {
  test("offline add, reload resumes paused with the item and sets; online the server plan holds it; finishing lists it", async ({
    page,
    context,
  }) => {
    await mockAll(page);
    const writes = await recordSessionWrites(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    // Warm the lazy sheet chunk online first: a dynamic import of a code-split chunk can fail
    // offline even from the precache (see uf-09-offline.spec.ts), so this is the "opened once" case.
    await page.goto(`/session/${id}`);
    await expect(paused(page)).toBeVisible();
    await precacheSettled(page);
    const gate = await goOffline(page, context);
    await page.reload();
    await expect(paused(page)).toBeVisible();

    const dialog = await openSheet(page);
    await addLateral(dialog);
    await expect(addedLine(page)).toHaveText("Lateral raise added after Bench press.");
    const queued = await storedRow(page, id);
    expect(ids(queued)).toEqual(["bench-press", "lateral-raise", "inverted-row", "leg-extension"]);
    expect(queued.pending).toBe(true);
    expect(writes.filter((w) => w.id === id)).toEqual([]);

    // B14: a reload while offline resumes paused with four items and both logged sets.
    await page.reload();
    await expect(paused(page)).toBeVisible();
    await expect(paused(page).getByText("2 / 12")).toBeVisible();
    const again = await openSheet(page);
    await again.getByRole("searchbox").fill("lateral");
    await expect(
      again.locator('[data-part="pick-row"][data-id="lateral-raise"] [data-part="pick-reason"]'),
    ).toHaveText("In this workout");
    await again.getByRole("button", { name: "Close" }).click();
    await expect(again).toHaveCount(0);

    // B21: finish while the write is still queued.
    await page.getByRole("button", { name: "End workout" }).click();
    await page.getByRole("button", { name: "End workout" }).click();
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible();
    const finished = await storedRow(page, id);
    expect(finished.ended_at).not.toBeNull();
    expect(ids(finished)).toContain("lateral-raise");
    expect(writes.filter((w) => w.id === id)).toEqual([]);

    // Back online: the server row has the ended workout and the plan with the added item.
    await gate.goOnline();
    await expect
      .poll(() => writes.filter((w) => w.id === id && w.plan && w.ended_at).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    const last = writes.filter((w) => w.id === id && w.plan).at(-1)!;
    expect(last.plan!.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "lateral-raise",
      "inverted-row",
      "leg-extension",
    ]);
  });

  test("online after an offline add, with no finish: the queued plan write reaches the server", async ({
    page,
    context,
  }) => {
    await mockAll(page);
    const writes = await recordSessionWrites(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await page.goto(`/session/${id}`);
    await expect(paused(page)).toBeVisible();
    await precacheSettled(page);
    const gate = await goOffline(page, context);
    await page.reload();
    const dialog = await openSheet(page);
    await addLateral(dialog);
    await expect(addedLine(page)).toHaveText("Lateral raise added after Bench press.");
    await gate.goOnline();
    await expect
      .poll(() => writes.filter((w) => w.id === id && w.plan).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const last = writes.filter((w) => w.id === id && w.plan).at(-1)!;
    expect(last.plan!.items.map((i) => i.exerciseId)).toContain("lateral-raise");
  });
});

test.describe("T-0950 AC6 B20 swap, then add back", () => {
  test("Bench press has 2 logged sets and is no longer an item: In this workout, no Add, no write", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    const plan = planOf([item("db-bench-press", true, 4, [6, 8], 720), row(), legExt()]);
    await seedPaused(page, {
      id,
      plan,
      ...REST_AFTER_SET_2,
      logged: [
        { itemIndex: 0, setIndex: 0, exerciseId: "bench-press" },
        { itemIndex: 0, setIndex: 1, exerciseId: "bench-press" },
      ],
    });
    await openSession(page, id);
    const dialog = await openSheet(page);
    await dialog.getByRole("searchbox").fill("bench");
    const benchRow = dialog.locator('[data-part="pick-row"][data-id="bench-press"]');
    await expect(benchRow).toBeVisible();
    await expect(benchRow.locator('[data-part="pick-reason"]')).toHaveText("In this workout");
    const benchAdd = benchRow.getByRole("button", { name: "Add Bench press" });
    await expect(benchAdd).toHaveAttribute("aria-disabled", "true");
    await benchAdd.click({ force: true });
    await expect(dialog.getByRole("status")).toHaveText("");
    // The control: a row the workout hasn't touched still has its Add.
    await dialog.getByRole("searchbox").fill("lateral");
    await expect(dialog.getByRole("button", { name: /^Add Lateral raise/ })).toBeVisible();
    const stored = await storedRow(page, id);
    expect(ids(stored)).toEqual(["db-bench-press", "inverted-row", "leg-extension"]);
    expect(stored.pending).toBe(false);
  });
});

test.describe("T-0950 AC7 B16 one task on screen, Escape and Back", () => {
  test("Escape closes only the sheet, focus returns to Add exercise, still paused", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await openSession(page, id);
    const elapsed = await paused(page).locator('[data-field="elapsed"]').textContent();
    const dialog = await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(paused(page)).toBeVisible();
    await expect(addButton(page)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/session/${id}$`));
    await expect(paused(page).locator('[data-field="elapsed"]')).toHaveText(elapsed ?? "");
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
    expect(ids(await storedRow(page, id))).toHaveLength(3);
  });

  test("browser Back closes only the sheet, focus returns to Add exercise, still paused", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await openSession(page, id);
    const dialog = await openSheet(page);
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(paused(page)).toBeVisible();
    await expect(addButton(page)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/session/${id}$`));
    await expect(page.locator("[data-screen-id]")).toHaveCount(1);
  });

  test("a pause from UF-09.8 has no Add exercise; UF-09.3 and UF-09.5 have no Add control", async ({
    page,
  }) => {
    await mockAll(page);
    const checkId = randomUUID();
    await seedPaused(page, {
      id: checkId,
      plan: P_PLAN(),
      budgetMin: 45,
      elapsedS: 1500,
      resumePhase: "timeCheck",
      itemIndex: 1,
      setIndex: 0,
      logged: [0, 1, 2, 3].map((setIndex) => ({
        itemIndex: 0,
        setIndex,
        exerciseId: "bench-press",
      })),
    });
    await openSession(page, checkId);
    await expect(page.getByRole("button", { name: "Swap" })).toBeVisible();
    await expect(addButton(page)).toHaveCount(0);

    // UF-09.5 and UF-09.3: no Add control while the workout runs.
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await openSession(page, id);
    await expect(addButton(page)).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Add/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Skip rest" }).click();
    await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Add/ })).toHaveCount(0);
  });
});

test.describe("T-0950 AC8 B19 targets and axe after a reload into UF-09", () => {
  test("every button is at least 44 px and axe is clean on UF-09.9 and on the sheet", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    await seedPaused(page, { id, plan: P_PLAN(), ...REST_AFTER_SET_2 });
    await openSession(page, id);
    expect(await serious(page)).toEqual([]);
    const addBox = await addButton(page).boundingBox();
    expect(addBox!.height).toBeGreaterThanOrEqual(44);

    const dialog = await openSheet(page);
    expect(await serious(page, '[role="dialog"]')).toEqual([]);
    const small = await dialog.locator("button, input, a").evaluateAll((els) =>
      els
        .map((el) => ({
          name: el.getAttribute("aria-label") ?? el.textContent,
          r: el.getBoundingClientRect(),
        }))
        .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
        .map(({ name, r }) => `${name} ${r.width}x${r.height}`),
    );
    expect(small).toEqual([]);
    // Names are unique, so a screen reader can tell the rows apart (B19).
    const names = await dialog
      .getByRole("button", { name: /^Add / })
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(names.length);
    // The sheet is styled even though SessionSetup never loaded: its root is the wl-uf08 scope.
    await expect(page.locator('.wl-uf08[data-wl-state="plan"]')).toHaveCount(1);
  });
});

test.describe("T-0950 AC9 B18 an added item counts as history", () => {
  test("3 lateral-raise sets logged on the added item raise shoulders' load by 3 on UF-10.1", async ({
    page,
  }) => {
    await mockAll(page);
    const id = randomUUID();
    // The last set of the only item: the add is appended after it.
    await seedPaused(page, {
      id,
      plan: planOf([legExt()]),
      budgetMin: 45,
      elapsedS: 100,
      resumePhase: "set",
      itemIndex: 0,
      setIndex: 1,
      logged: [{ itemIndex: 0, setIndex: 0, exerciseId: "leg-extension" }],
    });
    const shoulders = page.locator('[data-part="row"][data-area="shoulders"] [data-part="value"]');
    const load = async () => Number(((await shoulders.textContent()) ?? "").trim().split(/\s/)[0]);
    await page.goto("/balance");
    await expect(shoulders).toBeVisible();
    await expect.poll(load).toBe(0);

    await openSession(page, id);
    const dialog = await openSheet(page);
    await addLateral(dialog);
    await expect(addedLine(page)).toHaveText("Lateral raise added after Leg extension.");
    await page.getByRole("button", { name: "Resume" }).click();

    await logSet(page);
    await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip rest" }).click();
    const next = page.locator('[data-screen-id="UF-09.6"]');
    await expect(next).toBeVisible({ timeout: 10_000 });
    await expect(next.getByRole("heading", { level: 1 })).toHaveText("Lateral raise");
    await page.getByRole("button", { name: "I'm ready" }).click();
    for (let n = 0; n < 3; n++) {
      await expect(page.locator('[data-screen-id="UF-09.3"]')).toBeVisible();
      await logSet(page);
      if (n < 2) {
        await expect(page.locator('[data-screen-id="UF-09.5"]')).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: "Skip rest" }).click();
      }
    }
    await expect(page.locator('[data-screen-id="UF-03.3"]')).toBeVisible({ timeout: 15_000 });

    await page.goto("/balance");
    await expect(shoulders).toBeVisible();
    await expect.poll(load).toBe(3);
  });
});
