// T-0469 UF-11.4 Account settings e2e (D-0136, NFR-PRIV-4/5, NFR-A11Y-1/2). Export and deletion
// are only trustworthy end to end with a real IndexedDB, a real download and a mocked Edge
// Function — the unit tests in T-0310d mock `lib/account` entirely.
//
// `test`/`expect` come from `fixtures/guarded-test.js` (D-0086): any unclaimed Supabase request
// fails the test at teardown. The signed-in user is the e2e session helper's
// (`ada@example.com`, id `11111111-1111-4111-8111-111111111111`, D-0172 §6); V below is any
// other uuid.
//
// Export rows (D-0172 §6): `mockSupabaseData` answers every `sessions*`/`session_sets*`/
// `session_sets_live*` read with `[]` first. This spec then registers GET routes matched by a
// predicate on the EXACT pathname (`/rest/v1/sessions`, `/rest/v1/session_sets`) — never a
// `session_sets*` glob, which would also match `session_sets_live?...` (measured in
// `supabase-mock.ts`'s own comment) and silently zero out the history read. Being registered
// after `mockSupabaseData`, these exact-path routes win for the bare paths while
// `session_sets_live*` still falls through to `mockSupabaseData`'s route.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import { goOffline } from "./fixtures/offline.js";
import {
  FAKE_USER_ID,
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import {
  ACCOUNT_FIXTURES,
  ACCOUNT_PROFILE,
  EXPORT_SESSIONS,
  EXPORT_SETS,
} from "./fixtures/uf-11-account.js";

import { compareWithCanvas } from "./helpers/canvas-compare.js";

const MIN_TARGET_PX = 44;
const V = "22222222-2222-4222-8222-222222222222";

/** The exact-pathname predicate (D-0172 §6): matches `/rest/v1/sessions` or
 *  `/rest/v1/sessions?...`, never `/rest/v1/sessions_sets...` or `..._live...`. */
function exactPath(route: Route, pathname: string): boolean {
  return new URL(route.request().url()).pathname === pathname;
}

async function mockExportRows(page: Page): Promise<void> {
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/sessions*`, (route) => {
    if (route.request().method() !== "GET" || !exactPath(route, "/rest/v1/sessions")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: EXPORT_SESSIONS });
  });
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/session_sets*`, (route) => {
    if (route.request().method() !== "GET" || !exactPath(route, "/rest/v1/session_sets")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: EXPORT_SETS });
  });
  // `mockSupabaseData`'s `profiles*` route answers the shell's profile-gate `maybeSingle()`
  // read with a bare object (the real PostgREST shape for that call's
  // `Accept: application/vnd.pgrst.object+json`). The export's own `.select("*")` read (no
  // `maybeSingle`) sends a plain `Accept: application/json` and needs an array — the one case
  // this spec's fixture profile isn't already array-shaped. Distinguish by that header, falling
  // back to the shared route otherwise.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const accept = route.request().headers().accept ?? "";
    if (route.request().method() !== "GET" || accept.includes("vnd.pgrst.object")) {
      return route.fallback();
    }
    return route.fulfill({ status: 200, json: [ACCOUNT_PROFILE] });
  });
}

interface AccountCall {
  method: string;
  authorization: string | null;
}

/** Registers `DELETE **\/functions/v1/account`, recording every call, answered with `status`.
 *  Also mocks the GoTrue local sign-out (`POST /auth/v1/logout?scope=local`) that
 *  `deleteAccountAndSignOut` fires right after a 204 (D-0136 §4 step 4) — unmocked, it hits the
 *  501 backstop and the guard fails the test even though the screen behaves correctly. Both
 *  routes must be awaited before the page navigates, or the route may not be active yet when the
 *  request is made (Playwright registers routes asynchronously).
 *
 *  D-0173 (fixed by T-0480, merged to main): on a 204, both of these are fulfilled correctly
 *  (confirmed with a temporary `requestfailed` listener: both got their 204), but the app's own,
 *  correct, existing behaviour (D-0136 §4 comment: a still-"signed-in" `AuthProvider` ref at
 *  check time does a **hard** `window.location.replace("/welcome")`, not an SPA navigate) tears
 *  the frame down right after, and Chromium also reports both as `requestfailed:
 *  net::ERR_ABORTED` even though they already resolved in-page. `guarded-test.ts`'s detector 2
 *  now exempts an already-fulfilled request aborted by a same-tick hard navigation (T-0480 added
 *  a `fulfilledResponses` set checked before reporting `requestfailed`), so this no longer fails
 *  the guard. AC-2 is written to the correct behaviour either way. */
