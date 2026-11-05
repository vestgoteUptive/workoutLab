// T-0682 UF-11.3 QA additions (qa-tester). Three gaps the builder's edit-plan-level.test.tsx left
// open, each found with a planted fault that stayed green:
// - QA-1 (spec AC2 "refreshAll runs", spec "Engine re-suggest"): the REAL `refreshAll` after a
//   level-only Save puts the new level into the cached profile that UF-08.5 reads (`loadProfile`),
//   and it has finished BEFORE the app leaves /plan/edit. A Save that navigated with the refresh
//   still in flight (`void refreshAll(...)`) passed every builder test.
// - QA-2 (spec AC4 "with or without level"): goal AND level changed together is a mixed save, the
//   three D-0070 §3 writes, never the level-only path.
// - QA-3 (D-0233 §1, native radios): the Level radios are keyboard-operable: the checked one is in
//   the Tab order and an arrow key's default is not suppressed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Tables } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { loadProfile } from "../../../lib/offline/index.js";
import { K4, TZ, profileF, targetsF } from "./fixtures.js";
import {
  TEST_USER,
  createFromSpy,
  freshDb,
  listRows,
  location,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

const u = en.uf11;

// ---------------------------------------------------------------------------------------------
// A tiny in-memory supabase for QA-1: one `profiles` row that `update().eq()` really changes and
// `select("*").maybeSingle()` really returns (after a delay, so an un-awaited refresh is visibly
// unfinished); every other read is empty. QA-2/QA-3 use the shared recording spy instead.
// ---------------------------------------------------------------------------------------------
type ProfileRow = Tables<"profiles">;
const server: { profile: ProfileRow | null; writes: string[] } = { profile: null, writes: [] };
const mode: { fake: boolean } = { fake: false };
const spy = createFromSpy({ emptyReads: true });

function profileRow(level: string): ProfileRow {
  return {
    user_id: TEST_USER,
    goal: "build_muscle",
    level,
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    rhythm_min: 3,
    rhythm_max: 4,
    priority_areas: [],
    onboarded_at: "2026-08-02T08:00:00Z",
    plan_changed_at: "2026-08-02T08:00:00Z",
    bar_kg: null,
    plates_kg: null,
  } as unknown as ProfileRow;
}

function fakeFrom(table: string) {
  let op: "select" | "update" | "other" = "other";
  let patch: Record<string, unknown> = {};
  const eqs: [string, unknown][] = [];
  const settle = async (single: boolean) => {
    if (op === "update") {
      server.writes.push(`${table}.update`);
      if (table === "profiles" && server.profile) {
        const [col, val] = eqs[0] ?? [];
        if (col === "user_id" && val === server.profile.user_id)
          Object.assign(server.profile, patch);
      }
      return { data: null, error: null, status: 204 };
    }
    if (op === "select" && table === "profiles") {
      await new Promise((r) => setTimeout(r, 30));
      const row = server.profile ? { ...server.profile } : null;
      return { data: single ? row : row ? [row] : [], error: null, status: 200 };
    }
    if (op === "other") server.writes.push(`${table}.write`);
    return { data: single ? null : [], error: null, status: 200 };
  };
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (a?: (v: unknown) => unknown, b?: (e: unknown) => unknown) =>
            settle(false).then(a, b);
        }
        if (prop === "maybeSingle" || prop === "single") return () => settle(true);
        if (prop === "eq") {
          return (col: string, val: unknown) => {
            eqs.push([col, val]);
            return chain;
          };
        }
        return () => chain;
      },
    },
  );
  return {
    select: () => ((op = "select"), chain),
    update: (p: Record<string, unknown>) => ((op = "update"), (patch = p), chain),
    upsert: () => chain,
    insert: () => chain,
    delete: () => chain,
  };
}

vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => (mode.fake ? fakeFrom(table) : spy.from(table)) },
  isSupabaseConfigured: () => true,
}));

/** Every refreshAll run, so a test can tell the save's refresh apart and drain the rest. */
const refresh: { armed: boolean; saveDone: boolean | null; runs: Promise<unknown>[] } = {
  armed: false,
  saveDone: null,
  runs: [],
};

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: (...args: Parameters<typeof actual.refreshAll>) => {
      if (!mode.fake) return Promise.resolve();
      const run = actual.refreshAll(...args);
      if (refresh.armed && refresh.saveDone === null) {
        // The first refresh after the Save tap is the save's own.
        refresh.saveDone = false;
        void run.then(() => {
          refresh.saveDone = true;
        });
      }
      refresh.runs.push(run.catch(() => undefined));
      return run;
    },
  };
});

