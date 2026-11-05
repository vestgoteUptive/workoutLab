// T-0682 UF-11.3 Edit plan: the Level radiogroup and the level-only Save (D-0230, D-0233 §1–§3,
// D-0070 §3, D-0081 §2; docs/specs/editable-level.md AC1, AC2, AC4–AC6, AC13 save side).
//
// The point of the level-only path: rule 4 says level never changes targets, so a level-only
// Save must be ONE `profiles.update({ level })`. A target upsert would overwrite adapted targets,
// and a check-in withdraw would drop a pending proposal and reset the rule 9 streak.
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AREAS, type Area, type EngineProfile, type Level } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import type { PlanWrite, saveLevel } from "../save-plan.js";
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

const refreshAllSpy = vi.fn();
/** Lets AC8 make a refresh rewrite the cached profile, as another device's change would. */
const onRefresh: { current: (() => Promise<void>) | null } = { current: null };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshRoutines: vi.fn(async () => undefined),
    refreshAll: async () => {
      // The location at call time: the save's refresh runs on /plan/edit, before navigating;
      // UF-11.2 then runs its own mount refresh on /plan, which is not the save's.
      refreshAllSpy(document.querySelector('[data-testid="location"]')?.getAttribute("title"));
      await onRefresh.current?.();
    },
  };
});

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;
const HINTS = {
  beginner: "Under 6 months. We start with form-first variations like the goblet squat.",
  intermediate: "6 months to 2 years. Barbell basics plus targeted accessories.",
  advanced: "2+ years. Adds the most demanding lifts, like the barbell deadlift.",
} as const;
const NOTE = "Level changes which exercises we suggest, not your targets.";

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
  onRefresh.current = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  onRefresh.current = null;
  vi.restoreAllMocks();
});

/** F-profile of the ticket: fixture F at level beginner, full equipment, no priorities. */
function fProfile(overrides: Partial<EngineProfile> = {}): EngineProfile {
  return profileF({
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    ...overrides,
  });
}

/** How many times the SAVE refreshed the cache (calls made from /plan/edit). */
function saveRefreshes(): number {
  return refreshAllSpy.mock.calls.filter(([at]) => at === "/plan/edit").length;
}