async function mockAccountDelete(page: Page, status: number): Promise<AccountCall[]> {
  const calls: AccountCall[] = [];
  await page.route(`${VITE_SUPABASE_URL}/functions/v1/account`, (route) => {
    const request = route.request();
    calls.push({
      method: request.method(),
      authorization: request.headers().authorization ?? null,
    });
    if (status === 204) return route.fulfill({ status: 204 });
    return route.fulfill({ status, json: { error: "boom" } });
  });
  await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
    route.fulfill({ status: 204 }),
  );
  return calls;
}

async function open(page: Page): Promise<void> {
  await mockSupabaseData(page, ACCOUNT_FIXTURES);
  await mockExportRows(page);
  await page.goto("/");
  await injectSession(page);
  await page.goto("/plan/account");
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
});

test.describe("T-0469 AC-1 export (NFR-PRIV-4)", () => {
  test("T-0469 AC-1 downloads one workoutlab-export file with the 9 tables, 2 sessions, 3 sets", async ({
    page,
  }) => {
    let historyHit = false;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/rest/v1/session_sets_live") historyHit = true;
    });

    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export my data" }).click(),
    ]);

    const today = new Intl.DateTimeFormat("en-US", {
      timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
    expect(download.suggestedFilename()).toBe(
      `workoutlab-export-${today.year}-${today.month}-${today.day}.json`,
    );

    const path = await download.path();
    const body = JSON.parse(await (await import("node:fs/promises")).readFile(path!, "utf-8"));
    expect(body.format).toBe("workoutlab-export");
    expect(body.version).toBe(1);
    expect(Object.keys(body.tables)).toEqual([
      "profiles",
      "area_targets",
      "sessions",
      "session_sets",
      "routines",
      "routine_items",
      "plan_checkins",
      "excluded_exercises",
      "favorite_exercises",
    ]);
    expect(body.tables.excluded_exercises).toEqual([]);
    expect(body.tables.favorite_exercises).toEqual([]);
    expect(body.tables.sessions).toHaveLength(2);
    expect(body.tables.session_sets).toHaveLength(3);
    expect(historyHit, "the session_sets_live history read was shadowed").toBe(true);
  });
});

/** Polls until the real app (its own AutoSync/Dexie open, D-0113) has created `wl-offline`'s
 *  `sets` store, so a version-less `indexedDB.open` from this spec never races Dexie's own
 *  versioned open into creating an empty v1 database with no stores at all. */
async function waitForOfflineDb(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const req = indexedDB.open("wl-offline");
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (!db) return false;
        const has = db.objectStoreNames.contains("sets");
        db.close();
        return has;
      });
    })
    .toBe(true);
}

async function seedDevice(page: Page): Promise<void> {
  await waitForOfflineDb(page);
  await page.evaluate(
    async ({ userId, other }) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sets", "readwrite");
        const store = tx.objectStore("sets");
        const row = (uid: string, clientId: string) => ({
          key: `${uid}:${clientId}`,
          userId: uid,
          clientId,
          sessionId: "s1",
          exerciseId: "squat",
          setIndex: 0,
          kind: "reps",
          reps: 5,
          weightKg: 60,
          durationS: null,
          rir: null,
          isWarmup: false,
          backoff: false,
          completedAt: "2026-09-27T09:00:00Z",
          editedAt: "2026-09-27T09:00:00Z",
          deletedAt: null,
          status: "queued",
        });
        store.put(row(userId, "c-u"));
        store.put(row(other, "c-v"));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      window.localStorage.setItem("wl-last-email", "ada@example.com");
    },
    { userId: FAKE_USER_ID, other: V },
  );
}

