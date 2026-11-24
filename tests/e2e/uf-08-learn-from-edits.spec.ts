// T-1006 UF-08.2, UF-08.6, UF-09.9, UF-11.4, UF-11.5, UF-11.6 e2e: learning from edits (D-0277,
// D-0279, D-0281; docs/specs/learn-from-edits.md). The built PWA proves what no unit test can: the
// counts across visits and a workout, the one-time prompt, two devices on one account, the
// offline card, and that export and delete cover the new table.
//
// What the stack fakes: Supabase is mocked through `page.route`. `fixtures/learn-from-edits.ts` is
// a stateful fake of `edit_signals` (unique key user,device,key; stale-write rule), the profile
// flag and epoch, favorites, excluded exercises and the account delete, shared by every page of a
// test, so "two devices" are two browser contexts on one fake account. Real signals are made
// through the UI (UF-08.6 swap and Remove, UF-09.9 swap); where a test only needs a pending card,
// another device's rows are seeded into the fake and arrive through the real pull.
//
// Not repeated here: the UF-11.4 toggle/Forget wiring, its offline state and its axe and 44 px
// checks are `uf-11-learning.spec.ts` (T-1005); the export's 11 tables with no signals is
// `uf-11-account.spec.ts` (T-1002). Same seed as uf-08-swap-pins.spec.ts: at 30 minutes the Back
// exercise is Inverted row and UF-08.3 offers Dumbbell row for it.
import AxeBuilder from "@axe-core/playwright";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures/guarded-test.js";
import { AccountFake, OTHER_DEVICE } from "./fixtures/learn-from-edits.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { startWithExercise } from "./fixtures/uf-08-start.js";
import { exerciseAreas, exercises } from "./fixtures/uf-04-library-data.js";

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

