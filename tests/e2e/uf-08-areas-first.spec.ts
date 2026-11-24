// T-0999 UF-08.1, UF-08.2, UF-08.6, UF-09.1 e2e: areas-first planning (docs/specs/areas-first-planning.md,
// D-0274 to D-0276, D-0280, D-0286 to D-0289, D-0063). The built PWA proves the owner's tap budget
// ("no more than 2 edits from Plan to Start"), the edits, "Start empty", the area detail, the three
// states (zero history, 10 days off, 15 minutes) and the offline path. What uf-08-area-plan.spec.ts
// and uf-08-area-detail.spec.ts already prove (Focus mode disclosure, a time chip rebuild, the
// layout at 390 / 320 / 160 px) is not repeated; AC8 here adds the checks on the screens as the
// areas-first path reaches them (default plan, after edits, Start empty, UF-08.6 after an Add).
// Same seed as uf-08-area-plan.spec.ts: the L1+ library, FULL equipment, the nine F-targets.
// Supabase is mocked through `page.route`; every test runs under the Supabase and console guards.
import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test, VITE_SUPABASE_URL } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockProfilePresent,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { addArea, startEmpty } from "./fixtures/uf-08-start.js";
import { exerciseAreas, exercises, profile } from "./fixtures/uf-04-library-data.js";
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
const TYPE_OF = new Map(exercises.map((e) => [e.id as string, e.type as string]));
const NAME_OF = new Map(exercises.map((e) => [e.id as string, e.name as string]));

const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);
const rows = (page: Page) => page.locator('[data-part="area-row"]');
const row = (page: Page, area: string) =>
  page.locator(`[data-part="area-row"][data-area="${area}"]`);
const status = (page: Page) => page.locator('[data-part="status"]');
const startWorkout = (page: Page) => page.getByRole("button", { name: "Start workout" });
const SESSION_URL = /\/session\/[0-9a-f-]{36}$/;
const cap = (area: string) => area[0]!.toUpperCase() + area.slice(1);

// ---- history ----
let seq = 0;
function histSet(exerciseId: string, daysAgo: number, minute: number) {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - daysAgo);
  const at = new Date(day.getTime() + minute * 60_000).toISOString();
  return {
    client_id: `t0999-${seq++}`,
    session_id: `T0999-S-${daysAgo}`,
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps: 8,
    weight_kg: 40,
    duration_s: null,
  };
}
const threeSets = (exerciseId: string, daysAgo: number) =>
  [0, 2, 4].map((m) => histSet(exerciseId, daysAgo, m));

// ---- seed and entry ----
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

/** Signed in at UF-08.1 online (the library and targets are cached there), then, offline mode, the
 *  network goes off and every Supabase request from here on is counted. */
async function enter(
  page: Page,
  context: BrowserContext,
  mode: "online" | "offline",
  opts: { sets?: unknown[]; width?: number } = {},
): Promise<{ supabaseRequests: () => string[] }> {
  await page.setViewportSize({ width: opts.width ?? 390, height: 844 });
  await seed(page, opts.sets ?? []);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/session/setup");
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^Fits/);
  const seen: string[] = [];
  if (mode === "offline") {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const key = (await caches.keys()).find((k) => k.startsWith("workbox-precache"));
          if (key === undefined) return false;
          return (await (await caches.open(key)).keys()).some(
            (r) => new URL(r.url).pathname === "/index.html",
          );
        }),
      )
      .toBe(true);
    await goOffline(page, context);
    page.on("request", (r) => {
      if (r.url().startsWith(VITE_SUPABASE_URL)) seen.push(`${r.method()} ${r.url()}`);
    });
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start workout" })).toBeVisible();
  return { supabaseRequests: () => seen };
}

/** A tap is one click the user makes; the counter is what AC1 asserts on. */
class Taps {
  n = 0;
  async tap(target: Locator, opts: { force?: boolean } = {}): Promise<void> {
    this.n += 1;
    await target.click(opts);
  }
}

