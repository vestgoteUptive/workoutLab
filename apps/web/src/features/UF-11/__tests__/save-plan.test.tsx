// T-0308b UF-11.3 Save: AC-B11 (order and exact payloads, D-0070 §3), AC-B12 (partial failure
// and double submit), AC-B13 (offline, D-0070 §7), AC-B14 (cancel).
//
// The one thing this file exists to stop: a green suite over a half-written plan. The three
// writes are not one transaction, so when (2) or (3) fails the user's row state is genuinely
// split — targets written, profile not. Every failure case below therefore asserts the OBSERVABLE
// state (which tables were written, which were not, what the screen says, where the user is, and
// that a retry re-runs from step 1), not merely that an error message appeared.
//
// And every failure case runs in BOTH forms. supabase-js resolves `{data, error}` on a 4xx/5xx
// and never throws, so a `try/catch` alone would catch the reject form and sail straight past the
// returned-error form — which is the form the real server produces. `mode: "error"` is that form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AREAS, type Area } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { F_SETS, NOW_ISO, TZ, profileF, targetsF } from "./fixtures.js";
import {
  type FromBuilder,
  type SpyCall,
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

const refreshAllSpy = vi.fn(async () => undefined);
const refreshAllRejects = { current: false };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshRoutines: vi.fn(async () => undefined),
    refreshAll: async () => {
      refreshAllSpy();
      await Promise.resolve();
      if (refreshAllRejects.current) throw new Error("refreshAll failed");
    },
  };
});

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;

async function tap(element: HTMLElement | null): Promise<void> {
  await act(async () => {
    fireEvent.click(element!);
  });
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  refreshAllSpy.mockClear();
  refreshAllRejects.current = false;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  refreshAllRejects.current = false;
  vi.restoreAllMocks();
});

/** Opens /plan/edit over fixture F and waits for the preview. */
async function openEdit(profileOverrides: Parameters<typeof profileF>[0] = {}) {
  const db = freshDb();
  await seedCache(db, { profile: profileF(profileOverrides), targets: targetsF() });
  const view = renderPlan({ at: "/plan/edit" });
  await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
  // `usePlanData` runs its own cache-first `refreshAll` on mount when online. Clearing both
  // spies here makes every assertion below about the SAVE's calls only, so "refreshAll was not
  // called" means "the save did not reach it".
  await act(async () => {
    await Promise.resolve();
  });
  spy.reset();
  refreshAllSpy.mockClear();
  return view;
}

function chip(area: Area): HTMLElement {
  return screen.getByRole("button", { name: en.bodyMap.areas[area] });
}
function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: u.save });
}

/** Taps Back, Hamstrings and Arms, the AC-B11 draft. */
async function selectThree(): Promise<void> {
  await tap(chip("back"));
  await tap(chip("hamstrings"));
  await tap(chip("arms"));
}

/** Which tables were written, in call order. */
function writtenTables(): string[] {
  return spy.calls.map((c) => c.table);
}

/** The nth recorded call, asserted to exist so the test names the real problem when it doesn't. */
function callAt(index: number): SpyCall {
  const call = spy.calls[index];
  expect(call, `expected at least ${index + 1} supabase call(s)`).toBeDefined();
  return call!;
}

// ------------------------------------------------------------------------------------------
// AC-B11
// ------------------------------------------------------------------------------------------