const SWAP_KEY = "swap:inverted-row:db-row";
const REMOVAL_KEY = "removal:inverted-row";
const screen = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`);
const part = (page: Page, name: string) => page.locator(`[data-part="${name}"]`);
const card = (page: Page) => part(page, "learning-card");
const detailRow = (page: Page, id: string) =>
  page.locator(`[data-part="detail-row"][data-id="${id}"]`);

/** A signed-in page on the fake account, with the library the swap seed needs. */
async function openApp(page: Page, fake: AccountFake, who = "A"): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    areaTargets: AREA_TARGETS,
    profile: fake.profile,
  });
  await fake.install(page, who);
  await page.goto("/");
  await injectSession(page);
}

/** A second device: its own context (own IndexedDB, own device id) on the same fake account. */
async function secondDevice(
  browser: Browser,
  baseURL: string | undefined,
  fake: AccountFake,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await openApp(page, fake, "B");
  return { context, page };
}

/** UF-08.1 -> UF-08.2 with the engine's own plan (a new visit: the page is loaded afresh). */
async function newVisit(page: Page, budget = 30): Promise<void> {
  await page.goto("/session/setup");
  await page.getByRole("button", { name: `${budget} minutes` }).click();
  await expect(part(page, "fit-line")).toHaveText(/^Fits:/);
  await page.getByRole("button", { name: "Suggest my workout" }).click();
  await expect(screen(page, "UF-08.2")).toBeVisible();
  await expect(part(page, "learning-region")).toBeAttached();
}

async function openArea(page: Page, area: string): Promise<void> {
  await page.locator(`[data-area="${area}"] [data-part="area-open"]`).click();
  await expect(screen(page, "UF-08.6")).toBeVisible();
}

/** What the on-device ledger holds, as `key -> count` (a real IndexedDB read). */
async function ledger(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains("editLedger")) return {};
      const rows = await new Promise<{ ledgerKey: string; count: number }[]>((resolve, reject) => {
        const req = db.transaction("editLedger").objectStore("editLedger").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return Object.fromEntries(rows.map((r) => [r.ledgerKey, r.count]));
    } finally {
      db.close();
    }
  });
}

type Reason = "Best match" | "Equipment taken" | "Discomfort" | "Variety" | "Short on time";

/** UF-08.6 -> UF-08.3: swap `fromName` for the exercise `toId` with `reason`, back on UF-08.6. */
async function swapOnDetail(
  page: Page,
  fromName: string,
  toId: string,
  reason: Reason = "Best match",
): Promise<void> {
  await page.getByRole("button", { name: `Swap ${fromName}`, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet
    .getByRole("radiogroup", { name: "Reason" })
    .getByRole("radio", { name: reason })
    .check();
  const pick = sheet
    .getByRole("radiogroup", { name: "Replacement" })
    .locator(`[data-id="${toId}"]`);
  await pick.getByRole("radio").check();
  await sheet.getByRole("button", { name: /^Use / }).click();
  await expect(sheet).toHaveCount(0);
  await expect(screen(page, "UF-08.6")).toBeVisible();
  await expect(detailRow(page, toId)).toHaveCount(1);
}

/** One whole visit that swaps Inverted row for Dumbbell row on UF-08.6 (a signal when `reason` counts). */
async function swapVisit(page: Page, reason: Reason = "Best match"): Promise<void> {
  await newVisit(page);
  await openArea(page, "back");
  await swapOnDetail(page, "Inverted row", "db-row", reason);
}

/** Waits until this device's ledger holds `count` signals for `key` (the write is fire and forget). */
async function ledgerHas(page: Page, key: string, count: number): Promise<void> {
  await expect.poll(async () => (await ledger(page))[key] ?? 0).toBe(count);
}

/** A visit that ends on UF-08.2 with the learning region settled after the pull. */
async function setupPage(page: Page, fake: AccountFake): Promise<void> {
  const reads = fake.reads("edit_signals").length;
  await newVisit(page);
  await expect.poll(() => fake.reads("edit_signals").length).toBeGreaterThan(reads);
}

test.describe.configure({ timeout: 120_000 });

test("T-1006 AC1 three swaps (the last in a workout via UF-09.9) raise Prefer, Prefer it lists it on UF-11.6 and leads the next plan; two swaps raise nothing", async ({
  page,
}) => {
  const fake = new AccountFake();
  await openApp(page, fake);

  // Visit 1 and 2: the swap on UF-08.6. Two signals: no card.
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 1);
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 2);
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  await expect(part(page, "learning-region")).toHaveText("");

  // Visit 3: a workout. Inverted row is the one exercise of Back; swap it from UF-09.9 Paused.
  await page.goto("/session/setup");
  await startWithExercise(page, {
    area: "back",
    query: "inverted row",
    name: "Inverted row",
  });
  await page.getByRole("button", { name: "Pause workout" }).click();
  const paused = screen(page, "UF-09.9");
  await expect(paused).toBeVisible();
  await paused.getByRole("button", { name: "Swap" }).click();
  const sheet = page.getByRole("dialog", { name: "Replace Inverted row" });
  await sheet
    .getByRole("radiogroup", { name: "Replacement" })
    .locator('[data-id="db-row"]')
    .getByRole("radio")
    .check();
  await sheet.getByRole("button", { name: "Use Dumbbell row" }).click();
  await expect(sheet).toHaveCount(0);
  await ledgerHas(page, SWAP_KEY, 3);
  // No prompt in the workout (principle 1).
  await expect(part(page, "learning-region")).toHaveCount(0);

  // UF-08.2 of the next visit: the card names the swap-in and its first area.
  await setupPage(page, fake);
  await expect(card(page)).toHaveAttribute("data-kind", "swap");
  await expect(
    card(page).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  await expect(card(page)).toContainText("You've swapped Inverted row for it 3 times.");
  await part(page, "learning-yes").click();
  await expect(part(page, "learning-after")).toContainText("Dumbbell row is a favorite now.");
  await expect(card(page)).toHaveCount(0);
  expect(fake.favorites.map((f) => f.exercise_id)).toEqual(["db-row"]);

  // UF-11.6 lists it.
  await page.goto("/plan/favorites");
  await expect(screen(page, "UF-11.6")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Back" })).toBeVisible();
  await expect(page.getByText("Dumbbell row", { exact: true })).toBeVisible();

  // The next plan: the favorite leads the Back area, and Inverted row is not first any more.
  await newVisit(page);
  await openArea(page, "back");
  await expect(page.locator('[data-part="detail-row"]').first()).toHaveAttribute(
    "data-id",
    "db-row",
  );
});

// ---- helpers for the privacy scan, the device store and the account screen ----

const SIGNAL_COLUMNS = [
  "asked_at",
  "count",
  "device_id",
  "exercise_id",
  "key",
  "kind",
  "last_seen",
  "to_exercise_id",
  "user_id",
  "window_start",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * AC8: everything the app sent that is not a read. Counts leave the device only as upserts and
 * deletes on `edit_signals` carrying the user's id and a random device id, with the table's
 * columns and nothing else; the profile flag, favorites and excluded writes carry no counts; no
 * body outside those names an exercise except the favorite and excluded writes' `exercise_id`.
 */
function assertPrivacy(fake: AccountFake, extraTables: string[] = []): void {
  const allowed = new Set([
    "edit_signals",
    "profiles",
    "favorite_exercises",
    "excluded_exercises",
    ...extraTables,
  ]);
  const writes = fake.requests.filter((r) => r.method !== "GET" && r.method !== "HEAD");
  expect(writes.length).toBeGreaterThan(0);
  expect([...new Set(writes.map((r) => r.table))].filter((t) => !allowed.has(t))).toEqual([]);
  const exerciseWords = exercises.flatMap((e) => [String(e.id), String(e.name)]);
  const devices = new Map<string, Set<string>>();
  for (const w of writes) {
    if (w.table === "edit_signals") {
      expect(["POST", "DELETE"]).toContain(w.method);
      if (w.method === "DELETE") {
        expect(w.body).toBeNull();
        expect(w.query).toContain(`user_id=eq.${FAKE_USER_ID}`);
        continue;
      }
      const row = JSON.parse(w.body!) as Record<string, unknown>;
      expect(Object.keys(row).sort()).toEqual(SIGNAL_COLUMNS);
      expect(row.user_id).toBe(FAKE_USER_ID);
      expect(String(row.device_id)).toMatch(UUID);
      devices.set(w.who, (devices.get(w.who) ?? new Set()).add(String(row.device_id)));
      const { exercise_id, to_exercise_id, key, ...rest } = row;
      expect(key).toBe(
        to_exercise_id === null
          ? `removal:${exercise_id}`
          : `swap:${exercise_id}:${to_exercise_id}`,
      );
      const text = JSON.stringify(rest);
      for (const word of exerciseWords) expect(text, `body names ${word}`).not.toContain(word);
      continue;
    }
    if (w.table === "profiles") {
      const keys = Object.keys(JSON.parse(w.body ?? "{}") as object);
      expect(keys.length).toBeGreaterThan(0);
      continue;
    }
    // No other write carries a count or a ledger key.
    const text = w.body ?? "";
    expect(text, `${w.method} ${w.table} carries a count`).not.toMatch(/"count"|swap:|removal:/);
    if (w.table === "favorite_exercises" || w.table === "excluded_exercises") {
      if (w.method === "POST")
        expect(Object.keys(JSON.parse(text) as object)).toEqual(["exercise_id"]);
    }
  }
  // One random device id per device, never the user's id.
  for (const ids of devices.values()) {
    expect(ids.size).toBe(1);
    expect([...ids][0]).not.toBe(FAKE_USER_ID);
  }
}

/** The row counts of the three ledger stores of this device (a real IndexedDB read). */
async function deviceStore(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("wl-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const out: Record<string, number> = {};
      for (const name of ["editLedger", "editLedgerMeta", "editSignalsCache"]) {
        out[name] = db.objectStoreNames.contains(name)
          ? await new Promise<number>((resolve, reject) => {
              const req = db.transaction(name).objectStore(name).count();
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            })
          : -1;
      }
      return out;
    } finally {
      db.close();
    }
  });
}

const TOGGLE = "Suggest preferences from my swaps and removals";
const toggle = (page: Page): Locator => page.getByRole("checkbox", { name: TOGGLE });

async function openAccount(page: Page): Promise<void> {
  await page.goto("/plan/account");
  await expect(page.getByRole("heading", { name: "Learning from your edits" })).toBeVisible();
}

// ---- AC1 (Undo) ----

test("T-1006 AC1 Undo takes the favorite off again: the write, UF-11.6 and the card's status", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 3 });
  await openApp(page, fake);
  await setupPage(page, fake);
  await expect(
    card(page).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  await part(page, "learning-yes").click();
  await expect(part(page, "learning-after")).toContainText("Dumbbell row is a favorite now.");
  expect(fake.favorites.map((f) => f.exercise_id)).toEqual(["db-row"]);

  await page.getByRole("button", { name: "Undo: Dumbbell row is a favorite now" }).click();
  await expect(part(page, "learning-after")).toHaveText("Undone.");
  expect(fake.favorites).toEqual([]);
  expect(fake.writes("favorite_exercises").map((r) => r.method)).toEqual(["POST", "DELETE"]);

  await page.goto("/plan/favorites");
  await expect(screen(page, "UF-11.6")).toBeVisible();
  await expect(page.getByText("No favorites yet.")).toBeVisible();
  // The answer stands: the pair is asked, it does not come back.
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
});

// ---- AC2 ----

test("T-1006 AC2 Remove in two visits raises Stop suggesting; Never suggest lists it on UF-11.5; one removal raises nothing", async ({
  page,
}) => {
  const fake = new AccountFake();
  await openApp(page, fake);
  const removeInvertedRow = async () => {
    await newVisit(page);
    await openArea(page, "back");
    await page.getByRole("button", { name: "Remove Inverted row", exact: true }).click();
    await expect(detailRow(page, "inverted-row")).toHaveCount(0);
  };

  await removeInvertedRow();
  await ledgerHas(page, REMOVAL_KEY, 1);
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);

  await removeInvertedRow();
  await ledgerHas(page, REMOVAL_KEY, 2);
  await setupPage(page, fake);
  await expect(card(page)).toHaveAttribute("data-kind", "removal");
  await expect(
    card(page).getByRole("heading", { name: "Stop suggesting Inverted row?" }),
  ).toBeVisible();
  await expect(card(page)).toContainText("You've removed it 2 times.");
  await part(page, "learning-yes").click();
  await expect(part(page, "learning-after")).toContainText("Inverted row won't be suggested.");
  expect(fake.excluded.map((e) => e.exercise_id)).toEqual(["inverted-row"]);

  await page.goto("/plan/excluded");
  await expect(screen(page, "UF-11.5")).toBeVisible();
  await expect(page.getByRole("button", { name: "Include Inverted row again" })).toBeVisible();
  // Excluded exercises are not suggested: the next plan's Back is not Inverted row.
  await newVisit(page);
  await openArea(page, "back");
  await expect(detailRow(page, "inverted-row")).toHaveCount(0);
  assertPrivacy(fake);
});

// ---- AC3 ----

test("T-1006 AC3 five Not today taps and five equipment-taken swaps never count or prompt", async ({
  page,
}) => {
  const fake = new AccountFake();
  await openApp(page, fake);
  for (let visit = 0; visit < 5; visit += 1) {
    await newVisit(page);
    await openArea(page, "back");
    // Equipment taken: not a taste signal.
    await swapOnDetail(page, "Inverted row", "db-row", "Equipment taken");
    // Not today on the exercise now in the plan: nothing is stored.
    await page.getByRole("button", { name: "Not today, Dumbbell row" }).click();
    await expect(part(page, "not-today-row")).toHaveCount(1);
  }
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  expect(await ledger(page)).toEqual({});
  expect(fake.writes("edit_signals")).toEqual([]);

  // Control: the same swap with the default reason counts once, not six times.
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 1);
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(1);
});

// ---- AC4 ----

test("T-1006 AC4 No thanks: the pair is never asked again, even after three more swaps", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 3 });
  await openApp(page, fake);
  await setupPage(page, fake);
  await expect(card(page)).toHaveAttribute("data-kind", "swap");
  await part(page, "learning-no").click();
  await expect(part(page, "learning-after")).toContainText("we won't ask about Dumbbell row again");
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => fake.signals().some((r) => r.asked_at !== null)).toBe(true);
  expect(fake.favorites).toEqual([]);

  for (let visit = 1; visit <= 3; visit += 1) {
    await swapVisit(page);
    await ledgerHas(page, SWAP_KEY, visit);
  }
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  // The count kept growing (3 from the other device and 3 here) and still nothing was asked.
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(6);
  expect(fake.favorites).toEqual([]);
});

// ---- AC5 ----

test("T-1006 AC5 learning off: three swaps raise nothing; on again, counting restarts from zero", async ({
  page,
}) => {
  const fake = new AccountFake();
  await openApp(page, fake);
  await openAccount(page);
  await toggle(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Learning is off." })).toBeVisible();
  expect(fake.profile.learn_from_edits).toBe(false);

  for (let visit = 0; visit < 3; visit += 1) await swapVisit(page);
  await newVisit(page);
  await expect(card(page)).toHaveCount(0);
  expect(await ledger(page)).toEqual({});
  expect(fake.writes("edit_signals", "POST")).toEqual([]);

  await openAccount(page);
  await expect(toggle(page)).not.toBeChecked();
  await toggle(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Learning is on." })).toBeVisible();
  expect(fake.profile.learn_from_edits).toBe(true);

  // The three swaps made while off were not kept: two more make two, not five.
  for (let visit = 1; visit <= 2; visit += 1) {
    await swapVisit(page);
    await ledgerHas(page, SWAP_KEY, visit);
  }
  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 3);
  await setupPage(page, fake);
  await expect(
    card(page).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  assertPrivacy(fake);
});

// ---- AC6 ----

test("T-1006 AC6 Forget what was counted clears a pending card and the account's rows, and nothing comes back", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 1 });
  await openApp(page, fake);
  // Two signals here plus one from the other device make the pending card.
  await swapVisit(page);
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 2);
  await setupPage(page, fake);
  await expect(
    card(page).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(3);

  await openAccount(page);
  await page.getByRole("button", { name: "Forget what was counted" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Counts cleared." })).toBeVisible();
  expect(fake.signals()).toEqual([]);
  expect(fake.profile.learn_reset_at).not.toBeNull();

  await setupPage(page, fake);
  await expect(card(page)).toHaveCount(0);
  expect(await ledger(page)).toEqual({});
  // A later flush does not bring the forgotten counts back.
  await setupPage(page, fake);
  expect(fake.signals()).toEqual([]);
});

// ---- AC6b ----

test("T-1006 AC6b two devices: 2 swaps here and 1 there raise the card there; No thanks there silences it here", async ({
  page: pageA,
  browser,
  baseURL,
}) => {
  const fake = new AccountFake();
  await openApp(pageA, fake, "A");
  const { context: contextB, page: pageB } = await secondDevice(browser, baseURL, fake);

  await swapVisit(pageA);
  await swapVisit(pageA);
  await setupPage(pageA, fake);
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(2);
  await expect(card(pageA)).toHaveCount(0);

  await swapVisit(pageB);
  await ledgerHas(pageB, SWAP_KEY, 1);
  await setupPage(pageB, fake);
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(3);
  // B holds one of the three; the other two came through the account.
  expect(await ledger(pageB)).toEqual({ [SWAP_KEY]: 1 });
  await expect(
    card(pageB).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  await expect(card(pageB)).toContainText("You've swapped Inverted row for it 3 times.");

  await part(pageB, "learning-no").click();
  await expect.poll(() => fake.signals().some((r) => r.asked_at !== null)).toBe(true);
  // A's next sync reads the asked mark: the pair is not asked here either.
  await setupPage(pageA, fake);
  await expect(card(pageA)).toHaveCount(0);
  await expect(part(pageA, "learning-region")).toHaveText("");
  expect(new Set(fake.signals().map((r) => r.device_id)).size).toBe(2);
  assertPrivacy(fake);
  await contextB.close();
});

test("T-1006 AC6b one device offline for its swap: its count arrives once it reconnects and is not counted twice", async ({
  page: pageA,
  browser,
  baseURL,
}) => {
  const fake = new AccountFake();
  await openApp(pageA, fake, "A");
  const { context: contextB, page: pageB } = await secondDevice(browser, baseURL, fake);

  await swapVisit(pageA);
  await swapVisit(pageA);
  await setupPage(pageA, fake);
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(2);

  // B opens its plan online, then loses the network and swaps.
  await newVisit(pageB);
  await openArea(pageB, "back");
  const gate = await goOffline(pageB, contextB);
  await swapOnDetail(pageB, "Inverted row", "db-row");
  await ledgerHas(pageB, SWAP_KEY, 1);
  expect(fake.total(SWAP_KEY)).toBe(2);
  expect(fake.signals().filter((r) => r.device_id !== OTHER_DEVICE).length).toBe(1);

  await gate.goOnline();
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(3);
  const mine = () => fake.signals().filter((r) => r.count === 1 && r.key === SWAP_KEY);
  expect(mine()).toHaveLength(1);

  // A forced second flush and pull: the total stays 3, B's row stays at 1.
  await setupPage(pageB, fake);
  await expect(card(pageB)).toHaveAttribute("data-kind", "swap");
  await setupPage(pageB, fake);
  expect(fake.total(SWAP_KEY)).toBe(3);
  expect(mine()).toHaveLength(1);
  await contextB.close();
});

// ---- AC7 ----

test("T-1006 AC7 offline the card shows with disabled buttons and the connect line; online the buttons work (both kinds)", async ({
  page,
  context,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 3, daysAgo: 3 });
  fake.seed({ from: "lat-pulldown", count: 2, daysAgo: 2 });
  await openApp(page, fake);
  await setupPage(page, fake);

  const lines = {
    swap: "Connect to change favorites",
    removal: "Connect to change excluded exercises",
  };
  const answered: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    await expect(card(page)).toBeVisible();
    const kind = (await card(page).getAttribute("data-kind")) as "swap" | "removal";
    answered.push(kind);
    const yes = part(page, "learning-yes");
    const no = part(page, "learning-no");

    const gate = await goOffline(page, context);
    await expect(yes).toHaveAttribute("aria-disabled", "true");
    await expect(no).toHaveAttribute("aria-disabled", "true");
    await expect(card(page)).toContainText(lines[kind]);
    const writes =
      fake.writes("favorite_exercises").length + fake.writes("excluded_exercises").length;
    // aria-disabled is not `disabled`: a tap reaches the handler, which must do nothing.
    await yes.click({ force: true });
    await no.click({ force: true });
    await expect(card(page)).toBeVisible();
    expect(
      fake.writes("favorite_exercises").length + fake.writes("excluded_exercises").length,
    ).toBe(writes);
    expect(fake.favorites.length + fake.excluded.length).toBe(i);
    await expect(part(page, "learning-error")).toHaveCount(0);

    await gate.goOnline();
    await expect(yes).not.toHaveAttribute("aria-disabled", "true");
    await expect(card(page)).not.toContainText(lines[kind]);
    await yes.click();
    await expect(part(page, "learning-after")).toBeVisible();
    // The next card (the other kind) replaces the status line's card.
    if (i === 0) await expect(card(page)).toBeVisible();
  }
  expect(answered.sort()).toEqual(["removal", "swap"]);
  await expect.poll(() => fake.favorites.map((f) => f.exercise_id)).toEqual(["db-row"]);
  await expect.poll(() => fake.excluded.map((f) => f.exercise_id)).toEqual(["lat-pulldown"]);
});

// ---- AC8 ----

test("T-1006 AC8 the export has the 11 tables with the user's edit_signals rows, learn_from_edits and the accepted favorite", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 2 });
  await openApp(page, fake);
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 1);
  await setupPage(page, fake);
  await expect(
    card(page).getByRole("heading", { name: "Prefer Dumbbell row for Back?" }),
  ).toBeVisible();
  await part(page, "learning-yes").click();
  await expect(part(page, "learning-after")).toContainText("Dumbbell row is a favorite now.");
  await expect.poll(() => fake.signals().length).toBe(2);

  await openAccount(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export my data" }).click(),
  ]);
  const body = JSON.parse(await readFile((await download.path())!, "utf-8")) as {
    tables: Record<string, Record<string, unknown>[]>;
  };
  expect(Object.keys(body.tables)).toHaveLength(11);
  expect(Object.keys(body.tables).at(-1)).toBe("edit_signals");
  expect(body.tables.edit_signals).toEqual(fake.signals());
  expect(body.tables.edit_signals!.map((r) => r.device_id).sort()).toContain(OTHER_DEVICE);
  expect(body.tables.edit_signals!.every((r) => r.user_id === FAKE_USER_ID)).toBe(true);
  expect(body.tables.profiles![0]).toMatchObject({ learn_from_edits: true });
  expect(body.tables.favorite_exercises!.map((r) => r.exercise_id)).toEqual(["db-row"]);
  assertPrivacy(fake);
});

test("T-1006 AC8 account deletion leaves no edit_signals row and no device store", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 2 });
  await openApp(page, fake);
  await swapVisit(page);
  await ledgerHas(page, SWAP_KEY, 1);
  await setupPage(page, fake);
  await expect.poll(() => fake.signals().length).toBe(2);
  // The device holds a ledger entry, its random id and the cached account rows.
  await expect
    .poll(async () => await deviceStore(page))
    .toMatchObject({ editLedger: 1, editLedgerMeta: 1, editSignalsCache: 2 });

  await openAccount(page);
  await page.getByRole("button", { name: "Delete account…" }).click();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  expect(fake.accountDeleted).toBe(true);
  expect(fake.signals()).toEqual([]);
  expect(await deviceStore(page)).toEqual({
    editLedger: 0,
    editLedgerMeta: 0,
    editSignalsCache: 0,
  });
});

test("T-1006 AC8 sign-out clears the device store and keeps the account's rows", async ({
  page,
}) => {
  const fake = new AccountFake();
  fake.seed({ from: "inverted-row", to: "db-row", count: 2 });
  await openApp(page, fake);
  await swapVisit(page);
  await setupPage(page, fake);
  await expect.poll(() => fake.signals().length).toBe(2);
  await expect
    .poll(async () => await deviceStore(page))
    .toMatchObject({ editLedger: 1, editLedgerMeta: 1, editSignalsCache: 2 });

  await openAccount(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  expect(await deviceStore(page)).toEqual({
    editLedger: 0,
    editLedgerMeta: 0,
    editSignalsCache: 0,
  });
  expect(fake.signals()).toHaveLength(2);
  expect(fake.accountDeleted).toBe(false);
});

// ---- AC9 ----

test("T-1006 AC9 no prompt on any UF-09 screen, even when a swap there crosses the threshold", async ({
  page,
}) => {
  const fake = new AccountFake();
  // Two signals from another device: the swap in the workout below is the third.
  fake.seed({ from: "inverted-row", to: "db-row", count: 2 });
  fake.seed({ from: "lat-pulldown", count: 2 });
  await openApp(page, fake);
  await page.goto("/session/setup");
  // The pending removal card shows on UF-08.2 before the workout starts.
  await startWithExercise(page, { area: "back", query: "inverted row", name: "Inverted row" });
  const noPrompt = async () => {
    await expect(page.locator('[data-part^="learning"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Stop suggesting|Prefer .* for /);
  };
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await noPrompt();

  await page.getByRole("button", { name: "Pause workout" }).click();
  await expect(screen(page, "UF-09.9")).toBeVisible();
  await noPrompt();
  await screen(page, "UF-09.9").getByRole("button", { name: "Swap" }).click();
  const sheet = page.getByRole("dialog", { name: "Replace Inverted row" });
  await expect(sheet).toBeVisible();
  await noPrompt();
  await sheet
    .getByRole("radiogroup", { name: "Replacement" })
    .locator('[data-id="db-row"]')
    .getByRole("radio")
    .check();
  await sheet.getByRole("button", { name: "Use Dumbbell row" }).click();
  await expect(sheet).toHaveCount(0);
  await ledgerHas(page, SWAP_KEY, 1);
  await noPrompt();
  await screen(page, "UF-09.9").getByRole("button", { name: "Resume" }).click();
  await expect(screen(page, "UF-09.3")).toBeVisible();
  await noPrompt();
  // Every UF-09 screen shows one task: the sync of the count never put a live region or a link up.
  await expect(page.locator("[data-screen-id]")).toHaveCount(1);

  // Back at UF-08.2 the threshold that was crossed in the workout raises the card (not before).
  await newVisit(page);
  await expect.poll(() => fake.total(SWAP_KEY)).toBe(3);
  await expect(card(page).first()).toBeVisible();
});

// ---- AC10 ----

for (const width of [320, 390]) {
  test(`T-1006 AC10 axe, 44 px targets and no horizontal scroll on the card at ${width} px (both kinds, and after yes)`, async ({
    page,
  }) => {
    const fake = new AccountFake();
    fake.seed({ from: "inverted-row", to: "db-row", count: 3, daysAgo: 3 });
    fake.seed({ from: "lat-pulldown", count: 2, daysAgo: 2 });
    await openApp(page, fake);
    await page.setViewportSize({ width, height: 844 });
    await setupPage(page, fake);

    const clean = async () => {
      const result = await new AxeBuilder({ page }).include('[data-screen-id="UF-08.2"]').analyze();
      expect(result.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    };
    const target = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    };

    const kinds: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await expect(card(page)).toBeVisible();
      kinds.push((await card(page).getAttribute("data-kind"))!);
      await clean();
      await target(part(page, "learning-yes"));
      await target(part(page, "learning-no"));
      await part(page, "learning-yes").click();
      await expect(part(page, "learning-after").first()).toBeVisible();
      await clean();
      await target(part(page, "learning-after").getByRole("button", { name: /^Undo:/ }));
    }
    expect(kinds.sort()).toEqual(["removal", "swap"]);
    // A card whose buttons are disabled (offline) is a different state with its own colours.
  });
}

// ---- T-1008: an opt-out on one device survives another device's profile save ----

test("T-1006 T-1008 opted out on device A, device B saves its equipment, learning stays off on both", async ({
  page: pageA,
  browser,
  baseURL,
}) => {
  const fake = new AccountFake();
  await openApp(pageA, fake, "A");
  const { context: contextB, page: pageB } = await secondDevice(browser, baseURL, fake);
  // B has read the profile with learning on, then A turns it off.
  await openAccount(pageB);
  await expect(toggle(pageB)).toBeChecked();
  await openAccount(pageA);
  await toggle(pageA).click();
  await expect(pageA.getByRole("status").filter({ hasText: "Learning is off." })).toBeVisible();
  expect(fake.profile.learn_from_edits).toBe(false);

  // B (its page still shows the old value) saves its equipment: a write of that field only.
  const kettlebell = pageB.getByRole("checkbox", { name: "Kettlebell" });
  await kettlebell.check();
  await pageB
    .locator("section", { has: pageB.getByText("Your equipment", { exact: true }) })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(pageB.getByText("Saved", { exact: true })).toBeVisible();
  const patches = fake.writes("profiles", "PATCH").filter((r) => r.who === "B");
  expect(patches.map((r) => Object.keys(JSON.parse(r.body!) as object))).toEqual([["equipment"]]);
  expect(fake.profile.learn_from_edits).toBe(false);

  // B reads it back as off, and three swaps on B count nothing and send nothing.
  await openAccount(pageB);
  await expect(toggle(pageB)).not.toBeChecked();
  for (let visit = 0; visit < 3; visit += 1) await swapVisit(pageB);
  await newVisit(pageB);
  await expect(card(pageB)).toHaveCount(0);
  expect(await ledger(pageB)).toEqual({});
  expect(fake.writes("edit_signals", "POST")).toEqual([]);
  expect(fake.profile.learn_from_edits).toBe(false);
  await contextB.close();
});