/** Opens /plan/edit with a pending check-in (K4) and clears the mount refresh from the spies. */
async function openEdit(overrides: Partial<EngineProfile> = {}) {
  const db = freshDb();
  await seedCache(db, { profile: fProfile(overrides), targets: targetsF(), checkins: [K4] });
  renderPlan({ at: "/plan/edit" });
  await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
  await act(async () => {
    await Promise.resolve();
  });
  spy.reset();
  refreshAllSpy.mockClear();
  return db;
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
function chip(area: Area): HTMLElement {
  return screen.getByRole("button", { name: en.bodyMap.areas[area] });
}
function calls(): string[] {
  return spy.calls.map((c) => `${c.table}.${c.method}`);
}
function inLiveRegion(text: string): boolean {
  return screen
    .getAllByText(text)
    .some((el) => el.closest("[aria-live], [role=status], [role=alert]") !== null);
}

describe("T-0682 AC1 the Level group (spec AC1, D-0233 §1–§2)", () => {
  it("T-0682 AC1 a Level radiogroup sits after Goal and before the rhythm group", async () => {
    await openEdit();
    const goal = screen.getByRole("radiogroup", { name: "Goal" });
    const level = levelGroup();
    const rhythm = screen.getByRole("group", { name: u.rhythmGroup });
    expect(goal.compareDocumentPosition(level) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(level.compareDocumentPosition(rhythm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A radiogroup of native radios, not a <select> (no combobox, no listbox).
    expect(level.tagName).toBe("DIV");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(level.querySelector("select")).toBeNull();
  });

  it("T-0682 AC1 three radios Beginner/Intermediate/Advanced, each in a .wl-option label; Beginner is checked", async () => {
    await openEdit();
    const radios = within(levelGroup()).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("value"))).toEqual([
      "beginner",
      "intermediate",
      "advanced",
    ]);
    for (const name of ["Beginner", "Intermediate", "Advanced"]) {
      const radio = levelRadio(name);
      expect(radio).toBeInstanceOf(HTMLInputElement);
      expect(radio).toHaveAttribute("type", "radio");
      expect(radio).toHaveAttribute("name", "level");
      expect(radio.closest("label")).toHaveClass("wl-option");
    }
    expect(levelRadio("Beginner")).toBeChecked();
    expect(levelRadio("Intermediate")).not.toBeChecked();
    expect(levelRadio("Advanced")).not.toBeChecked();
  });

  it("T-0682 AC1 each radio's description is exactly its hint; the group's is the level note", async () => {
    await openEdit();
    expect(levelRadio("Beginner")).toHaveAccessibleDescription(HINTS.beginner);
    expect(levelRadio("Intermediate")).toHaveAccessibleDescription(HINTS.intermediate);
    expect(levelRadio("Advanced")).toHaveAccessibleDescription(HINTS.advanced);
    expect(levelGroup()).toHaveAccessibleDescription(NOTE);
    // All three captions are visible at once.
    for (const hint of Object.values(HINTS)) expect(screen.getByText(hint)).toBeVisible();
  });

  it("T-0682 AC1 none of the hints or the note is in a live region", async () => {
    await openEdit();
    for (const text of [...Object.values(HINTS), NOTE]) {
      expect(inLiveRegion(text), text).toBe(false);
    }
    // And no element under the group, nor the note, is a live region itself.
    expect(levelGroup().querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("T-0682 AC1 picking Intermediate leaves the preview identical and enables Save", async () => {
    await openEdit();
    const before = listRows(u.previewHeading);
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    await tap(levelRadio("Intermediate"));
    expect(levelRadio("Intermediate")).toBeChecked();
    expect(listRows(u.previewHeading)).toEqual(before);
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
  });
});

describe("T-0682 AC2 level-only save (spec AC2, D-0230 §2)", () => {
  it("T-0682 AC2 one call: profiles.update({ level: 'intermediate' }).eq(user_id); no targets, no check-ins", async () => {
    await openEdit();
    await tap(levelRadio("Intermediate"));
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(spy.from).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual(["profiles.update"]);
    expect(spy.calls[0]!.payload).toEqual({ level: "intermediate" });
    expect(spy.calls[0]!.filters).toEqual([{ op: "eq", column: "user_id", value: TEST_USER }]);
    expect(spy.from).not.toHaveBeenCalledWith("area_targets");
    expect(spy.from).not.toHaveBeenCalledWith("plan_checkins");
    expect(saveRefreshes()).toBe(1);
  });

  it("T-0682 AC2 saveLevel and PlanWrite take the shared Level union, not a free string", () => {
    // Type-level: `pnpm typecheck` fails if either widens to `string` (the generated DB type).
    expectTypeOf<Parameters<typeof saveLevel>[0]["level"]>().toEqualTypeOf<Level>();
    expectTypeOf<PlanWrite["level"]>().toEqualTypeOf<Level>();
  });
});

describe.each([["reject"], ["error"]] as const)(
  "T-0682 AC3 level-only save fails — the `%s` form",
  (form) => {
    it("T-0682 AC3 shows the alert, stays on /plan/edit, no refresh; a second tap retries and navigates", async () => {
      await openEdit();
      await tap(levelRadio("Intermediate"));
      spy.failOn("profiles", form);
      await tap(saveButton());

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(u.saveFailed));
      expect(location()).toBe("/plan/edit");
      expect(refreshAllSpy).not.toHaveBeenCalled();
      expect(calls()).toEqual(["profiles.update"]);
      expect(levelRadio("Intermediate")).toBeChecked();
      // savingRef and `saving` were released (T-0363 point 1): Save is live and a tap retries.
      expect(saveButton()).toHaveAttribute("aria-disabled", "false");
      await tap(saveButton());
      await waitFor(() => expect(location()).toBe("/plan"));
      expect(calls()).toEqual(["profiles.update", "profiles.update"]);
      expect(saveRefreshes()).toBe(1);
    });
  },
);

describe("T-0682 AC4 mixed save (spec AC4, D-0070 §3)", () => {
  it("T-0682 AC4 Advanced + back/hamstrings/arms: upsert, profiles with level, withdraw — in order", async () => {
    await openEdit();
    await tap(levelRadio("Advanced"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));
    await tap(chip("arms"));
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(calls()).toEqual(["area_targets.upsert", "profiles.update", "plan_checkins.update"]);
    const rows = spy.calls[0]!.payload as { area_id: Area; sets_per_14d: number; source: string }[];
    expect(rows.map((r) => r.area_id)).toEqual([...AREAS]);
    const by = (a: Area) => rows.find((r) => r.area_id === a)!.sets_per_14d;
    expect([by("back"), by("hamstrings"), by("arms")]).toEqual([25, 20, 15]);
    expect(rows.every((r) => r.source === "default")).toBe(true);
    expect(spy.calls[1]!.payload).toEqual({
      goal: "build_muscle",
      level: "advanced",
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: ["back", "arms", "hamstrings"],
    });
    expect(spy.calls[1]!.filters).toEqual([{ op: "eq", column: "user_id", value: TEST_USER }]);
    expect(spy.calls[2]!.filters).toEqual([{ op: "is", column: "answer", value: null }]);
  });

  it("T-0682 AC4 a goal-only change still makes all three writes, with level 'beginner'", async () => {
    await openEdit();
    await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(calls()).toEqual(["area_targets.upsert", "profiles.update", "plan_checkins.update"]);
    expect(spy.calls[1]!.payload).toMatchObject({ goal: "get_stronger", level: "beginner" });
  });
});

describe("T-0682 AC5 dirty and cancel (spec AC5)", () => {
  it("T-0682 AC5 Intermediate then Beginner: Save is aria-disabled and a tap writes nothing", async () => {
    await openEdit();
    await tap(levelRadio("Intermediate"));
    await tap(levelRadio("Beginner"));
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    await tap(saveButton());
    expect(spy.from).not.toHaveBeenCalled();
    expect(location()).toBe("/plan/edit");
  });

  it("T-0682 AC5 Advanced then Cancel: no write, location /plan", async () => {
    await openEdit();
    await tap(levelRadio("Advanced"));
    await tap(screen.getByRole("link", { name: u.cancel }));
    await waitFor(() => expect(location()).toBe("/plan"));
    expect(spy.from).not.toHaveBeenCalled();
  });
});

describe("T-0682 AC6 offline (spec AC6)", () => {
  it("T-0682 AC6 offline: Save stays disabled with 'Connect to save'; online enables it and the level-only save works", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await openEdit();
    await tap(levelRadio("Intermediate"));
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(u.connectToSave)).toBeInTheDocument();
    await tap(saveButton());
    expect(spy.from).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(levelRadio("Intermediate")).toBeChecked();
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));
    expect(calls()).toEqual(["profiles.update"]);
    expect(spy.calls[0]!.payload).toEqual({ level: "intermediate" });
  });
});