async function tap(element: HTMLElement | null): Promise<void> {
  await act(async () => {
    fireEvent.click(element!);
  });
}
function levelGroup(): HTMLElement {
  return screen.getByRole("radiogroup", { name: "Level" });
}
function levelRadio(name: string): HTMLElement {
  return within(levelGroup()).getByRole("radio", { name });
}
function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: u.save });
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  mode.fake = false;
  server.profile = null;
  server.writes = [];
  refresh.armed = false;
  refresh.saveDone = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(async () => {
  cleanup();
  await Promise.all(refresh.runs.splice(0));
  signOut();
  mode.fake = false;
  vi.restoreAllMocks();
});

function fProfile() {
  return profileF({
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  });
}

describe("T-0682 QA-1 the cached profile picks up the new level (the user's bug)", () => {
  it("T-0682 QA-1 level-only Save: the real refresh writes level intermediate to the cache UF-08.5 reads, before leaving /plan/edit", async () => {
    mode.fake = true;
    server.profile = profileRow("beginner");
    const db = freshDb();
    await seedCache(db, { profile: fProfile(), targets: targetsF(), checkins: [K4] });
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
    // Let the mount refresh finish, so the only refresh left is the save's.
    await act(async () => {
      await Promise.all(refresh.runs.splice(0));
    });
    expect((await loadProfile())?.level).toBe("beginner");
    server.writes = [];

    // Snapshot, at the moment the location turns to /plan, whether the save's refresh is done.
    let doneAtNavigation: boolean | null = null;
    let writesAtNavigation: string[] = [];
    const probe = document.querySelector('[data-testid="location"]')!;
    const observer = new MutationObserver(() => {
      if (probe.getAttribute("title") === "/plan" && doneAtNavigation === null) {
        doneAtNavigation = refresh.saveDone;
        writesAtNavigation = [...server.writes];
      }
    });
    observer.observe(probe, { attributes: true });

    await tap(levelRadio("Intermediate"));
    refresh.armed = true;
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));
    observer.disconnect();
    await act(async () => {
      await Promise.all(refresh.runs.splice(0));
    });

    // The Save's own writes (UF-11.2 may write after it mounts; that is not this Save).
    expect(writesAtNavigation).toEqual(["profiles.update"]);
    expect(server.profile!.level).toBe("intermediate");
    // The refresh had finished when the app left Edit plan, so the next screen's read is fresh.
    expect(doneAtNavigation).toBe(true);
    // The cache UF-08 / UF-08.5 load from (`loadProfile`) now holds the new level, no reload.
    expect((await loadProfile())?.level).toBe("intermediate");
  });
});

describe("T-0682 QA-2 goal and level together is a mixed save", () => {
  it("T-0682 QA-2 Get stronger + Advanced: upsert, profiles with goal AND level, withdraw", async () => {
    const db = freshDb();
    await seedCache(db, { profile: fProfile(), targets: targetsF(), checkins: [K4] });
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
    spy.reset();

    await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
    await tap(levelRadio("Advanced"));
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "area_targets.upsert",
      "profiles.update",
      "plan_checkins.update",
    ]);
    expect(spy.calls[1]!.payload).toEqual({
      goal: "get_stronger",
      level: "advanced",
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
    });
  });
});

describe("T-0682 QA-3 the Level radios are keyboard-operable", () => {
  it("T-0682 QA-3 the checked Level radio is tabbable and an arrow key's default is not suppressed", async () => {
    const db = freshDb();
    await seedCache(db, { profile: fProfile(), targets: targetsF(), checkins: [K4] });
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));

    const radios = within(levelGroup()).getAllByRole("radio") as HTMLInputElement[];
    for (const r of radios) {
      expect(r).not.toBeDisabled();
      expect(r.tabIndex).toBeGreaterThanOrEqual(0);
      expect(r.name).toBe("level");
    }
    const beginner = levelRadio("Beginner");
    beginner.focus();
    expect(beginner).toHaveFocus();
    // The browser moves to and checks the next same-name radio unless keydown is cancelled.
    const proceed = fireEvent.keyDown(beginner, { key: "ArrowDown", code: "ArrowDown" });
    expect(proceed).toBe(true);
    // That default action, as a browser applies it: focus and check Intermediate.
    const next = levelRadio("Intermediate");
    const proceedNext = fireEvent.keyDown(next, { key: "ArrowUp", code: "ArrowUp" });
    expect(proceedNext).toBe(true);
    next.focus();
    await tap(next);
    expect(next).toBeChecked();
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
  });
});
