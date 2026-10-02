// T-0308b UF-11.3 Edit plan: AC-B7 (initial state, Save disabled while unchanged, D-0081 §2),
// AC-B8 (priorities, preview, the ≤ 3 limit), AC-B9 (rhythm steppers), AC-B10 (the engine's
// numbers verbatim — principle 3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AREAS, type Area } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { F_SETS, TZ, profileF, targetsF } from "./fixtures.js";
import {
  TEST_USER,
  createFromSpy,
  freshDb,
  listRows,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

// QA (T-0308b verification): `refreshAll` can be made to REWRITE the cached profile, the way a
// real refresh does when another device changed the plan. Without that seam no test could ever see
// the second `ready` state, so "the draft is initialised once and a later refresh never overwrites
// it" was unfalsifiable — a `baseline` recomputed every render, and even a remount of the form on
// every refresh, both passed the whole suite.
const onRefresh: { current: (() => Promise<void>) | null } = { current: null };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => {
      await onRefresh.current?.();
    }),
    refreshRoutines: vi.fn(async () => undefined),
  };
});

const previewSpy = vi.fn();
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return {
    ...actual,
    // Records every call and, by default, returns the real rule 4 values. AC-B10 swaps the
    // return value; the other tests run "through the engine".
    previewTargets: (...args: Parameters<typeof actual.previewTargets>) => {
      const real = actual.previewTargets(...args);
      previewSpy(args[0]);
      const override = previewOverride.current;
      return override ? override(real) : real;
    },
  };
});

type Preview = { area: Area; setsPer14d: number }[];
const previewOverride: { current: ((real: Preview) => Preview) | null } = { current: null };

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;

/** A click, with every resulting state update and effect flushed. `@testing-library/user-event`
 *  is not a dependency of this workspace, and adding one is outside this lane's paths. */
async function tap(element: HTMLElement | null): Promise<void> {
  await act(async () => {
    fireEvent.click(element!);
  });
}

/** A real key press on `element`. jsdom does not synthesise the click a native button gets from
 *  Enter/Space, so the click is dispatched explicitly after the keydown/keyup pair — which is
 *  what the browser does, and what AC-B9's "Tab + Enter/Space" claim means. */
async function press(element: Element, key: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(element, { key });
    fireEvent.keyUp(element, { key });
    if (key === "Enter" || key === " ") fireEvent.click(element);
  });
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  previewSpy.mockClear();
  previewOverride.current = null;
  spy.reset();
  onRefresh.current = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  previewOverride.current = null;
  onRefresh.current = null;
  vi.restoreAllMocks();
});

/** Opens /plan/edit over fixture F (plus `profile` overrides) and waits for the preview. */
async function openEdit(profileOverrides: Parameters<typeof profileF>[0] = {}) {
  const db = freshDb();
  await seedCache(db, { profile: profileF(profileOverrides), targets: targetsF() });
  const view = renderPlan({ at: "/plan/edit" });
  await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
  return view;
}

function chip(area: Area): HTMLElement {
  return screen.getByRole("button", { name: en.bodyMap.areas[area] });
}
function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: u.save });
}
function previewOf(area: Area): string {
  return listRows(u.previewHeading)[AREAS.indexOf(area)] ?? "";
}
function readout(): string {
  const group = screen.getByRole("group", { name: u.rhythmGroup });
  return group.querySelector("p")!.textContent ?? "";
}
function pressedAreas(): string[] {
  return AREAS.filter((a) => chip(a).getAttribute("aria-pressed") === "true");
}

