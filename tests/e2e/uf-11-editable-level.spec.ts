// T-0686a UF-11.3 / UF-11.2 / UF-11.6 (D-0230, D-0231, D-0233, D-0178): the editable level, end to
// end in a real browser. Level-only Save is one PATCH profiles and keeps the pending check-in; the
// favorites -> Change level -> Save round trip returns with focus on the UF-11.6 title; a downgrade
// keeps the favorite; axe and the 44 px targets.
//
// Not repeated here: the `from=` Cancel/Save landing, the open-redirect set and the offline
// Cancel are `uf-11-return-favorites.spec.ts` (T-0683b, AC5 of this ticket); arrow-key movement
// through the Level group is `uf-11-level-keyboard.spec.ts` (T-0689).
//
// The profile route is stateful: a PATCH body is merged into the row the next GET serves, so the
// app's `refreshAll` after Save sees the new level. Supabase data is mocked; `test` is the guarded
// fixture (an unmocked request or a console error fails the test).
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/guarded-test.js";
import {
  injectSession,
  mockSupabaseAuth,
  mockSupabaseData,
  mockSupabaseRest,
  VITE_SUPABASE_URL,
} from "./fixtures/supabase-mock.js";
import { exerciseAreas, exerciseVariants, exercises } from "./fixtures/uf-04-library-data.js";
import { settledBox } from "./helpers/settled-box.js";
import { AREA_TARGETS, CHECKINS, PROFILE } from "./fixtures/uf-11-plan.js";

const FULL_EQUIPMENT = ["dumbbell", "bench", "barbell", "rack", "cable", "machine", "pullup-bar"];
const AT = "2026-10-08T10:00:00.000Z";
const CHECKIN_CARD = '[data-part="checkin-card"]';

type Level = "beginner" | "intermediate" | "advanced";

interface Opts {
  level: Level;
  favorites?: string[];
}

/** Every non-GET `/rest/v1/` request after `arm()`, as `${method} ${table}` plus its JSON body. */
interface WriteLog {
  entries: { call: string; body: unknown }[];
  arm: () => void;
}

async function open(page: Page, path: string, opts: Opts): Promise<WriteLog> {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabaseAuth(page);
  await mockSupabaseRest(page);
  const row: Record<string, unknown> = {
    ...PROFILE,
    level: opts.level,
    equipment: FULL_EQUIPMENT,
  };
  await mockSupabaseData(page, {
    sets: [],
    exercises,
    exerciseAreas,
    exerciseVariants,
    areaTargets: AREA_TARGETS,
    profile: row,
    checkins: CHECKINS,
    favoriteExercises: (opts.favorites ?? []).map((id) => ({ exercise_id: id, created_at: AT })),
  });
  // Stateful profile: a PATCH is applied to the row the next GET serves.
  await page.route(`${VITE_SUPABASE_URL}/rest/v1/profiles*`, async (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      Object.assign(row, req.postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({ status: 200, json: row });
  });
  // The other tables a save may touch. They answer success so a stray write shows in the log
  // instead of failing the save. `plan_checkins` keeps a POST (the proposal the card inserts the
  // first time it is shown), as the real table would, so a later visit does not insert it again.
  const checkins: unknown[] = [...CHECKINS];
  for (const table of ["area_targets", "plan_checkins"]) {
    await page.route(`${VITE_SUPABASE_URL}/rest/v1/${table}*`, async (route) => {
      const req = route.request();
      const method = req.method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          json: table === "area_targets" ? AREA_TARGETS : checkins,
        });
        return;
      }
      if (table === "plan_checkins" && method === "POST") {
        checkins.push({
          id: `P${checkins.length}`,
          answered_at: null,
          ...(req.postDataJSON() as object),
        });
      }
      await route.fulfill({ status: method === "POST" ? 201 : 204, body: "" });
    });
  }
  const log: WriteLog = {
    entries: [],
    arm: () => {
      armed = true;
    },
  };
  let armed = false;
  page.on("request", (r) => {
    const method = r.method();
    if (!armed || method === "GET" || method === "HEAD") return;
    const { pathname } = new URL(r.url());
    if (!pathname.startsWith("/rest/v1/")) return;
    log.entries.push({
      call: `${method} ${pathname.replace("/rest/v1/", "")}`,
      body: r.postDataJSON() as unknown,
    });
  });
  await page.goto("/");
  await injectSession(page);
  await page.goto(path);
  return log;
}

const pathname = (page: Page): string => new URL(page.url()).pathname;
const levelGroup = (page: Page): Locator => page.getByRole("radiogroup", { name: "Level" });
const levelRadio = (page: Page, name: "Beginner" | "Intermediate" | "Advanced"): Locator =>
  levelGroup(page).getByRole("radio", { name, exact: true });
const save = (page: Page): Locator => page.getByRole("button", { name: "Save", exact: true });
const title = (page: Page): Locator =>
  page.getByRole("heading", { level: 1, name: "Favorite exercises" });
const NOTICE = "Your level is Beginner. Some favorites are above it.";