describe("AC-B11 Save: order and exact payloads (D-0070 §3)", () => {
  it("records exactly area_targets.upsert, profiles.update, plan_checkins.update, in that order", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "area_targets.upsert",
      "profiles.update",
      "plan_checkins.update",
    ]);
  });

  it("(1) upserts 9 rows with exactly area_id/sets_per_14d/source and onConflict user_id,area_id", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBe(3));

    const call = callAt(0);
    expect(call.options).toEqual({ onConflict: "user_id,area_id" });
    const rows = call.payload as { area_id: string; sets_per_14d: number; source: string }[];
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["area_id", "sets_per_14d", "source"]);
      expect(row.source).toBe("default");
    }
    expect(rows.map((r) => r.area_id)).toEqual([...AREAS]);
    const by = (area: string) => rows.find((r) => r.area_id === area)!.sets_per_14d;
    expect(by("back")).toBe(25);
    expect(by("hamstrings")).toBe(20);
    expect(by("arms")).toBe(15);
    // The rest keep F's numbers.
    for (const area of ["chest", "shoulders", "core", "glutes", "quads", "calves"] as Area[]) {
      expect(by(area)).toBe(F_SETS[AREAS.indexOf(area)]);
    }
  });

  it("(2) updates profiles with EXACTLY four keys and eq(user_id, <signed-in id>)", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBe(3));

    const call = callAt(1);
    expect(call.payload).toEqual({
      goal: "build_muscle",
      rhythm_min: 3,
      rhythm_max: 4,
      // The fixed area order: in AREAS, `arms` precedes `hamstrings` (D-0081 §3).
      priority_areas: ["back", "arms", "hamstrings"],
    });
    // No level, equipment, onboarded_at or plan_changed_at: those come from the triggers.
    expect(Object.keys(call.payload as object).sort()).toEqual([
      "goal",
      "priority_areas",
      "rhythm_max",
      "rhythm_min",
    ]);
    expect(call.filters).toEqual([{ op: "eq", column: "user_id", value: TEST_USER }]);
  });

  it("(3) withdraws every unanswered check-in with is(answer, null) and the injected `now`", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBe(3));

    const call = callAt(2);
    expect(call.payload).toEqual({ answer: "withdrawn", answered_at: NOW_ISO });
    expect(call.filters).toEqual([{ op: "is", column: "answer", value: null }]);
  });

  it("then refreshAll runs, then the location is /plan", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));
    expect(refreshAllSpy).toHaveBeenCalled();
  });

  it("contrast: no insert or delete on any table, and no call to sessions, session_sets or routines", async () => {
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.calls.some((c) => c.method === "insert")).toBe(false);
    expect(spy.calls.some((c) => c.method === "delete")).toBe(false);
    expect(spy.calls.some((c) => c.method === "select")).toBe(false);
    for (const table of ["sessions", "session_sets", "session_sets_live", "routines"]) {
      expect(writtenTables()).not.toContain(table);
    }
  });
});

// ------------------------------------------------------------------------------------------
// AC-B12 — every case in BOTH failure forms
// ------------------------------------------------------------------------------------------

// `reject` is the thrown form. `error` is the form supabase-js actually produces on a 4xx/5xx:
// the promise RESOLVES with `{data: null, error}`. A `try/catch` alone catches only the first, so
// running both is what stops a half-written plan from shipping behind a green suite.
const FAILURE_FORMS = [["reject"], ["error"]] as const;