describe("AC-B7 initial state; Save disabled while unchanged (D-0081 §2)", () => {
  it("shows F's goal checked, F's readout, no pressed chip, F's preview, and a disabled Save", async () => {
    await openEdit();
    expect(screen.getByRole("radio", { name: u.goals.build_muscle })).toBeChecked();
    expect(readout()).toBe("3–4 per week · 6–8 per 14 days");
    expect(pressedAreas()).toEqual([]);
    expect(listRows(u.previewHeading)).toEqual(
      AREAS.map((a, i) => `${en.bodyMap.areas[a]} ${F_SETS[i]}`),
    );
    expect(saveButton()).toBeDisabled();
  });

  it("changing the goal enables Save; changing it back disables it again", async () => {
    await openEdit();
    await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
    expect(saveButton()).toBeEnabled();
    await tap(screen.getByRole("radio", { name: u.goals.build_muscle }));
    expect(saveButton()).toBeDisabled();
  });

  it("selecting then deselecting a chip leaves Save disabled", async () => {
    await openEdit();
    await tap(chip("back"));
    expect(saveButton()).toBeEnabled();
    await tap(chip("back"));
    expect(saveButton()).toBeDisabled();
  });

  it("contrast: re-selecting the SAME priority set in a different order keeps Save disabled", async () => {
    // Loaded [back, arms], tapped off then back on in the order arms, back. The draft array is
    // now ["arms", "back"], a different order but the same SET, so D-0081 §2 says unchanged.
    await openEdit({ priorityAreas: ["back", "arms"] });
    expect(pressedAreas()).toEqual(["back", "arms"]);
    expect(saveButton()).toBeDisabled();
    await tap(chip("arms"));
    await tap(chip("back"));
    expect(saveButton()).toBeEnabled();
    await tap(chip("arms"));
    await tap(chip("back"));
    expect(pressedAreas()).toEqual(["back", "arms"]);
    expect(saveButton()).toBeDisabled();
  });

  it("contrast: a DIFFERENT set of the same size enables Save", async () => {
    // The mirror of the test above: set comparison must still notice a real change.
    await openEdit({ priorityAreas: ["back", "arms"] });
    await tap(chip("arms"));
    await tap(chip("core"));
    expect(pressedAreas()).toEqual(["back", "core"]);
    expect(saveButton()).toBeEnabled();
  });
});