async function seriousAxe(page: Page, screen: string): Promise<unknown[]> {
  const axe = await new AxeBuilder({ page }).include(`[data-screen-id="${screen}"]`).analyze();
  return axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test("T-0686a AC1 a level-only save is one PATCH profiles { level } and keeps the check-in", async ({
  page,
}) => {
  const log = await open(page, "/plan", { level: "beginner" });
  await expect(page.locator(CHECKIN_CARD)).toBeVisible();
  await page.getByRole("link", { name: "Edit plan" }).click();
  await expect(levelRadio(page, "Beginner")).toBeChecked();
  await levelRadio(page, "Intermediate").check();
  log.arm();
  await save(page).click();

  await expect(page.locator('[data-screen-id="UF-11.2"]')).toBeVisible();
  await expect(page.getByText("Intermediate", { exact: true })).toBeVisible();
  await expect(page.locator(CHECKIN_CARD)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  expect(pathname(page)).toBe("/plan");
  expect(log.entries).toEqual([{ call: "PATCH profiles", body: { level: "intermediate" } }]);
});

test("T-0686a AC2 a mixed save writes targets, profile, then withdraws the check-in", async ({
  page,
}) => {
  const log = await open(page, "/plan/edit", { level: "beginner" });
  await levelRadio(page, "Advanced").check();
  await page.getByRole("button", { name: /^Back/ }).click();
  log.arm();
  await save(page).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator(CHECKIN_CARD)).toHaveCount(0);
  expect(log.entries.map((e) => e.call)).toEqual([
    "POST area_targets",
    "PATCH profiles",
    "PATCH plan_checkins",
  ]);
  expect(log.entries[1]?.body).toMatchObject({ level: "advanced", priority_areas: ["back"] });
});

test("T-0686a AC3 favorites -> Change level -> Save returns with focus on the title", async ({
  page,
}) => {
  await open(page, "/plan/favorites", {
    level: "beginner",
    favorites: ["pull-up", "back-squat"],
  });
  await expect(page.getByText(NOTICE)).toBeVisible();
  await expect(page.getByText("Above your level", { exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "Change level" }).click();
  expect(pathname(page)).toBe("/plan/edit");
  expect(new URL(page.url()).search).toBe("?from=favorites");

  await levelRadio(page, "Intermediate").check();
  await save(page).click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(title(page)).toBeFocused();
  await expect(page.getByText("Pull-up").first()).toBeVisible();
  await expect(page.getByText("Above your level", { exact: true })).toHaveCount(0);
  await expect(page.getByText(NOTICE)).toHaveCount(0);
});

test("T-0686a AC4 Cancel from favorites returns with focus on the title and writes nothing", async ({
  page,
}) => {
  const log = await open(page, "/plan/favorites", {
    level: "beginner",
    favorites: ["pull-up", "back-squat"],
  });
  await page.getByRole("link", { name: "Change level" }).click();
  await expect(levelGroup(page)).toBeVisible();
  await levelRadio(page, "Advanced").check();
  log.arm();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/favorites$/);
  await expect(title(page)).toBeFocused();
  await expect(page.getByText(NOTICE)).toBeVisible();
  expect(log.entries).toEqual([]);
});

test("T-0686a AC6 a downgrade keeps the favorite and shows the notice", async ({ page }) => {
  const log = await open(page, "/plan/edit", { level: "intermediate", favorites: ["pull-up"] });
  await expect(levelRadio(page, "Intermediate")).toBeChecked();
  await levelRadio(page, "Beginner").check();
  log.arm();
  await save(page).click();
  await expect(page).toHaveURL(/\/plan$/);
  expect(log.entries).toEqual([{ call: "PATCH profiles", body: { level: "beginner" } }]);

  await page.goto("/plan/favorites");
  await expect(page.getByText("Pull-up").first()).toBeVisible();
  await expect(page.getByText("Above your level", { exact: true })).toHaveCount(1);
  await expect(page.getByText(NOTICE)).toBeVisible();
  expect(log.entries.map((e) => e.call)).not.toContain("DELETE favorite_exercises");
  expect(log.entries).toHaveLength(1);
});

test("T-0686a AC7 axe is clean and the level targets are at least 44 px", async ({ page }) => {
  await open(page, "/plan/favorites", { level: "beginner", favorites: ["pull-up"] });
  const link = page.getByRole("link", { name: "Change level" });
  await expect(link).toBeVisible();
  expect(await seriousAxe(page, "UF-11.6")).toEqual([]);
  const box = await settledBox(link);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Tab"); // walk to the link, then read its ring
  await link.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  const ring = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow };
  });
  const hasRing = (ring.style !== "none" && ring.width === "2px") || ring.shadow !== "none";
  expect(hasRing, JSON.stringify(ring)).toBe(true);

  await link.click();
  await expect(levelGroup(page)).toBeVisible();
  expect(await seriousAxe(page, "UF-11.3")).toEqual([]);
  for (const name of ["Beginner", "Intermediate", "Advanced"] as const) {
    const row = await settledBox(levelRadio(page, name).locator("xpath=ancestor::label[1]"));
    expect(row?.height ?? 0, `${name} row height`).toBeGreaterThanOrEqual(44);
    expect(row?.width ?? 0, `${name} row width`).toBeGreaterThanOrEqual(44);
  }
});

test("T-0686a AC8 offline Save is disabled with Connect to save, and returns online", async ({
  page,
}) => {
  await open(page, "/plan/edit", { level: "beginner" });
  await levelRadio(page, "Intermediate").check();
  await expect(save(page)).not.toHaveAttribute("aria-disabled", "true");
  await page.context().setOffline(true);
  await expect(save(page)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Connect to save")).toBeVisible();
  await page.context().setOffline(false);
  await expect(save(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Connect to save")).toHaveCount(0);
});