/** Offline, the top bar of a UF-08 screen shows the offline icon (D-0063). Online, it is not there. */
async function expectConnectivityIcon(page: Page): Promise<void> {
  const offline = await page.evaluate(() => !navigator.onLine);
  await expect(page.getByLabel("Offline")).toHaveCount(offline ? 1 : 0, { timeout: 3000 });
}

/** UF-08.1 → "Suggest my workout" → UF-08.2 (budget in minutes, through the URL like Quick 20-min). */
async function toPlan(page: Page, budget: number, empty = false): Promise<void> {
  await page.goto(`/session/setup?budget=${budget}`);
  await expect(page.locator('[data-part="fit-line"]')).toHaveText(/^(Fits|Nothing)/);
  await page.getByRole("button", { name: empty ? "Start empty" : "Suggest my workout" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
  await expectConnectivityIcon(page);
}

const setsOf = async (page: Page): Promise<Record<string, number>> =>
  Object.fromEntries(
    await rows(page).evaluateAll((els) =>
      els.map((el) => [
        el.getAttribute("data-area")!,
        Number(/\d+/.exec(el.querySelector('[data-part="sets-value"]')!.textContent!)![0]),
      ]),
    ),
  );

const minus = (page: Page, area: string) =>
  page.getByRole("button", { name: `One set less for ${cap(area)}` });
const plus = (page: Page, area: string) =>
  page.getByRole("button", { name: `One set more for ${cap(area)}` });

interface StoredPlan {
  mainLiftId: string | null;
  items: { exerciseId: string; isMain: boolean; sets: number }[];
}
/** The plan the started session stored on the device (what UF-09 runs). */
async function storedPlan(page: Page): Promise<StoredPlan> {
  const id = /\/session\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
  return page.evaluate(async (key: string) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const entry = await new Promise<{ row: { plan: unknown } } | undefined>((resolve, reject) => {
      const get = db.transaction("sessions", "readonly").objectStore("sessions").get(key);
      get.onsuccess = () => resolve(get.result as never);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return entry!.row.plan as never;
  }, id);
}

async function startAndOpen(page: Page, taps?: Taps): Promise<void> {
  if (taps) await taps.tap(startWorkout(page));
  else await startWorkout(page).click();
  await expect(page).toHaveURL(SESSION_URL);
  await expect(screen(page, "UF-09.1")).toBeVisible();
}

const MODES = ["online", "offline"] as const;

// ---- AC1, AC2, AC3, AC4, AC5, AC7: the path, online and offline ----
for (const mode of MODES) {
  test.describe(`T-0999 areas-first path, ${mode}`, () => {
    test(`AC1 ${mode}: 3 taps from Today with no edit, 1 from the plan, 3 with two edits, 4 with three`, async ({
      page,
      context,
    }) => {
      const net = await enter(page, context, mode);

      // From UF-02.1: Start workout, Suggest my workout, Start workout. The default minutes are
      // taken as shown (no tap on a chip), so the budget is asked (principle 2) but costs no tap.
      let t = new Taps();
      await t.tap(page.getByRole("link", { name: "Start workout" }));
      await expect(screen(page, "UF-08.1")).toBeVisible();
      await expect(page.locator('[data-part="minutes"]')).toBeVisible();
      await t.tap(page.getByRole("button", { name: "Suggest my workout" }));
      await expect(screen(page, "UF-08.2")).toBeVisible();
      await expectConnectivityIcon(page);
      const shown = Date.now();
      await startAndOpen(page, t);
      const fromToday = t.n;
      const fromPlanS = (Date.now() - shown) / 1000;
      expect(fromToday).toBe(3);
      expect(fromPlanS).toBeLessThan(20);
      test.info().annotations.push({
        type: "measured",
        description: `Today to Start: ${fromToday} taps; plan to UF-09.1 with no edit: ${fromPlanS} s`,
      });

      // From UF-08.2: no edit.
      await toPlan(page, 45);
      t = new Taps();
      await startAndOpen(page, t);
      expect(t.n).toBe(1);

      // Two edits: one − and one + (Chest −, Hamstrings +), then Start workout.
      await toPlan(page, 45);
      const before = await setsOf(page);
      expect(before).toMatchObject({ chest: 4, hamstrings: 2 });
      t = new Taps();
      const began = Date.now();
      await t.tap(minus(page, "chest"));
      await t.tap(plus(page, "hamstrings"));
      expect(await setsOf(page)).toEqual({ ...before, chest: 3, hamstrings: 3 });
      await startAndOpen(page, t);
      expect(t.n).toBe(3);
      const twoEditsS = (Date.now() - began) / 1000;
      expect(twoEditsS).toBeLessThan(20);
      test.info().annotations.push({
        type: "measured",
        description: `two edits and Start: 3 taps, ${twoEditsS} s`,
      });

      // Three edits cost four taps: the budget is documented, not hidden.
      await toPlan(page, 45);
      t = new Taps();
      await t.tap(minus(page, "chest"));
      await t.tap(plus(page, "hamstrings"));
      await t.tap(minus(page, "glutes"));
      await startAndOpen(page, t);
      expect(t.n).toBe(4);

      if (mode === "offline") expect(net.supabaseRequests()).toEqual([]);
    });

    test(`AC2 ${mode}: Chest −, Back +, Start workout opens UF-09.1 with the main lift first, in orderItems order`, async ({
      page,
      context,
    }) => {
      const net = await enter(page, context, mode);
      // 65 min: at the default 45 the minute a Chest − frees is not enough for a Back + (refused
      // for time, see AC6), so the path needs the room a longer budget gives.
      await toPlan(page, 65);
      const before = await setsOf(page);
      expect(before).toMatchObject({ chest: 4, back: 5 });
      await minus(page, "chest").click();
      await plus(page, "back").click();
      const after = await setsOf(page);
      expect(after).toEqual({ ...before, chest: 3, back: 6 });
      await expect(status(page)).toHaveText("Back: 6 sets, 0 min left.");
      await startAndOpen(page);

      const plan = await storedPlan(page);
      const sum = (ids: string[]) =>
        plan.items.filter((i) => ids.includes(i.exerciseId)).reduce((n, i) => n + i.sets, 0);
      expect(sum(["bench-press", "db-bench-press", "push-up"])).toBe(3);
      expect(
        sum([
          "barbell-row",
          "db-row",
          "inverted-row",
          "lat-pulldown",
          "seated-cable-row",
          "straight-arm-pulldown",
          "pull-up",
        ]),
      ).toBe(6);
      // Rule 7.6: the main lift first, then the other compounds, then the isolations.
      expect(plan.mainLiftId).not.toBeNull();
      expect(plan.items[0]!.exerciseId).toBe(plan.mainLiftId);
      expect(plan.items[0]!.isMain).toBe(true);
      expect(plan.items.filter((i) => i.isMain)).toHaveLength(1);
      const tier = (i: { exerciseId: string; isMain: boolean }) =>
        i.isMain ? 0 : TYPE_OF.get(i.exerciseId) === "compound" ? 1 : 2;
      const tiers = plan.items.map(tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      expect(tiers.at(-1)).toBe(2);
      // UF-09 runs that order: skip the warm-up and the first set is the main lift.
      await page.getByRole("button", { name: "Skip warm-up" }).click();
      await expect(screen(page, "UF-09.3")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        NAME_OF.get(plan.mainLiftId!)!,
      );
      if (mode === "offline") expect(net.supabaseRequests()).toEqual([]);
    });

    test(`AC3 ${mode}: Remove an area, "Skipping today" follows, Add an area brings it back with its default`, async ({
      page,
      context,
    }) => {
      const net = await enter(page, context, mode);
      await toPlan(page, 45);
      const before = await setsOf(page);
      expect(before).toMatchObject({ glutes: 3 });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Glutes");

      // Glutes: − to the 2-set minimum, where the minus reads Remove, then Remove.
      await minus(page, "glutes").click();
      const remove = page.getByRole("button", { name: "Remove Glutes" });
      await expect(remove).toHaveText("Remove");
      await remove.click();
      await expect(row(page, "glutes")).toHaveCount(0);
      await expect(status(page)).toHaveText("Glutes removed. Add it back below.");
      await expect(page.locator('[data-part="skipping"]')).toContainText("Glutes");
      await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Glutes");

      // Add an area: it returns with the engine's default (3 sets) and the line goes.
      await addArea(page, "glutes");
      expect(await setsOf(page)).toMatchObject({ ...before, glutes: 3 });
      await expect(status(page)).toHaveText(/^Glutes added\. \d+ min left\.$/);
      await expect(page.locator('[data-part="skipping"]')).toHaveCount(0);
      if (mode === "offline") expect(net.supabaseRequests()).toEqual([]);
    });

    test(`AC4 ${mode}: Start empty has no rows and no Start; one Add area enables it and the workout starts`, async ({
      page,
      context,
    }) => {
      const net = await enter(page, context, mode);
      await page.goto("/session/setup");
      await expect(screen(page, "UF-08.1")).toBeVisible();
      await startEmpty(page, 45);
      await expectConnectivityIcon(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today: pick your areas");
      await expect(rows(page)).toHaveCount(0);
      await expect(startWorkout(page)).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator('[data-part="need-area"]')).toHaveText("Add at least one area.");
      // A tap on a disabled Start workout does nothing.
      await startWorkout(page).click({ force: true });
      await expect(screen(page, "UF-08.2")).toBeVisible();
      await expect(page).not.toHaveURL(SESSION_URL);

      await addArea(page, "back");
      await expect(rows(page)).toHaveCount(1);
      await expect(startWorkout(page)).not.toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today: Back");
      await startAndOpen(page);
      const plan = await storedPlan(page);
      expect(plan.items.length).toBeGreaterThan(0);
      if (mode === "offline") expect(net.supabaseRequests()).toEqual([]);
    });

    test(`AC5 ${mode}: in an area, Not today, Undo, Swap and a local Add leave the other areas' sets alone`, async ({
      page,
      context,
    }) => {
      const net = await enter(page, context, mode);
      // 60 min: Shoulders is taken out first (Remove, two taps) so the Add has room; the plan is 6
      // exercises, short of the 8 a workout can hold. The "before" is read after that setup.
      await toPlan(page, 60);
      await minus(page, "shoulders").click();
      await page.getByRole("button", { name: "Remove Shoulders" }).click();
      await expect(row(page, "shoulders")).toHaveCount(0);
      const before = await setsOf(page);
      expect(before).toMatchObject({ hamstrings: 3 });
      const others = (m: Record<string, number>) =>
        Object.fromEntries(Object.entries(m).filter(([a]) => a !== "hamstrings"));

      await row(page, "hamstrings").locator('[data-part="area-open"]').click();
      const detail = screen(page, "UF-08.6");
      await expect(detail).toBeVisible();
      const names = () =>
        detail.locator('[data-part="detail-row"] [data-part="row-name"] > span').allTextContents();
      const [first] = await names();
      expect(first).toBe("Romanian deadlift");

      // Not today: replaced by the engine's alternative, then Undo brings the first back.
      await detail.getByRole("button", { name: `Not today, ${first}` }).click();
      await expect(detail.locator('[data-part="not-today-line"]')).toContainText(first!);
      const [alternative] = await names();
      expect(alternative).not.toBe(first);
      await detail.getByRole("button", { name: `Undo Not today, ${first}` }).click();
      expect(await names()).toEqual([first]);

      // Swap: UF-08.3 offers a replacement; take the first one.
      await detail.getByRole("button", { name: `Swap ${first}` }).click();
      const sheet = page.getByRole("dialog");
      await sheet
        .getByRole("radiogroup", { name: "Replacement" })
        .getByRole("radio")
        .first()
        .check();
      await sheet.getByRole("button", { name: /^Use / }).click();
      await expect(detail).toBeVisible();
      const [swapped] = await names();
      expect(swapped).not.toBe(first);

      // A local Add: another hamstrings exercise joins at its own sets; nothing else is re-suggested.
      const wanted = ["Leg curl", "Romanian deadlift"].find((n) => n !== swapped)!;
      await detail.getByRole("button", { name: "Add exercise" }).click();
      const add = screen(page, "UF-08.5");
      await add.getByLabel("Search exercises").fill(wanted.toLowerCase());
      await add
        .getByRole("button", { name: new RegExp(`^Add ${wanted}`) })
        .first()
        .click();
      await expect(add).toHaveCount(0);
      expect(await names()).toEqual(expect.arrayContaining([swapped, wanted]));
      await expect(detail.locator('[data-part="detail-row"]')).toHaveCount(2);

      await page.getByRole("link", { name: "Back" }).click();
      await expect(screen(page, "UF-08.2")).toBeVisible();
      const after = await setsOf(page);
      expect(others(after)).toEqual(others(before));
      expect(after.hamstrings).toBeGreaterThan(before.hamstrings!);
      await startAndOpen(page);
      if (mode === "offline") expect(net.supabaseRequests()).toEqual([]);
    });
  });
}

// ---- AC6: the states ----
test.describe("T-0999 AC6 states", () => {
  test("zero history: every row reads 0 of its target, no attention styling", async ({
    page,
    context,
  }) => {
    await enter(page, context, "online");
    await toPlan(page, 45);
    const list = await rows(page).evaluateAll((els) =>
      els.map((el) => [
        el.getAttribute("data-area")!,
        el.querySelector('[data-part="area-history"]')!.textContent!,
      ]),
    );
    expect(list.length).toBeGreaterThan(2);
    for (const [area, text] of list) {
      expect(text, area).toBe(`Last 14 days: 0 of ${F_TARGETS[area!]} sets`);
    }
    await expect(page.locator("[data-attention]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Today: \S+( · \S+)+$/);
  });

  test("10 days off: the rows show the 14-day load and the why chips name the areas furthest below target", async ({
    page,
    context,
  }) => {
    // Chest and back trained 17 and 10 days ago, nothing since: the 14-day window holds only the
    // 10-day-old work, so those two read 3 of their target and every other area reads 0.
    const sets = [
      ...threeSets("bench-press", 17),
      ...threeSets("inverted-row", 17),
      ...threeSets("bench-press", 10),
      ...threeSets("inverted-row", 10),
    ];
    await enter(page, context, "online", { sets });
    await toPlan(page, 45);
    const history = await rows(page).evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [
          el.getAttribute("data-area")!,
          el.querySelector('[data-part="area-history"]')!.textContent!,
        ]),
      ),
    );
    expect(Object.keys(history).length).toBeGreaterThan(2);
    // The 10-day-old work counts (14-day window): Back reads 3, Shoulders 1.5 (bench press gives
    // them half a set each), the untrained areas read 0. Nothing about the break is added here.
    expect(history).toMatchObject({
      back: "Last 14 days: 3 of 20 sets",
      shoulders: "Last 14 days: 1.5 of 16 sets",
      glutes: "Last 14 days: 0 of 20 sets",
      calves: "Last 14 days: 0 of 12 sets",
    });
    // The why chips name the areas furthest below target, never the chest that was just worked.
    const chips = await page.locator('[data-part="session-chips"] li').allTextContents();
    expect(chips).toEqual(["Glutes", "Calves", "Shoulders"]);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Chest");
    // Chest is in "Add an area" with the work it did 10 days ago.
    await page.locator('[data-part="add-area-summary"]').click();
    await expect(
      page.locator('[data-part="candidate"][data-area="chest"] [data-part="candidate-history"]'),
    ).toHaveText("Last 14 days: 3 of 20 sets");
    await expect(status(page)).not.toContainText(/days off|break/i);
  });

  test("15 minutes: one area, + refused for time in words, Add an area reads No time left", async ({
    page,
    context,
  }) => {
    await enter(page, context, "online");
    await toPlan(page, 15);
    await expect(page.locator('[data-part="budget-text"]')).toHaveText("About 15 of 15 min");
    expect(Object.keys(await setsOf(page))).toEqual(["chest"]);
    const sets = await setsOf(page);

    // + stays focusable, is aria-disabled, says why, and changes nothing.
    const more = plus(page, "chest");
    await expect(more).toHaveAttribute("aria-disabled", "true");
    await more.click({ force: true });
    await expect(row(page, "chest").locator('[data-part="refusal"]')).toHaveText(
      "No time for another set. Pick more time or remove a set elsewhere.",
    );
    expect(await setsOf(page)).toEqual(sets);
    await expect(page.locator('[data-part="budget-text"]')).toHaveText("About 15 of 15 min");

    // Add an area: every row is refused with No time left.
    await page.locator('[data-part="add-area-summary"]').click();
    const candidates = page.locator('[data-part="candidate"]');
    expect(await candidates.count()).toBe(8);
    for (const c of await candidates.all()) {
      await expect(c.locator('[data-part="candidate-reason"]')).toHaveText("No time left");
      await expect(c.locator('[data-part="candidate-add"]')).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    await expect(page.getByRole("button", { name: "Fill the rest for me" })).toHaveCount(0);
    // One − frees the time, and the + then works: refused for time, not for a cap.
    await minus(page, "chest").click();
    await plus(page, "chest").click();
    expect((await setsOf(page)).chest).toBe(4);
    await startAndOpen(page);
  });
});

// ---- AC8: a11y ----
async function expectNoSeriousViolations(page: Page): Promise<void> {
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
}
const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
async function expectTargets(page: Page, scope: string): Promise<void> {
  const controls = page.locator(
    `${scope} button:visible, ${scope} a[href]:visible, ${scope} summary:visible`,
  );
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await settledBox(controls.nth(i));
    const label = await controls
      .nth(i)
      .evaluate((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(box, `${label} has a box`).not.toBeNull();
    expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44 - 0.5);
    expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44 - 0.5);
  }
}

for (const width of [390, 320]) {
  test(`AC8 at ${width} px: axe, 44 px targets and no sideways scroll on UF-08.2 (plan, edited, Start empty) and UF-08.6`, async ({
    page,
    context,
  }) => {
    await enter(page, context, "online", { width });
    const check = async (id: string): Promise<void> => {
      await expectNoSeriousViolations(page);
      expect(await noSideways(page), `${id} sideways`).toBe(true);
      await expectTargets(page, `[data-screen-id="${id}"]`);
    };
    await toPlan(page, 60);
    await check("UF-08.2");
    // After edits (a Remove row, the Add an area list open, a refusal showing).
    await minus(page, "chest").click();
    await plus(page, "chest").click({ force: true });
    await page.locator('[data-part="add-area-summary"]').click();
    await check("UF-08.2");
    // UF-08.6 and the Add exercise sheet over it.
    await row(page, "chest").locator('[data-part="area-open"]').click();
    await expect(screen(page, "UF-08.6")).toBeVisible();
    await check("UF-08.6");
    await page.getByRole("button", { name: "Add exercise" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoSeriousViolations(page);
    expect(await noSideways(page)).toBe(true);
    await page.keyboard.press("Escape");
    // Start empty, with its Add an area list open.
    await page.goto("/session/setup");
    await startEmpty(page, 30);
    await check("UF-08.2");
  });
}

// ---- AC9: principle 2 on every path ----
test.describe("T-0999 AC9 the minutes are asked before the plan", () => {
  test("Start workout, Quick 20-min and a direct visit all show the minutes control on UF-08.1 before UF-08.2", async ({
    page,
    context,
  }) => {
    await enter(page, context, "online");
    const onSetup = async (): Promise<void> => {
      await expect(screen(page, "UF-08.1")).toBeVisible();
      await expect(screen(page, "UF-08.2")).toHaveCount(0);
      await expect(page.locator('[data-part="minutes"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "5 minutes less" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Quick picks" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Start empty" })).toBeVisible();
    };
    await page.getByRole("link", { name: "Start workout" }).click();
    await onSetup();
    await expect(page.locator('[data-part="minutes"]')).toHaveText("45");

    await page.goto("/");
    await page.getByRole("link", { name: /Quick 20-min/ }).click();
    await onSetup();
    await expect(page.locator('[data-part="minutes"]')).toHaveText("20");

    await page.goto("/session/setup");
    await onSetup();
    // Start empty: UF-08.1 first as well; UF-08.2 only after the tap.
    await page.getByRole("button", { name: "Start empty" }).click();
    await expect(screen(page, "UF-08.2")).toBeVisible();
  });
});
