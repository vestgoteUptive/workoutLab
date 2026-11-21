// T-0957 UF-04.2, UF-09.3, UF-09.4, UF-08.2, UF-01 e2e: RIR holds the weight and the user's own
// weight step reaches the pre-fill and the stepper (D-0250, D-0251, D-0259, D-0265;
// docs/specs/rir-progression-and-increments.md). Supabase is mocked through `page.route`; the
// history is seeded as `session_sets_live` rows relative to now, the workout is built with
// "Start empty" + Add exercise so the exercise under test is certain to be in it, and the
// pre-fill is read where the user reads it: UF-09.3 (and the stepper on UF-09.4).
// `exercise_settings` is a stateful mock so a UF-04.2 write is read back on the next refresh.
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
  mockSupabaseEmptyReads,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exercisesLoaded, profile } from "./fixtures/uf-04-library-data.js";

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
// Every loaded exercise has the library step 2.5 kg (the fixture leaves it null).
const LIBRARY = exercisesLoaded.map((e) => (e.external_load ? { ...e, increment_kg: 2.5 } : e));

const HOLD_COPY =
  "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up.";

// ---- History: one session of `reps.length` sets at one weight, `daysAgo` local days back ----

let seq = 0;
function session(
  exerciseId: string,
  daysAgo: number,
  weightKg: number,
  reps: number[],
  rirs: (number | null)[],
): unknown[] {
  // Local noon of the calendar day, so a DST shift or the time of day never moves it across a day.
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  return reps.map((r, i) => {
    const at = new Date(day.getTime() + i * 60_000).toISOString();
    return {
      client_id: `t0957-${seq++}`,
      session_id: `T0957-S-${exerciseId}-${daysAgo}`,
      exercise_id: exerciseId,
      is_warmup: false,
      completed_at: at,
      edited_at: at,
      deleted_at: null,
      reps: r,
      weight_kg: weightKg,
      duration_s: null,
      rir: rirs[i] ?? null,
    };
  });
}

// ---- Mocks ----

type Write = { method: string; url: string; body: unknown };
interface Settings {
  rows: { exercise_id: string; increment_kg: number }[];
  writes: Write[];
}

async function seed(page: Page, sets: unknown[], rows: Settings["rows"] = []): Promise<Settings> {
  const settings: Settings = { rows: [...rows], writes: [] };
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets,
    exercises: LIBRARY,
    exerciseAreas,
    exerciseVariants: [],
    areaTargets: AREA_TARGETS,
    profile: profileRow,
  });
  await mockProfilePresent(page, profileRow);
  // Registered after mockSupabaseData: the later route wins.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/exercise_settings*`, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill({ status: 200, json: settings.rows });
    const raw = request.postData();
    settings.writes.push({
      method,
      url: request.url(),
      body: raw === null ? null : JSON.parse(raw),
    });
    if (method === "DELETE") {
      const id = /exercise_id=eq\.([^&]+)/.exec(request.url())?.[1];
      settings.rows = settings.rows.filter((r) => r.exercise_id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    const body = JSON.parse(raw ?? "{}") as Settings["rows"][number] | Settings["rows"];
    for (const row of Array.isArray(body) ? body : [body]) {
      settings.rows = [...settings.rows.filter((r) => r.exercise_id !== row.exercise_id), row];
    }
    return route.fulfill({ status: 201, json: [] });
  });
  return settings;
}

// ---- Flow ----

const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);
const load = (page: Page) => page.locator(".wl-uf09__load");
const holdLine = (page: Page) => page.locator('[data-field="hold-effort"]');

async function openSetup(page: Page): Promise<void> {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(screen(page, "UF-08.1")).toBeVisible();
}

/** UF-08.1 → Start empty → Add exercise → search `query` → "Start with" (the Main lift, 6-8 reps
 *  for bench press) or "Add" → Looks good → Start → skip the warm-up: lands on UF-09.3 of that
 *  exercise. */