describe("T-0682 AC7 downgrade writes level only (spec AC13 save side)", () => {
  it("T-0682 AC7 intermediate → Beginner: the only write is profiles.update({ level: 'beginner' })", async () => {
    await openEdit({ level: "intermediate" });
    expect(levelRadio("Intermediate")).toBeChecked();
    await tap(levelRadio("Beginner"));
    await tap(saveButton());
    await waitFor(() => expect(location()).toBe("/plan"));

    expect(calls()).toEqual(["profiles.update"]);
    expect(spy.calls[0]!.payload).toEqual({ level: "beginner" });
    expect(spy.from).not.toHaveBeenCalledWith("favorite_exercises");
  });
});

describe("T-0682 AC8 the draft is fixed at first read (D-0081 §2)", () => {
  it("T-0682 AC8 a refresh delivering level advanced keeps Intermediate checked and the beginner baseline", async () => {
    const db = freshDb();
    await seedCache(db, { profile: fProfile(), targets: targetsF(), checkins: [K4] });
    onRefresh.current = async () => {
      await db.profileCache.put({ userId: TEST_USER, profile: fProfile({ level: "advanced" }) });
    };
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
    await tap(levelRadio("Intermediate"));

    // Let the refresh and the second cache read complete.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(levelRadio("Intermediate")).toBeChecked();
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
    // Baseline still beginner: going back to Beginner disables Save (against "advanced" it would not).
    await tap(levelRadio("Beginner"));
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });
});