async function countSets(page: Page, userId: string): Promise<number> {
  return page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("sets", "readonly");
      const store = tx.objectStore("sets");
      const r = store.count(IDBKeyRange.bound(`${uid}:`, `${uid}:￿`));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count;
  }, userId);
}

test.describe("T-0469 AC-2 delete (NFR-PRIV-5)", () => {
  async function confirmDelete(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Delete account…" }).click();
    await page.getByLabel("Type delete to confirm").fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();
  }

  test("T-0469 AC-2 deletes this user's data only, lands on /welcome with the notice", async ({
    page,
  }) => {
    const calls = await mockAccountDelete(page, 204);
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);

    await confirmDelete(page);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByText("Your account and all your data are deleted.")).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].authorization).toMatch(/^Bearer /);

    expect(await countSets(page, FAKE_USER_ID)).toBe(0);
    expect(await countSets(page, V)).toBe(1);

    const wlKeys = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("wl-")) keys.push(k);
      }
      return keys;
    });
    expect(wlKeys).toEqual([]);
  });
});

test.describe("T-0469 AC-3 server error", () => {
  test("T-0469 AC-3 a 500 keeps the user on UF-11.4 with the error and the seeded row intact", async ({
    page,
  }) => {
    await mockAccountDelete(page, 500);
    await open(page);
    await waitForOfflineDb(page);
    await page.evaluate(async (userId: string) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("sets", "readwrite");
        tx.objectStore("sets").put({
          key: `${userId}:c-u`,
          userId,
          clientId: "c-u",
          sessionId: "s1",
          exerciseId: "squat",
          setIndex: 0,
          kind: "reps",
          reps: 5,
          weightKg: 60,
          durationS: null,
          rir: null,
          isWarmup: false,
          backoff: false,
          completedAt: "2026-09-27T09:00:00Z",
          editedAt: "2026-09-27T09:00:00Z",
          deletedAt: null,
          status: "queued",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, FAKE_USER_ID);

    await page.getByRole("button", { name: "Delete account…" }).click();
    await page.getByLabel("Type delete to confirm").fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();

    await expect(page.getByText("Couldn't delete your account. Try again.")).toBeVisible();
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
    await expect(page).not.toHaveURL(/\/welcome$/);

    const count = await page.evaluate(async (userId: string) => {
      const req = indexedDB.open("wl-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const n = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction("sets", "readonly");
        const r = tx.objectStore("sets").count(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return n;
    }, FAKE_USER_ID);
    expect(count).toBe(1);
  });
});

test.describe("T-0469 AC-4 offline", () => {
  test("T-0469 AC-4 both actions disable offline, no request, and re-enable online without a reload", async ({
    page,
    context,
  }) => {
    await mockAccountDelete(page, 204);
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    // Let the service worker precache settle before going offline, and reload, per the pattern
    // measured in offline.spec.ts (T-0904): hasDocument must be true or the reload can hit
    // net::ERR_INTERNET_DISCONNECTED on an incompletely-populated precache.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const keys = await caches.keys();
          const precache = keys.find((k) => k.startsWith("workbox-precache"));
          if (!precache) return false;
          const cache = await caches.open(precache);
          const requests = await cache.keys();
          return requests.some((r) => new URL(r.url).pathname === "/index.html");
        });
      })
      .toBe(true);

    let accountCalls = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/functions/v1/account") accountCalls += 1;
    });

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account settings");

    const exportButton = page.getByRole("button", { name: "Export my data" });
    const deleteButton = page.getByRole("button", { name: "Delete account…" });
    await expect(exportButton).toHaveAttribute("aria-disabled", "true");
    await expect(deleteButton).toHaveAttribute("aria-disabled", "true");

    await context.setOffline(false);
    await expect(exportButton).not.toHaveAttribute("aria-disabled", "true");
    await expect(deleteButton).not.toHaveAttribute("aria-disabled", "true");

    expect(accountCalls).toBe(0);
  });
});