describe.each(FAILURE_FORMS)("AC-B12 partial failure — the `%s` form", (form) => {
  it("(1) fails: (2) and (3) never run, the error shows, the draft stands, and we stay on /plan/edit", async () => {
    await openEdit();
    await selectThree();
    spy.failOn("area_targets", form);
    await tap(saveButton());

    await waitFor(() => expect(screen.getByText(u.saveFailed)).toBeInTheDocument());
    // The observable state: ONLY step 1 was attempted. Nothing was written.
    expect(writtenTables()).toEqual(["area_targets"]);
    expect(writtenTables()).not.toContain("profiles");
    expect(writtenTables()).not.toContain("plan_checkins");
    // The draft is intact: the three chips are still pressed.
    expect(AREAS.filter((a) => chip(a).getAttribute("aria-pressed") === "true")).toEqual([
      "back",
      "arms",
      "hamstrings",
    ]);
    expect(location()).toBe("/plan/edit");
    expect(refreshAllSpy).not.toHaveBeenCalled();
  });

  it("(2) fails: (3) never runs — the user is left with targets written and the profile NOT, and told so", async () => {
    await openEdit();
    await selectThree();
    spy.failOn("profiles", form);
    await tap(saveButton());

    await waitFor(() => expect(screen.getByText(u.saveFailed)).toBeInTheDocument());
    // The half-saved state this AC exists for: step 1 landed, step 2 did not, step 3 was never
    // attempted, so no pending proposal was silently withdrawn against a plan that never changed.
    expect(writtenTables()).toEqual(["area_targets", "profiles"]);
    expect(writtenTables()).not.toContain("plan_checkins");
    expect(location()).toBe("/plan/edit");
    expect(refreshAllSpy).not.toHaveBeenCalled();
    // And the draft is still the user's, so nothing is lost on retry.
    expect(AREAS.filter((a) => chip(a).getAttribute("aria-pressed") === "true")).toEqual([
      "back",
      "arms",
      "hamstrings",
    ]);
  });

  it("(3) fails: the message shows and there is NO navigation", async () => {
    await openEdit();
    await selectThree();
    spy.failOn("plan_checkins", form);
    await tap(saveButton());

    await waitFor(() => expect(screen.getByText(u.saveFailed)).toBeInTheDocument());
    expect(writtenTables()).toEqual(["area_targets", "profiles", "plan_checkins"]);
    expect(location()).toBe("/plan/edit");
    expect(refreshAllSpy).not.toHaveBeenCalled();
  });

  it("a retry re-runs from (1), whichever step failed (D-0081 §2: the baseline never moves)", async () => {
    await openEdit();
    await selectThree();
    // Fail step (2) first. `failOn` is one-shot, so the retry succeeds.
    spy.failOn("profiles", form);
    await tap(saveButton());
    await waitFor(() => expect(screen.getByText(u.saveFailed)).toBeInTheDocument());

    // Save must still be enabled: the baseline is the loaded snapshot, not what got written.
    expect(saveButton()).toBeEnabled();
    spy.reset();
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    // The retry re-ran from step (1), it did not resume at (2).
    expect(spy.calls.map((c) => `${c.table}.${c.method}`)).toEqual([
      "area_targets.upsert",
      "profiles.update",
      "plan_checkins.update",
    ]);
    const rows = callAt(0).payload as { area_id: string; sets_per_14d: number }[];
    expect(rows.find((r) => r.area_id === "back")!.sets_per_14d).toBe(25);
  });

  it("the error message clears when the retry succeeds", async () => {
    await openEdit();
    await selectThree();
    spy.failOn("area_targets", form);
    await tap(saveButton());
    await waitFor(() => expect(screen.getByText(u.saveFailed)).toBeInTheDocument());
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));
    expect(screen.queryByText(u.saveFailed)).not.toBeInTheDocument();
  });
});

describe("AC-B12 double submit and a failed refresh", () => {
  it("a double click gives exactly ONE call of each step", async () => {
    await openEdit();
    await selectThree();
    // Both clicks are dispatched before anything is awaited, which is the real double tap.
    await act(async () => {
      fireEvent.click(saveButton());
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.calls.filter((c) => c.table === "area_targets")).toHaveLength(1);
    expect(spy.calls.filter((c) => c.table === "profiles")).toHaveLength(1);
    expect(spy.calls.filter((c) => c.table === "plan_checkins")).toHaveLength(1);
    expect(spy.calls).toHaveLength(3);
  });

  it("Save is disabled while a save is in flight", async () => {
    await openEdit();
    await selectThree();
    // Hold step (1) open so the in-flight state is observable.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = spy.from.getMockImplementation() as (table: string) => FromBuilder;
    spy.from.mockImplementation((table: string): FromBuilder => {
      const builder = original(table);
      if (table !== "area_targets") return builder;
      return {
        ...builder,
        // Step (1) waits on the gate, so "a save is in flight" is observable.
        upsert: (payload: unknown, options?: unknown) =>
          gate.then(() => builder.upsert(payload, options)),
      };
    });

    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());
    await act(async () => {
      release();
    });
    await waitFor(() => expect(location()).toBe("/plan"));
  });

  it("a REJECTED refreshAll after three successful writes still navigates, with no error", async () => {
    refreshAllRejects.current = true;
    await openEdit();
    await selectThree();
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.calls).toHaveLength(3);
    expect(refreshAllSpy).toHaveBeenCalled();
    expect(screen.queryByText(u.saveFailed)).not.toBeInTheDocument();
  });
});