describe("AC-B8 priorities, preview and the ≤ 3 limit (spec AC15)", () => {
  it("tapping Arms, Back, Hamstrings gives the engine's boosted values, and the rest are unchanged", async () => {
    await openEdit();
    await tap(chip("arms"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));

    expect(previewOf("back")).toBe("Back 25");
    expect(previewOf("hamstrings")).toBe("Hamstrings 20");
    expect(previewOf("arms")).toBe("Arms 15");
    // Contrast: unprioritised areas keep F's numbers.
    expect(previewOf("chest")).toBe("Chest 20");
    expect(previewOf("calves")).toBe("Calves 12");
  });

  // AC-B8 and AC-B11 both write this list as `["back", "hamstrings", "arms"]`. That is neither
  // the tap order (arms, back, hamstrings) nor the fixed order: in `AREAS` — chest, back,
  // shoulders, ARMS, core, glutes, quads, HAMSTRINGS, calves — `arms` comes BEFORE `hamstrings`.
  // D-0081 §3 and the ticket's own Contract impact section are explicit that the write is in the
  // fixed area order, so the ACs' literal array is a transcription slip and `["back", "arms",
  // "hamstrings"]` is the required value. The assertion below is derived from `AREAS`, so it
  // cannot drift from the decision.
  it("the last previewTargets call receives the priorities in the FIXED area order (D-0081 §3)", async () => {
    await openEdit();
    await tap(chip("arms"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));
    const last = previewSpy.mock.calls.at(-1)![0] as {
      rhythmMin: number;
      rhythmMax: number;
      priorityAreas: Area[];
    };
    const fixedOrder = AREAS.filter((a) => (["arms", "back", "hamstrings"] as Area[]).includes(a));
    expect(fixedOrder).toEqual(["back", "arms", "hamstrings"]);
    expect(last).toEqual({ rhythmMin: 3, rhythmMax: 4, priorityAreas: fixedOrder });
    // Contrast: it is NOT the tap order.
    expect(last.priorityAreas).not.toEqual(["arms", "back", "hamstrings"]);
  });

  it("a 4th tap is refused: `Pick up to 3`, still 3 pressed, and NO preview call with 4 areas", async () => {
    await openEdit();
    await tap(chip("arms"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));
    expect(screen.queryByText(u.pickUpToThree)).not.toBeInTheDocument();

    await tap(chip("quads"));
    expect(chip("quads")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(u.pickUpToThree)).toBeInTheDocument();
    expect(pressedAreas()).toHaveLength(3);
    for (const call of previewSpy.mock.calls) {
      expect((call[0] as { priorityAreas: Area[] }).priorityAreas.length).toBeLessThanOrEqual(3);
    }
  });

  it("the hint is polite (role=status), not an alert", async () => {
    await openEdit();
    await tap(chip("arms"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));
    await tap(chip("quads"));
    expect(screen.getByRole("status")).toHaveTextContent(u.pickUpToThree);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("contrast: the hint goes away once fewer than 3 are selected, and a 3rd can be picked again", async () => {
    await openEdit();
    await tap(chip("arms"));
    await tap(chip("back"));
    await tap(chip("hamstrings"));
    await tap(chip("quads"));
    expect(screen.getByText(u.pickUpToThree)).toBeInTheDocument();

    await tap(chip("arms"));
    expect(screen.queryByText(u.pickUpToThree)).not.toBeInTheDocument();
    await tap(chip("quads"));
    expect(chip("quads")).toHaveAttribute("aria-pressed", "true");
    expect(pressedAreas()).toEqual(["back", "quads", "hamstrings"]);
  });

  it("all 9 chips are in the fixed order, each with aria-pressed", async () => {
    await openEdit();
    const group = screen.getByRole("group", { name: u.priorityGroup });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(AREAS.map((a) => en.bodyMap.areas[a]));
    for (const b of buttons) expect(b).toHaveAttribute("aria-pressed");
  });
});

describe("AC-B9 rhythm steppers, through the engine", () => {
  it("Increase minimum raises the max with it, and the preview follows the engine", async () => {
    await openEdit();
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    expect(readout()).toBe("4–4 per week · 8–8 per 14 days");
    expect(previewOf("chest")).toBe("Chest 23");

    await tap(screen.getByRole("button", { name: u.increaseMin }));
    expect(readout()).toBe("5–5 per week · 10–10 per 14 days");
    expect(previewOf("chest")).toBe("Chest 29");
  });

  it("Decrease maximum lowers the min with it", async () => {
    await openEdit();
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    await tap(screen.getByRole("button", { name: u.decreaseMax }));
    expect(readout()).toBe("4–4 per week · 8–8 per 14 days");
    expect(previewOf("chest")).toBe("Chest 23");
  });

  it("at 1–1 both decrease buttons are disabled", async () => {
    await openEdit({ rhythmMin: 1, rhythmMax: 1 });
    expect(readout()).toBe("1–1 per week · 2–2 per 14 days");
    expect(screen.getByRole("button", { name: u.decreaseMin })).toBeDisabled();
    expect(screen.getByRole("button", { name: u.decreaseMax })).toBeDisabled();
    expect(screen.getByRole("button", { name: u.increaseMin })).toBeEnabled();
    expect(screen.getByRole("button", { name: u.increaseMax })).toBeEnabled();
  });

  it("at 7–7 both increase buttons are disabled and the preview reads `Chest 30`", async () => {
    await openEdit({ rhythmMin: 7, rhythmMax: 7 });
    expect(readout()).toBe("7–7 per week · 14–14 per 14 days");
    expect(screen.getByRole("button", { name: u.increaseMin })).toBeDisabled();
    expect(screen.getByRole("button", { name: u.increaseMax })).toBeDisabled();
    expect(previewOf("chest")).toBe("Chest 30");
  });

  it("20 alternating pseudo-random presses never show a value outside 1–7 or min > max", async () => {
    await openEdit();
    // A fixed seed (a small LCG), so a failure is reproducible.
    let seed = 20260927;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const names = [u.decreaseMin, u.increaseMin, u.decreaseMax, u.increaseMax];
    for (let i = 0; i < 20; i += 1) {
      const name = names[Math.floor(next() * names.length)]!;
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      if (!button.disabled) await tap(button);
      const [, min, max] = /^(\d)–(\d) per week/.exec(readout())!;
      expect(Number(min)).toBeGreaterThanOrEqual(1);
      expect(Number(max)).toBeLessThanOrEqual(7);
      expect(Number(min)).toBeLessThanOrEqual(Number(max));
      // And the readout's 14-day half always doubles the week half.
      expect(readout()).toBe(
        `${min}–${max} per week · ${2 * Number(min)}–${2 * Number(max)} per 14 days`,
      );
    }
  });

  it("every stepper is reachable and activatable with Tab + Enter/Space", async () => {
    await openEdit();
    // Tab to `Increase minimum` and press Enter.
    const increaseMin = screen.getByRole("button", { name: u.increaseMin });
    increaseMin.focus();
    expect(increaseMin).toHaveFocus();
    await press(document.activeElement!, "Enter");
    expect(readout()).toBe("4–4 per week · 8–8 per 14 days");

    // Tab forward reaches `Decrease maximum`; Space activates it.
    // The next stepper button in DOM order is `Decrease maximum`; focus it the way Tab would.
    const order = Array.from(
      screen.getByRole("group", { name: u.rhythmGroup }).querySelectorAll("button"),
    );
    const decreaseMax = order[order.indexOf(increaseMin as HTMLButtonElement) + 1]!;
    expect(decreaseMax).toBe(screen.getByRole("button", { name: u.decreaseMax }));
    decreaseMax.focus();
    expect(decreaseMax).toHaveFocus();
    await press(document.activeElement!, " ");
    expect(readout()).toBe("3–3 per week · 6–6 per 14 days");
  });

  it("a chip is activatable with Space (AC-B15's keyboard claim, at unit level)", async () => {
    await openEdit();
    chip("back").focus();
    await press(document.activeElement!, " ");
    expect(chip("back")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AC-B10 the engine's numbers, verbatim (principle 3)", () => {
  it("a stub returning back: 99 shows `Back 99` and saves 99", async () => {
    previewOverride.current = (real) =>
      real.map((p) => (p.area === "back" ? { ...p, setsPer14d: 99 } : p));
    await openEdit();
    await tap(chip("core"));
    expect(previewOf("back")).toBe("Back 99");

    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBeGreaterThanOrEqual(1));
    const upsert = spy.calls.find((c) => c.table === "area_targets")!;
    const rows = upsert.payload as { area_id: string; sets_per_14d: number }[];
    expect(rows.find((r) => r.area_id === "back")!.sets_per_14d).toBe(99);
  });

  it("contrast: a rhythm change AFTER the priorities saves the LAST preview (98), never a stale 99", async () => {
    let calls = 0;
    previewOverride.current = (real) => {
      calls += 1;
      // The first override gives 99; every later one gives 98. So a Save that carried a stale
      // preview, or recomputed the numbers itself, would write 99 or the real value.
      const value = calls <= 1 ? 99 : 98;
      return real.map((p) => (p.area === "back" ? { ...p, setsPer14d: value } : p));
    };
    await openEdit();
    await tap(chip("back"));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    expect(previewOf("back")).toBe("Back 98");

    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBeGreaterThanOrEqual(1));
    const rows = spy.calls.find((c) => c.table === "area_targets")!.payload as {
      area_id: string;
      sets_per_14d: number;
    }[];
    expect(rows.find((r) => r.area_id === "back")!.sets_per_14d).toBe(98);
    expect(rows.find((r) => r.area_id === "back")!.sets_per_14d).not.toBe(99);
  });

  // QA (T-0308b verification): the contrast above is call-COUNT based, so it proves the Save does
  // not carry a STALE preview, but it cannot see a Save that calls `previewTargets` a second time
  // with the same input — the extra call simply returns the same 98. That variant is a real
  // principle-3 hole: the write would then come from a recomputation rather than from the object
  // the user was shown, so any future divergence between render and save time (a draft that moved
  // between the two, or a non-pure engine) would ship silently. These two tests close it.
  it("the Save writes the very object the preview rendered: NO extra previewTargets call", async () => {
    await openEdit();
    await tap(chip("back"));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    const callsBeforeSave = previewSpy.mock.calls.length;

    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBeGreaterThanOrEqual(1));
    // A Save that recomputed — even with identical input — would add a call here.
    expect(previewSpy.mock.calls.length).toBe(callsBeforeSave);
  });

  it("an engine whose value changes per call still writes the SHOWN numbers, not a fresh one", async () => {
    // The engine is treated as pure everywhere else, so this stub is not a realistic server; it
    // is a probe. Every call returns a different `back`, so the written value identifies WHICH
    // call produced it. It must be the last render-time call, never a save-time one.
    let nth = 0;
    previewOverride.current = (real) => {
      nth += 1;
      return real.map((p) => (p.area === "back" ? { ...p, setsPer14d: 50 + nth } : p));
    };
    await openEdit();
    await tap(chip("back"));
    await tap(screen.getByRole("button", { name: u.increaseMin }));
    const shown = previewOf("back");
    expect(shown).toMatch(/^Back 5\d$/);
    const shownValue = Number(shown.split(" ")[1]);

    await tap(saveButton());
    await waitFor(() => expect(spy.calls.length).toBeGreaterThanOrEqual(1));
    const rows = spy.calls.find((c) => c.table === "area_targets")!.payload as {
      area_id: string;
      sets_per_14d: number;
    }[];
    expect(rows.find((r) => r.area_id === "back")!.sets_per_14d).toBe(shownValue);
  });
});

// ------------------------------------------------------------------------------------------
// QA (T-0308b verification): the draft and the Save baseline survive a refresh.
//
// Scope says "The draft is initialised once, from the first read that finds a profile. A later
// refresh never overwrites it. The baseline that D-0081 §2 compares the draft against is that same
// snapshot." Nothing in the suite exercised a refresh that CHANGED the cached profile, so two real
// faults passed 96/96: a `baseline` recomputed on every render (which would make Save go dead the
// moment another device's plan landed, because the draft would then equal the NEW profile), and a
// form remounted per refresh (which would throw the user's half-finished edit away mid-typing).
// ------------------------------------------------------------------------------------------
describe("a refresh that changes the cached profile does not disturb the draft (D-0081 §2)", () => {
  it("keeps the user's edits and keeps Save enabled against the ORIGINAL baseline", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    // The refresh lands another device's plan: goal get_stronger, rhythm 5-6, priorities [core].
    // A recomputed baseline would compare the draft against THIS, not against F.
    onRefresh.current = async () => {
      await db.profileCache.put({
        userId: TEST_USER,
        profile: profileF({
          goal: "get_stronger",
          rhythmMin: 5,
          rhythmMax: 6,
          priorityAreas: ["core"],
        }),
      });
    };
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));

    // The user edits: pick Back. That is a change against F, so Save is live.
    await tap(chip("back"));
    expect(saveButton()).toBeEnabled();

    // Let the refresh and the second cache read complete.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // The draft is untouched: the refreshed profile did NOT overwrite it.
    expect(pressedAreas()).toEqual(["back"]);
    expect(readout()).toBe("3–4 per week · 6–8 per 14 days");
    expect(screen.getByRole("radio", { name: u.goals.build_muscle })).toBeChecked();
    // And the baseline is still F, so the edit still counts as a change.
    expect(saveButton()).toBeEnabled();
  });

  it("going back to the F values after such a refresh disables Save again — the baseline is still F", async () => {
    // The mirror case. If the baseline had moved to the refreshed profile, returning the draft to
    // F would look like a CHANGE and leave Save enabled.
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    onRefresh.current = async () => {
      await db.profileCache.put({
        userId: TEST_USER,
        profile: profileF({ goal: "general_fitness", rhythmMin: 7, rhythmMax: 7 }),
      });
    };
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));

    await tap(chip("back"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    // Undo the only edit: the draft equals F again.
    await tap(chip("back"));
    expect(pressedAreas()).toEqual([]);
    expect(saveButton()).toBeDisabled();
  });

  it("the form is not remounted by the refresh: the `Pick up to 3` hint survives it", async () => {
    // Transient UI state (the hint) lives in `EditForm`. A remount would clear it, which is how a
    // `key` on the profile — or a refresh-driven re-initialisation — shows itself.
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    onRefresh.current = async () => {
      await db.profileCache.put({
        userId: TEST_USER,
        profile: profileF({ rhythmMin: 2, rhythmMax: 2 }),
      });
    };
    renderPlan({ at: "/plan/edit" });
    await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));

    await tap(chip("back"));
    await tap(chip("arms"));
    await tap(chip("hamstrings"));
    await tap(chip("quads"));
    expect(screen.getByText(u.pickUpToThree)).toBeInTheDocument();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByText(u.pickUpToThree)).toBeInTheDocument();
    expect(pressedAreas()).toEqual(["back", "arms", "hamstrings"]);
  });
});