test.describe("T-0469 AC-5 accessibility (NFR-A11Y-1/-2)", () => {
  test("T-0469 AC-5 axe reports 0 serious/critical violations, panel closed and open", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const closed = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      closed.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await page.getByRole("button", { name: "Delete account…" }).click();
    await expect(page.getByLabel("Type delete to confirm")).toBeVisible();

    const open_ = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      open_.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });

  test("T-0469 AC-5 every button, input and link is at least 44 x 44 CSS px", async ({ page }) => {
    await open(page);
    const host = page.locator('[data-screen-id="UF-11.4"]');
    await expect(host).toBeVisible();
    await page.getByRole("button", { name: "Delete account…" }).click();
    await expect(page.getByLabel("Type delete to confirm")).toBeVisible();

    const candidates = host.locator("button, input, a");
    const count = await candidates.count();
    expect(count).toBeGreaterThan(3);

    const tooSmall: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let element = candidates.nth(i);
      if (!(await element.isVisible())) continue;
      // T-0550: the C-03 checkbox's hit target is its 44 px label (24 px box inside it).
      if ((await element.getAttribute("type")) === "checkbox") {
        element = element.locator("xpath=ancestor::label[1]");
      }
      const box = await element.boundingBox();
      if (!box) continue;
      if (box.width < MIN_TARGET_PX || box.height < MIN_TARGET_PX) {
        // `textContent` on an <input> (e.g. the checkboxes here) is "" , not null/undefined, so
        // `??` alone never falls through to the tag-name branch — a failing checkbox would print
        // with no name. Treat a blank string the same as null/undefined.
        const label = (await element.getAttribute("aria-label")) || (await element.textContent());
        const name = label?.trim() || (await element.evaluate((el) => el.tagName.toLowerCase()));
        tooSmall.push(`${name}: ${Math.round(box.width)} x ${Math.round(box.height)}`);
      }
    }
    expect(tooSmall).toEqual([]);
  });

  test("T-0469 AC-5 keyboard: Tab+Enter opens the panel with focus in the input; Account from /plan reaches UF-11.4", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();

    const deleteOpen = page.getByRole("button", { name: "Delete account…" });
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await deleteOpen.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Delete account… was not reachable by Tab within 60 presses").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Type delete to confirm")).toBeFocused();

    await page.goto("/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
    const accountLink = page.getByRole("link", { name: "Account and sign out" });
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await accountLink.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Account and sign out was not reachable by Tab within 60 presses").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen-id="UF-11.4"]')).toBeVisible();
  });
});

async function libraryCacheRows(page: Page, userId: string): Promise<number> {
  return page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("libraryCache", "readonly");
      const r = tx.objectStore("libraryCache").index("userId").count(uid);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count;
  }, userId);
}

async function putLibraryRow(page: Page, userId: string): Promise<void> {
  await page.evaluate(async (uid: string) => {
    const req = indexedDB.open("wl-offline");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("libraryCache", "readwrite");
      tx.objectStore("libraryCache").put({ key: `${uid}:squat`, userId: uid, id: "squat" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, userId);
}

async function wlAndAuthKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("wl-") || k.endsWith("-auth-token"))) keys.push(k);
    }
    return keys;
  });
}