// ------------------------------------------------------------------------------------------
// AC-B13
// ------------------------------------------------------------------------------------------

describe("AC-B13 offline (D-0070 §7)", () => {
  it("offline with a changed draft: Save is disabled and `Connect to save` shows", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await openEdit();
    await tap(chip("back"));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(u.connectToSave)).toBeInTheDocument();
    expect(spy.from).not.toHaveBeenCalled();
  });

  it("an `online` event enables Save WITHOUT a remount, and `offline` disables it again", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await openEdit();
    await tap(chip("back"));
    expect(saveButton()).toBeDisabled();

    onLine.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(u.connectToSave)).not.toBeInTheDocument();

    onLine.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(u.connectToSave)).toBeInTheDocument();
  });

  it("the chips, steppers and preview all still work offline, with the same values as online", async () => {
    // The preview is computed on the device, so going offline cannot change a number. The two
    // runs below are the same taps under the two connectivity states, compared row for row.
    async function tapsAndRead(online: boolean): Promise<string[]> {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
      await openEdit();
      await tap(chip("back"));
      await tap(chip("hamstrings"));
      await tap(chip("arms"));
      await tap(screen.getByRole("button", { name: u.increaseMin }));
      const rows = listRows(u.previewHeading);
      const rhythm = screen.getByRole("group", { name: u.rhythmGroup }).querySelector("p")!
        .textContent;
      expect(rhythm).toBe("4–4 per week · 8–8 per 14 days");
      expect(AREAS.filter((a) => chip(a).getAttribute("aria-pressed") === "true")).toEqual([
        "back",
        "arms",
        "hamstrings",
      ]);
      cleanup();
      return rows;
    }

    const offlineRows = await tapsAndRead(false);
    // Offline, not a single write was attempted along the way.
    expect(spy.from).not.toHaveBeenCalled();
    const onlineRows = await tapsAndRead(true);

    expect(offlineRows).toEqual(onlineRows);
    // And the values are the engine's, not a placeholder: 4-4 with those three priorities.
    expect(offlineRows[AREAS.indexOf("back")]).toBe("Back 29");
    expect(offlineRows[AREAS.indexOf("chest")]).toBe("Chest 23");
  });
});

// ------------------------------------------------------------------------------------------
// AC-B14
// ------------------------------------------------------------------------------------------

describe("AC-B14 cancel", () => {
  it("after changing all three controls, Cancel goes to /plan and writes NOTHING", async () => {
    await openEdit();
    await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    await tap(chip("back"));

    await tap(screen.getByRole("link", { name: u.cancel }));
    await waitFor(() => expect(location()).toBe("/plan"));
    // The AC's claim: the SPY records no call. UF-11.2's own cache-first refresh on arrival is
    // not a write and is not `supabase.from`, so it is not asserted against here.
    expect(spy.from).not.toHaveBeenCalled();
    expect(spy.calls).toEqual([]);
  });

  it("reopening /plan/edit shows the F values again — the draft was discarded, not persisted", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));

    await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    await tap(chip("back"));
    await tap(screen.getByRole("link", { name: u.cancel }));
    await waitFor(() => expect(location()).toBe("/plan"));

    // A fresh mount over the same, untouched cache.
    cleanup();
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
    expect(screen.getByRole("radio", { name: u.goals.build_muscle })).toBeChecked();
    expect(
      screen.getByRole("group", { name: u.rhythmGroup }).querySelector("p")!.textContent,
    ).toBe("3–4 per week · 6–8 per 14 days");
    expect(AREAS.filter((a) => chip(a).getAttribute("aria-pressed") === "true")).toEqual([]);
    expect(listRows(u.previewHeading)).toEqual(
      AREAS.map((a, i) => `${en.bodyMap.areas[a]} ${F_SETS[i]}`),
    );
    expect(saveButton()).toBeDisabled();
  });

  it("Cancel has no confirm step: one tap navigates", async () => {
    await openEdit();
    await tap(chip("back"));
    await tap(screen.getByRole("link", { name: u.cancel }));
    await waitFor(() => expect(location()).toBe("/plan"));
  });
});