async function startWith(page: Page, query: string, name: string, main = false): Promise<void> {
  await page.getByRole("button", { name: "30 minutes" }).click();
  await page.getByRole("button", { name: "Start empty" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).click();
  const sheet = screen(page, "UF-08.5");
  await sheet.getByLabel("Search exercises").fill(query);
  if (main) await sheet.getByRole("button", { name: `Start with ${name}` }).click();
  else await sheet.getByRole("button", { name: new RegExp(`^Add ${name}`) }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(screen(page, "UF-08.4")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Skip warm-up" }).click();
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const BENCH = (daysAgo: number, rirs: (number | null)[], reps = [8, 8, 8], weight = 80) =>
  session("bench-press", daysAgo, weight, reps, rirs);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

// ---- AC1, AC2, AC3: RIR gates the increase (D-0250, D-0259 §1) ----

test.describe("RIR gates the weight increase", () => {
  test("AC1: 80 x 8, 8, 8 at RIR 2, 2, 0 pre-fills 80 x 8 with the Same weight again reason", async ({
    page,
  }) => {
    await seed(page, BENCH(4, [2, 2, 0]));
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("80 kg");
    await expect(load(page)).toContainText("× 8");
    await expect(holdLine(page)).toHaveText(HOLD_COPY);
  });

  test("AC2: the first session at RIR 1 on the top reps holds at 80 x 8 (held once)", async ({
    page,
  }) => {
    // One session at RIR 1: held.
    await seed(page, BENCH(4, [1, 1, 1]));
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("80 kg");
    await expect(holdLine(page)).toHaveText(HOLD_COPY);
  });

  test("AC2: a second session at the same 80 x 8 and RIR 1 steps up: the next workout is 82.5 x 6, no reason line", async ({
    page,
  }) => {
    await seed(page, [...BENCH(8, [1, 1, 0]), ...BENCH(4, [1, 1, 1])]);
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("82.5 kg");
    await expect(load(page)).toContainText("× 6");
    await expect(holdLine(page)).toHaveCount(0);
  });

  test("AC3: every RIR empty pre-fills 82.5 x 6, as before RIR existed", async ({ page }) => {
    await seed(page, BENCH(4, [null, null, null]));
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("82.5 kg");
    await expect(load(page)).toContainText("× 6");
    await expect(holdLine(page)).toHaveCount(0);
  });
});

// ---- AC4: the user's own step reaches the pre-fill and the stepper (D-0251, D-0265 §6) ----

const CURL = (rirs: (number | null)[] = [3, 2, 2]) =>
  session("biceps-curl", 5, 20, [15, 15, 15], rirs);
const stepRow = (page: Page) => page.locator('[data-field="weight-step"]');

async function chooseStep(page: Page, chip: string | null): Promise<void> {
  await page.goto("/library/biceps-curl");
  await expect(screen(page, "UF-04.2")).toBeVisible();
  const row = stepRow(page);
  if (chip === null) {
    await row.getByRole("button", { name: /Use default/ }).click();
    await expect(row.getByRole("status")).toHaveText("Weight step back to the default, 2.5 kg.");
  } else {
    await row.getByRole("radio", { name: chip, exact: true }).click();
    await expect(row.getByRole("status")).toHaveText(`Weight step set to ${chip}.`);
  }
}

/** UF-09.3 → Done → UF-09.4 and the weight field. */
async function confirmWeight(page: Page): Promise<ReturnType<Page["getByLabel"]>> {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(screen(page, "UF-09.4")).toBeVisible();
  return page.getByLabel("Weight (kg)");
}

test.describe("the own weight step", () => {
  test("AC4: 1.25 kg gives W + 1.25 in the pre-fill and a + of 1.25; Use default returns both to 2.5", async ({
    page,
  }) => {
    const settings = await seed(page, CURL());
    await openSetup(page);
    await chooseStep(page, "1.25 kg");
    await expect
      .poll(() => settings.rows)
      .toEqual([expect.objectContaining({ exercise_id: "biceps-curl", increment_kg: 1.25 })]);

    await page.goto("/session/setup");
    await startWith(page, "biceps curl", "Biceps curl");
    await expect(load(page)).toContainText("21.25 kg");
    await expect(load(page)).toContainText("× 10");
    const weight = await confirmWeight(page);
    await expect(weight).toHaveValue("21.25");
    await page.getByRole("button", { name: "More weight" }).click();
    await expect(weight).toHaveValue("22.5");
    await page.getByRole("button", { name: "Less weight" }).click();
    await page.getByRole("button", { name: "Less weight" }).click();
    await expect(weight).toHaveValue("20");
  });

  test("AC4: Use default returns the pre-fill and the + to 2.5", async ({ page }) => {
    const settings = await seed(page, CURL(), [{ exercise_id: "biceps-curl", increment_kg: 1.25 }]);
    await openSetup(page);
    await chooseStep(page, null);
    await expect.poll(() => settings.rows).toEqual([]);
    await page.goto("/session/setup");
    await startWith(page, "biceps curl", "Biceps curl");
    await expect(load(page)).toContainText("22.5 kg");
    const weight = await confirmWeight(page);
    await expect(weight).toHaveValue("22.5");
    await page.getByRole("button", { name: "More weight" }).click();
    await expect(weight).toHaveValue("25");
  });

  test("AC4: an override already on the server (another device) is used by the first workout", async ({
    page,
  }) => {
    await seed(page, CURL(), [{ exercise_id: "biceps-curl", increment_kg: 1.25 }]);
    await openSetup(page);
    await startWith(page, "biceps curl", "Biceps curl");
    await expect(load(page)).toContainText("21.25 kg");
  });
});

// ---- AC6: zero history and a break ----

test.describe("edges", () => {
  test("AC6: zero history with an override gives the usual first-time value (no weight, 10 reps)", async ({
    page,
  }) => {
    await seed(page, [], [{ exercise_id: "biceps-curl", increment_kg: 1.25 }]);
    await openSetup(page);
    await startWith(page, "biceps curl", "Biceps curl");
    await expect(load(page)).toContainText("Set weight");
    await expect(load(page)).toContainText("10 reps");
    await expect(holdLine(page)).toHaveCount(0);
  });

  test("AC6: zero history for bench press asks for a weight and shows no hold reason", async ({
    page,
  }) => {
    await seed(page, []);
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("Set weight");
    await expect(holdLine(page)).toHaveCount(0);
  });

  test("AC6: 12 days off after an RIR 0 session holds the weight, lighter reps, RIR ignored", async ({
    page,
  }) => {
    await seed(page, BENCH(12, [0, 0, 0]));
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("80 kg");
    await expect(load(page)).toContainText("× 6");
    // hold_after_break, not hold_effort: no "close to failure" line.
    await expect(holdLine(page)).toHaveCount(0);
  });

  test("AC6: the same RIR 0 session 4 days ago holds at 80 x 8 with the reason (the break is what differs)", async ({
    page,
  }) => {
    await seed(page, BENCH(4, [0, 0, 0]));
    await openSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("× 8");
    await expect(holdLine(page)).toHaveText(HOLD_COPY);
  });
});

// ---- AC5: offline (D-0259 §13, §14, D-0265) ----

/** Waits for the service worker's precache to stop growing before the context goes offline, so the
 *  lazy UF-08/UF-09 chunks resolve from it (the uf-09-offline.spec.ts rule, T-0904). */
async function precacheSettled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  let previous = -1;
  await expect
    .poll(
      async () => {
        const counts = await page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
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
      },
      { message: "the workbox precache never finished populating before going offline" },
    )
    .toBe(true);
}

/** Waits until the refreshed history is in IndexedDB (`historyCache`), so a pre-fill computed
 *  offline reads it from the device, not from a request that can no longer be made. */
async function historyCached(page: Page, atLeast: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wl-offline");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const count = await new Promise<number>((resolve, reject) => {
          const req = db
            .transaction("historyCache", "readonly")
            .objectStore("historyCache")
            .count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return count;
      }),
    )
    .toBeGreaterThanOrEqual(atLeast);
}