test.describe("T-0529 findable sign out (D-0195, GitHub #35)", () => {
  test("T-0529 AC-7 the link is above the fold at 360x640; Sign out lands on /welcome and clears the device", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await mockSupabaseData(page, ACCOUNT_FIXTURES);
    await page.goto("/");
    await injectSession(page);
    await page.goto("/plan");
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
    await waitForOfflineDb(page);
    await putLibraryRow(page, FAKE_USER_ID);
    await page.evaluate(() => {
      window.localStorage.setItem("wl-last-email", "ada@example.com");
      window.localStorage.setItem("wl-onboarding", "T0529-SENTINEL");
    });

    const link = page.getByRole("link", { name: "Account and sign out" });
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await link.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    await link.click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.locator('[data-screen-id="UF-01.1"]')).toBeVisible();
    // UF-01 may write a fresh guest draft to `wl-onboarding` once /welcome renders; the
    // signed-in session's value (the sentinel) must be gone, and every other wl- key too.
    const left = await wlAndAuthKeys(page);
    expect(left.filter((k) => k !== "wl-onboarding")).toEqual([]);
    expect(await page.evaluate(() => window.localStorage.getItem("wl-onboarding"))).not.toBe(
      "T0529-SENTINEL",
    );
    expect(await libraryCacheRows(page, FAKE_USER_ID)).toBe(0);
  });

  test("T-0529 AC-8 offline with a queued set: confirm, Sign out anyway, /welcome, the set is kept", async ({
    page,
    context,
  }) => {
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
    await goOffline(page, context);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByText(
        "Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out anyway" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    expect(await countSets(page, FAKE_USER_ID)).toBe(1);
  });

  test.describe("T-0908 AC-4 no service worker controls the page", () => {
    test.use({ serviceWorkers: "block" });

    test("T-0908 AC-4 offline with a queued set, service worker blocked (CI): confirm, Sign out anyway, /welcome, the set is kept", async ({
      page,
      context,
    }) => {
      await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
        route.fulfill({ status: 204 }),
      );
      await open(page);
      await seedDevice(page);
      await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
      await goOffline(page, context);

      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByText(
          "Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.",
        ),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out anyway" }).click();
      await expect(page).toHaveURL(/\/welcome$/);
      expect(await countSets(page, FAKE_USER_ID)).toBe(1);
    });
  });

  test("T-0529 AC-6 axe: the unsynced confirm on UF-11.4 and UF-11.2 with the header link", async ({
    page,
  }) => {
    await open(page);
    await seedDevice(page);
    await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign out anyway" })).toBeFocused();
    const confirm = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.4"]').analyze();
    expect(
      confirm.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await page.goto("/plan");
    await expect(page.getByRole("link", { name: "Account and sign out" })).toBeVisible();
    const plan = await new AxeBuilder({ page }).include('[data-screen-id="UF-11.2"]').analyze();
    expect(
      plan.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });
});

