// T-0308a UF-07.1 e2e (D-0071 §10): the happy path, the real-keyboard move, and axe plus
// 44 x 44 px targets (AC-A14). Supabase is mocked through `page.route` only. Run with one worker:
// `playwright test --workers=1`.
//
// `test` comes from `fixtures/guarded-test.js` (T-0904, D-0086; T-0425 consoleGuard): an unclaimed
// Supabase request, a `console.error` or a `pageerror` fails the test at teardown.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  FAKE_USER_ID,
  VITE_SUPABASE_URL,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
} from "./fixtures/supabase-mock.js";
import { ROUTINE_ID, routineFixtures } from "./fixtures/uf-07-routines.js";

interface Write {
  method: string;
  table: string;
  query: string;
  body: unknown;
}

/** Records every non-GET call to `routines` / `routine_items`, in order, and accepts it. */
async function captureWrites(page: Page): Promise<Write[]> {
  const writes: Write[] = [];
  for (const table of ["routines", "routine_items"]) {
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/${table}*`, async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fallback();
      writes.push({
        method: request.method(),
        table,
        query: new URL(request.url()).search,
        body: request.postDataJSON() ?? null,
      });
      return route.fulfill({ status: 204, body: "" });
    });
  }
  return writes;
}

async function cachedCount(page: Page, store: string): Promise<number> {
  return page.evaluate(
    async ({ store, userId }) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        return 0;
      }
      const count = await new Promise<number>((resolve, reject) => {
        const range = IDBKeyRange.bound(`${userId}:`, `${userId}:￿`);
        const c = db.transaction(store, "readonly").objectStore(store).count(range);
        c.onsuccess = () => resolve(c.result);
        c.onerror = () => reject(c.error);
      });
      db.close();
      return count;
    },
    { store, userId: FAKE_USER_ID },
  );
}

/** Signs in, lets the shell's sync fill the caches, then opens `path` (a fresh load). */
async function openSignedIn(page: Page, path: string) {
  await page.goto("/");
  await injectSession(page);
  await page.goto("/");
  await expect.poll(() => cachedCount(page, "libraryCache")).toBe(5);
  await expect.poll(() => cachedCount(page, "routineCache")).toBe(1);
  await page.goto(path);
  await expect(page.locator('[data-screen-id="UF-07.1"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  await mockSupabaseData(page, routineFixtures());
});

test("UF-07.1 create: name, add two exercises, Save sends the three writes and lands on /plan", async ({
  page,
}) => {
  const writes = await captureWrites(page);
  await openSignedIn(page, "/plan/routines/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit routine");

  await page.getByLabel("Name").fill("Push day");
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Add Bench press" }).click();
  await page.getByRole("button", { name: "Add Goblet squat" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("2. Goblet squat")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/plan$/);
  expect(writes.map((w) => `${w.method} ${w.table}`)).toEqual([
    "POST routines",
    "DELETE routine_items",
    "POST routine_items",
  ]);
  const id = (writes[0]!.body as { id: string; name: string }).id;
  expect(writes[0]!.body).toEqual({ id, name: "Push day" });
  expect(decodeURIComponent(writes[1]!.query)).toContain(`routine_id=eq.${id}`);
  expect(decodeURIComponent(writes[1]!.query)).toContain("position=gte.2");
  expect(writes[2]!.query).toContain("on_conflict=routine_id%2Cposition");
  expect(writes[2]!.body).toEqual([
    expect.objectContaining({
      routine_id: id,
      position: 0,
      exercise_id: "bench-press-barbell",
      sets: 3,
    }),
    expect.objectContaining({
      routine_id: id,
      position: 1,
      exercise_id: "goblet-squat-dumbbell",
      sets: 3,
    }),
  ]);
});

test("UF-07.1 a real-keyboard move (Tab, Enter) reorders the rows and keeps focus", async ({
  page,
}) => {
  await openSignedIn(page, `/plan/routines/${ROUTINE_ID}`);
  await expect(page.getByText("3. Leg curl (machine)")).toBeVisible();
  const up = page.getByRole("button", { name: "Move Leg curl (machine) up" });
  for (let i = 0; i < 20 && !(await up.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(up).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2. Leg curl (machine)")).toBeVisible();
  await expect(page.getByText("3. Romanian deadlift (barbell)")).toBeVisible();
  await expect(up).toBeFocused();
});

test("UF-07.1 the delete confirm traps Tab and inerts the form; focus survives a Remove (T-0453)", async ({
  page,
}) => {
  await openSignedIn(page, `/plan/routines/${ROUTINE_ID}`);
  await expect(page.getByText("3. Leg curl (machine)")).toBeVisible();
  await page.getByRole("button", { name: "Delete routine" }).click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  const field = page.getByLabel("Name");
  const before = await field.inputValue();
  const box = (await field.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("x");
  await expect(field).toHaveValue(before);
  await page.getByRole("button", { name: "Keep routine" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete routine" })).toBeFocused();
  await page.getByRole("button", { name: "Remove Leg curl (machine)" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove Romanian deadlift (barbell)" }),
  ).toBeFocused();
});

test("UF-07.1 going offline with focus on Delete moves focus to Keep routine (T-0454)", async ({
  page,
  context,
}) => {
  await openSignedIn(page, `/plan/routines/${ROUTINE_ID}`);
  await expect(page.getByText("3. Leg curl (machine)")).toBeVisible();
  await page.getByRole("button", { name: "Delete routine" }).click();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await context.setOffline(true);
  const keep = page.getByRole("button", { name: "Keep routine" });
  await expect(keep).toBeFocused();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    await expect(keep).toBeFocused();
  }
});

test.describe("AC-A14 a11y", () => {
  async function audit(page: Page) {
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
    for (const el of await page.locator("button, input, a").all()) {
      const box = await el.boundingBox();
      expect(box, await el.evaluate((n) => n.outerHTML)).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }

  test("/plan/routines/new with the picker open", async ({ page }) => {
    await openSignedIn(page, "/plan/routines/new");
    await page.getByRole("button", { name: "Add exercise" }).click();
    await expect(page.getByLabel("Search exercises")).toBeVisible();
    await audit(page);
  });

  test("/plan/routines/<id>", async ({ page }) => {
    await openSignedIn(page, `/plan/routines/${ROUTINE_ID}`);
    await expect(page.getByText("1. Barbell back squat")).toBeVisible();
    await audit(page);
  });
});