interface SetWrite {
  exercise_id: string;
  reps: number | null;
  weight_kg: number | null;
  rir: number | null;
}

/** Records every `session_sets` write (answered 201), registered after `seed` so it wins. */
async function recordSetWrites(page: Page): Promise<SetWrite[]> {
  const writes: SetWrite[] = [];
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, async (route) => {
    const request = route.request();
    // `session_sets*` also matches `session_sets_live?...`: reads go to `seed`'s history route.
    if (request.method() === "GET") return route.fallback();
    const body = request.postDataJSON() as SetWrite | SetWrite[];
    writes.push(...(Array.isArray(body) ? body : [body]));
    return route.fulfill({ status: 201, json: [] });
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, async (route) =>
    route.request().method() === "GET"
      ? route.fallback()
      : route.fulfill({ status: 201, json: [] }),
  );
  return writes;
}

/** Reloads /session/setup (a hard navigation, served by the service worker while offline). */
async function reopenSetup(page: Page): Promise<void> {
  await page.goto("/session/setup");
  await expect(screen(page, "UF-08.1")).toBeVisible();
}

test.describe("offline", () => {
  test("AC5: a set logged offline at RIR 0 on the top reps holds the weight in the next workout, with no network; it syncs on reconnect", async ({
    page,
    context,
  }) => {
    await seed(page, BENCH(4, [2, 2, 2]));
    const setWrites = await recordSetWrites(page);
    await openSetup(page);
    await historyCached(page, 3);
    await precacheSettled(page);
    const gate = await goOffline(page, context);
    await reopenSetup(page);

    // First workout, offline: 82.5 x 6 (RIR 2 last time); log 8 reps at RIR None (0).
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("82.5 kg");
    await expect(load(page)).toContainText("× 6");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(screen(page, "UF-09.4")).toBeVisible();
    await page.getByRole("button", { name: "More reps" }).click();
    await page.getByRole("button", { name: "More reps" }).click();
    await expect(page.locator('[data-field="reps"]')).toHaveText("8");
    await page.getByText("None", { exact: true }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(screen(page, "UF-09.5")).toBeVisible();

    // End the workout (Pause, End workout), then start the next one, still offline.
    await page.getByRole("button", { name: "Pause workout" }).click();
    await page.getByRole("button", { name: "End workout" }).click();
    await page.getByRole("button", { name: "End workout" }).last().click();
    await reopenSetup(page);
    await startWith(page, "bench", "Bench press", true);
    await expect(load(page)).toContainText("82.5 kg");
    await expect(load(page)).toContainText("× 8");
    await expect(holdLine(page)).toHaveText(HOLD_COPY);
    expect(setWrites).toEqual([]);
    expect(gate.writesFulfilledOffline()).toBe(0);

    await gate.goOnline();
    await expect
      .poll(() => setWrites.map((w) => [w.exercise_id, w.reps, w.weight_kg, w.rir]))
      .toEqual([["bench-press", 8, 82.5, 0]]);
  });

  test("AC5: a step set offline applies at once to the next pre-fill and reaches the server after reconnect", async ({
    page,
    context,
  }) => {
    const settings = await seed(page, CURL());
    await recordSetWrites(page);
    await openSetup(page);
    await page.goto("/library/biceps-curl");
    await expect(stepRow(page)).toBeVisible();
    await historyCached(page, 3);
    await precacheSettled(page);
    const gate = await goOffline(page, context);

    await stepRow(page).getByRole("radio", { name: "1.25 kg", exact: true }).click();
    await expect(stepRow(page).getByRole("status")).toHaveText("Weight step set to 1.25 kg.");
    await expect(stepRow(page)).not.toContainText("Connect to change");
    await reopenSetup(page);
    await startWith(page, "biceps curl", "Biceps curl");
    await expect(load(page)).toContainText("21.25 kg");
    expect(settings.writes).toEqual([]);

    await gate.goOnline();
    await expect
      .poll(() => settings.rows)
      .toEqual([expect.objectContaining({ exercise_id: "biceps-curl", increment_kg: 1.25 })]);
  });
});

// ---- AC7: onboarding is unchanged (principle 5, UF-01) ----

test.describe("onboarding", () => {
  test("AC7: first screen to first plan is 3 activations, under 60 s, with no weight-step request or control", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await mockSupabaseRest(page);
    await mockSupabaseAuth(page);
    await mockSupabaseEmptyReads(page);
    const requested: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(VITE_SUPABASE_URL)) requested.push(r.url());
    });

    const t0 = Date.now();
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(screen(page, "UF-01.2")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(screen(page, "UF-01.3")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(screen(page, "UF-01.4")).toBeVisible();
    await expect(screen(page, "UF-01.4").locator("[data-area]")).toHaveCount(9);
    expect(Date.now() - t0).toBeLessThan(60_000);

    await expect(page.getByText(/weight step|reps in reserve|RIR/i)).toHaveCount(0);
    expect(requested.filter((u) => /exercise_settings/.test(u))).toEqual([]);
  });
});

