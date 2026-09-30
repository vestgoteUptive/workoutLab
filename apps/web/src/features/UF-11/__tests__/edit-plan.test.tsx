// T-0308b UF-11.3 Edit plan: AC-B7 (initial state, Save disabled while unchanged, D-0081 §2),
// AC-B8 (priorities, preview, the ≤ 3 limit), AC-B9 (rhythm steppers), AC-B10 (the engine's
// numbers verbatim — principle 3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AREAS, type Area } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { F_SETS, TZ, profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
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
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  previewOverride.current = null;
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
});