// T-0550 UF-11.4 rework (D-0203 §4; spec UF-11.4.md AC2, AC6, AC7).
test.describe("T-0550 UF-11.4 layout, back link and targets", () => {
  const ROOT = '[data-screen-id="UF-11.4"]';

  async function setEmail(page: Page, email: string): Promise<void> {
    await page.evaluate((e) => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.endsWith("-auth-token")) continue;
        const t = JSON.parse(window.localStorage.getItem(k)!);
        (t.currentSession ?? t).user.email = e;
        window.localStorage.setItem(k, JSON.stringify(t));
      }
    }, email);
  }

  test("T-0550 AC2 the back link lands on Plan", async ({ page }) => {
    await open(page);
    await page.getByRole("link", { name: "Back to Plan" }).click();
    await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
  });

  test("T-0550 AC6 390 x 844: title type and gutter; saves a screenshot", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(page.getByRole("group", { name: "Your equipment" })).toBeVisible();
    const h1 = await page.locator(`${ROOT} h1`).evaluate((el) => {
      const c = getComputedStyle(el);
      return { f: c.fontFamily, w: c.fontWeight, t: c.textTransform, s: parseFloat(c.fontSize) };
    });
    // T-0613 (D-0208, D-0211 §3): the plan-state page title (Familjen Grotesk 700, 56 px, no
    // uppercase) and the 28 px gutter, which moves from 20 px deliberately.
    expect(h1.f.startsWith('"Familjen Grotesk"')).toBe(true);
    expect(h1.w).toBe("700");
    expect(h1.t).toBe("none");
    expect(h1.s).toBe(56);
    const pad = await page
      .locator(ROOT)
      .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
    expect(pad).toEqual(["28px", "28px"]);
    await page.screenshot({ path: testInfo.outputPath("account-390.png"), fullPage: true });
  });

  test("T-0550 AC6 320 x 640 with a 64-character email: no horizontal scroll, email not clipped", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await setEmail(page, `${"a".repeat(52)}@example.com`);
    await page.goto("/plan/account");
    const email = page.locator(".wl-account__email");
    await expect(email).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(await email.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("T-0550 AC7 every target is 44 px and the confirm input border is ink-muted", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await expect(page.getByRole("group", { name: "Your equipment" })).toBeVisible();
    await page.getByRole("button", { name: "Delete account…" }).click();
    const input = page.getByLabel("Type delete to confirm");
    await expect(input).toBeVisible();
    const heights = await page
      .locator(`${ROOT} :is(a, button, input:not([type="checkbox"]), label.wl-checkbox)`)
      .evaluateAll((els) =>
        els.map((el) => ({
          name: el.textContent?.trim() || el.tagName,
          h: el.getBoundingClientRect().height,
        })),
      );
    expect(heights.length).toBeGreaterThan(10);
    for (const t of heights) expect(t.h, t.name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await page.mouse.move(0, 0); // the input may have opened under the pointer: no hover border
    const { border, expected } = await input.evaluate((el) => {
      // T-0613: under the plan state the boundary is the state's --wl-ink-muted (5.9 on plan.bg).
      const probe = document.createElement("i");
      probe.style.color = "var(--wl-ink-muted)";
      el.closest("[data-screen-id]")!.append(probe);
      const expectedColor = getComputedStyle(probe).color;
      probe.remove();
      return { border: getComputedStyle(el).borderTopColor, expected: expectedColor };
    });
    expect(border).toBe(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// T-0613 (D-0208, D-0210, D-0211; UF-11.4): the Cobalt plan state on Account settings, measured in
// a real browser. Expected values come from tokens.json, never typed.
// ---------------------------------------------------------------------------------------------
const TOKENS = JSON.parse(
  readFileSync(resolve(__dirname, "../../packages/design-tokens/src/tokens.json"), "utf8"),
) as { color: { plan: Record<string, string>; paper: Record<string, string> } };
const PLAN = TOKENS.color.plan;
const PAPER = TOKENS.color.paper;
const SCREEN = '[data-screen-id="UF-11.4"]';

const rgbOf = (hex: string): string => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
};
const lum = (hex: string): number => {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
};
const tokenRatio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 10) / 10;
};

async function openCobalt(page: Page, width = 390): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await open(page);
  await expect(page.getByRole("group", { name: "Your equipment" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe(rgbOf(PLAN.bg!));
}

async function openPaper(page: Page): Promise<void> {
  await openCobalt(page);
  await seedDevice(page);
  await expect.poll(() => countSets(page, FAKE_USER_ID)).toBe(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out anyway" })).toBeFocused();
}

async function openDelete(page: Page): Promise<void> {
  await openCobalt(page);
  await page.getByRole("button", { name: "Delete account…" }).click();
  await expect(page.getByLabel("Type delete to confirm")).toBeFocused();
}

/** Every text node's colour against the first opaque background above it, at least 4.5:1. */
async function expectTextContrast(page: Page): Promise<void> {
  const pairs = await page.evaluate(() => {
    const parse = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
    const bgOf = (el: Element): number[] => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length === 3 || (c.length === 4 && c[3]! > 0)) return c.slice(0, 3);
      }
      return parse(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
    };
    const out: { text: string; fg: number[]; bg: number[] }[] = [];
    for (const el of document.querySelector("[data-screen-id]")!.querySelectorAll("*")) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      out.push({
        text: el.textContent!.trim().slice(0, 30),
        fg: parse(cs.color).slice(0, 3),
        bg: bgOf(el),
      });
    }
    return out;
  });
  const L = (c: number[]) => {
    const f = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
  };
  expect(pairs.length).toBeGreaterThan(8);
  for (const p of pairs) {
    const [hi, lo] = [L(p.fg), L(p.bg)].sort((x, y) => y - x);
    expect((hi! + 0.05) / (lo! + 0.05), `${p.text} ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5);
  }
}

async function expectAxeContrast(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
}

test.describe("T-0613 AC1 state and gutter", () => {
  for (const [width, gutter] of [
    [390, "28px"],
    [340, "20px"],
  ] as const) {
    test(`/plan/account at ${width} px: data-wl-state=plan and padding-left ${gutter}`, async ({
      page,
    }) => {
      await openCobalt(page, width);
      const root = page.locator(SCREEN);
      await expect(root).toHaveAttribute("data-wl-state", "plan");
      expect(await root.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(gutter);
    });
  }

  test("320 x 640: no horizontal scroll and the email line is not clipped", async ({ page }) => {
    await openCobalt(page, 320);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(
      (e) => {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k || !k.endsWith("-auth-token")) continue;
          const t = JSON.parse(window.localStorage.getItem(k)!);
          (t.currentSession ?? t).user.email = e;
          window.localStorage.setItem(k, JSON.stringify(t));
        }
      },
      `${"a".repeat(52)}@example.com`,
    );
    await page.goto("/plan/account");
    const email = page.locator(".wl-account__email");
    await expect(email).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(await email.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("T-0613 AC2 the unsynced paper panel (390 x 844)", () => {
  test("queued sets: the paper panel is full-bleed in paper ink; the pill is the paper action; focus ring is the paper ink", async ({
    page,
  }) => {
    await openPaper(page);
    const got = await page.locator(`${SCREEN} .wl-paper`).evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const pill = [...el.querySelectorAll("button")].find(
        (b) => b.textContent === "Sign out anyway",
      )!;
      const cancel = [...el.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
      const p = getComputedStyle(pill);
      return {
        bg: cs.backgroundColor,
        ink: cs.color,
        left: r.left,
        right: r.right,
        pillBg: p.backgroundColor,
        pillInk: p.color,
        cancelClass: cancel.className,
        text: el.textContent,
      };
    });
    expect(got.bg).toBe(rgbOf(PAPER.bg!));
    expect(got.ink).toBe(rgbOf(PAPER.ink!));
    expect(got.left).toBe(0);
    expect(got.right).toBe(390);
    expect(got.pillBg).toBe(rgbOf(PAPER.action!));
    expect(got.pillInk).toBe(rgbOf(PAPER["on-action"]!));
    expect(got.cancelClass).toContain("wl-button--text");
    expect(got.text).toContain("Some workouts haven't synced yet.");
    // Keyboard focus on the pill shows a 2 px ring in the paper ink.
    const pill = page.getByRole("button", { name: "Sign out anyway" });
    await pill.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(
      await pill.evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.outlineWidth, cs.outlineColor, cs.outlineStyle];
      }),
    ).toEqual(["2px", rgbOf(PAPER.ink!), "solid"]);
    expect(tokenRatio(PAPER.ink!, PAPER.bg!)).toBe(12.9);
    expect(tokenRatio(PAPER["on-action"]!, PAPER.action!)).toBe(8.6);
  });

  test("empty queue: no paper panel appears and sign-out proceeds", async ({ page }) => {
    await page.route(`${VITE_SUPABASE_URL}/auth/v1/logout*`, (route) =>
      route.fulfill({ status: 204 }),
    );
    await openCobalt(page);
    await expect(page.locator(`${SCREEN} .wl-paper`)).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/welcome$/);
  });
});

test.describe("T-0613 AC3 the delete panel (390 x 844)", () => {
  test("Delete my account is the secondary outline in plan ink, aria-disabled until 'delete' is typed, and Cancel is the last control", async ({
    page,
  }) => {
    await openDelete(page);
    const confirm = page.getByRole("button", { name: "Delete my account" });
    await expect(confirm).not.toHaveClass(/wl-button--primary/);
    await expect(confirm).toHaveClass(/wl-button--secondary/);
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    const o = await confirm.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, c: cs.borderTopColor, bg: cs.backgroundColor };
    });
    // Chrome snaps the authored 1.5px border to whole CSS px in computed style (main-css.test.ts
    // pins the authored value); here: a solid border at least 1px wide.
    expect(parseFloat(o.w)).toBeGreaterThanOrEqual(1);
    expect(o.c).toBe(rgbOf(PLAN["ink-muted"]!)); // aria-disabled: the muted outline
    await page.getByLabel("Type delete to confirm").fill("delete");
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    const live = await confirm.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, c: cs.borderTopColor, bg: cs.backgroundColor };
    });
    expect(parseFloat(live.w)).toBeGreaterThanOrEqual(1);
    expect(live.c).toBe(rgbOf(PLAN.ink!));
    expect(live.bg).toBe("rgba(0, 0, 0, 0)");
    const last = await page.locator(SCREEN).evaluate((root) => {
      const all = [
        ...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
      ];
      return all[all.length - 1]!.textContent;
    });
    expect(last).toBe("Cancel");
    const input = page.getByLabel("Type delete to confirm");
    await expect(input).toHaveClass(/wl-input/);
  });

  test("Delete account is unavailable offline with the existing line, available online", async ({
    page,
    context,
  }) => {
    await openCobalt(page);
    const open_ = page.getByRole("button", { name: "Delete account…" });
    await expect(open_).not.toHaveAttribute("aria-disabled", "true");
    await goOffline(page, context);
    await expect(open_).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Connect to delete your account.")).toBeVisible();
  });
});

test.describe("T-0613 AC5 contrast, targets, type, motion", () => {
  test("axe colour-contrast and every text pair are clean: closed, delete open, paper warning", async ({
    page,
  }) => {
    await openCobalt(page);
    await expectAxeContrast(page);
    await expectTextContrast(page);
    await page.getByRole("button", { name: "Delete account…" }).click();
    await expect(page.getByLabel("Type delete to confirm")).toBeVisible();
    await expectAxeContrast(page);
    await expectTextContrast(page);
  });

  test("axe colour-contrast and every text pair are clean on the paper warning", async ({
    page,
  }) => {
    await openPaper(page);
    await expectAxeContrast(page);
    await expectTextContrast(page);
  });

  test("every link, button, input and checkbox row is at least 44 x 44; no px font sizes", async ({
    page,
  }) => {
    await openCobalt(page);
    await page.getByRole("button", { name: "Delete account…" }).click();
    const boxes = await page
      .locator(`${SCREEN} :is(a, button, input:not([type="checkbox"]), label.wl-checkbox)`)
      .evaluateAll((els) =>
        els
          .map((el) => ({ n: el.textContent?.trim() || el.tagName, r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0)
          .map((x) => ({ n: x.n, w: x.r.width, h: x.r.height })),
      );
    expect(boxes.length).toBeGreaterThan(10);
    for (const b of boxes) {
      expect(b.w, `${b.n} w`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${b.n} h`).toBeGreaterThanOrEqual(44);
    }
    for (const f of ["plan.css", "excluded.css"]) {
      const css = readFileSync(
        resolve(__dirname, "../../apps/web/src/features/UF-11", f),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, f).not.toMatch(/font-size:\s*[\d.]+px/);
      expect(css, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  test("only the root cross-fade animates, and it is instant under reduced motion", async ({
    page,
  }) => {
    await openPaper(page);
    const moving = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.matches("[data-screen-id], nav.wl-tab-bar")) continue;
        const cs = getComputedStyle(el);
        const d = cs.transitionDuration.split(",").map((x) => parseFloat(x));
        if (
          d.some((x) => x > 0) ||
          (cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0)
        )
          out.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
      return out;
    });
    expect(moving).toEqual([]);
    const dur = () =>
      page.evaluate(
        () => getComputedStyle(document.querySelector("[data-screen-id]")!).transitionDuration,
      );
    expect(await dur()).toBe("0.2s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await dur()).toBe("0s");
  });
});

test.describe("T-0613 AC7 canvas compare (390 x 844)", () => {
  test("Account settings (turn-4)", async ({ page }, testInfo) => {
    await openCobalt(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-4",
      frame: "Account settings",
      name: "uf11-4-account",
    });
  });

  test("Account · delete panel open (turn-5)", async ({ page }, testInfo) => {
    await openDelete(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "Account · delete panel open",
      name: "uf11-4-delete-open",
    });
  });

  test("Account · unsynced sign-out (turn-5)", async ({ page }, testInfo) => {
    await openPaper(page);
    await compareWithCanvas(page, testInfo, {
      turn: "turn-5",
      frame: "Account · unsynced sign-out",
      name: "uf11-4-unsynced",
    });
  });
});