// ---- AC8: UF-04.2 row (T-0956): axe, target size, hidden for timed and bodyweight ----

test.describe("UF-04.2 Weight step row", () => {
  test("AC8: axe reports no violations with the row; chips and the Other field are at least 44 px; the value is in words", async ({
    page,
  }) => {
    await seed(page, [], [{ exercise_id: "biceps-curl", increment_kg: 1.25 }]);
    await openSetup(page);
    await page.goto("/library/biceps-curl");
    const row = stepRow(page);
    await expect(row).toBeVisible();
    await expect(row.locator("[data-field=weight-step-value]")).toContainText(
      "Weight step: 1.25 kg (yours)",
    );
    const chips = await row.getByRole("radio").all();
    expect(chips).toHaveLength(4);
    for (const chip of chips) {
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await row.getByRole("radio", { name: "Other", exact: true }).click();
    const field = row.getByLabel("Step in kg");
    await expect(field).toBeVisible();
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const button of await row.getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const axe = await new AxeBuilder({ page }).include('[data-screen-id="UF-04.2"]').analyze();
    expect(axe.violations).toEqual([]);
  });

  test("AC8: a timed exercise (plank) and a bodyweight one (push-up) have no row", async ({
    page,
  }) => {
    await seed(page, []);
    await openSetup(page);
    await page.goto("/library/plank");
    await expect(page.getByRole("heading", { level: 1, name: "Plank" })).toBeVisible();
    await expect(stepRow(page)).toHaveCount(0);
    await page.goto("/library/push-up");
    await expect(page.getByRole("heading", { level: 1, name: "Push-up" })).toBeVisible();
    await expect(stepRow(page)).toHaveCount(0);
    await page.goto("/library/bench-press");
    await expect(stepRow(page)).toBeVisible();
  });
});
