// T-0940 UF-08.1/UF-08.2/UF-08.5 empty mode (D-0236, D-0237, D-0239 §1-§2, §6-§13), AC1-AC23
// (docs/tickets/T-0940). Loaders mocked; the real engine runs behind a spy with the F-web fixtures
// (L1, zero history, energy normal, warm-up on), the real UF-05.1 sheet does the swaps. Only AC15,
// AC17 and one AC13 case stub a single `suggest` result, for states the real engine can't reach.
// The device is offline throughout (B16): everything runs from the cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type SessionInput, type Workout } from "@workoutlab/engine";
import { offlineDb } from "../../../lib/offline/db.js";
import { excludeExercise } from "../../../lib/offline/excluded.js";
import { upsertSession } from "../../../lib/offline/queue.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const, userId: "u-t0940" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, userId: auth.userId }),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...actual, excludeExercise: vi.fn(async () => {}) };
});
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn(async () => {}) }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const upsert = vi.mocked(upsertSession);
const storeExclusion = vi.mocked(excludeExercise);
let realSuggest: typeof suggest;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  realSuggest = actual.suggest;
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  upsert.mockClear();
  storeExclusion.mockClear();
  fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- helpers ----

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = (): SessionInput => spy.mock.lastCall![4];
const rowIds = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const mainRows = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const rowDetail = (id: string) =>
  document.querySelector(`[data-part="item-row"][data-id="${id}"] [data-part="row-detail"]`)
    ?.textContent;
const budgetText = () => document.querySelector<HTMLElement>('[data-part="budget-text"]')!;
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const sheetStatus = () => document.querySelector<HTMLElement>('[data-part="sheet-status"]')!;
const removedLine = () => document.querySelector('[data-part="removed-line"]')!;
const focusNotBody = () => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).not.toBeNull();
};

/** UF-08.1 at `minutes` (warm-up as given) → "Start empty" or "Suggest my workout". */
async function open(
  minutes: number,
  how: "Start empty" | "Suggest my workout" = "Start empty",
  warmup = true,
): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button(`${minutes} minutes`));
  if (!warmup) fireEvent.click(screen.getByRole("checkbox", { name: /Warm-up counts/ }));
  await settle();
  fireEvent.click(button(how));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

/** UF-08.5: search and tap `Add {name}` (or `Start with {name}`); waits for the sheet to close. */
async function sheet(name: string, action: "Add" | "Start with" = "Add"): Promise<void> {
  fireEvent.click(button("Add exercise"));
  const s = within(screen.getByRole("dialog"));
  fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(s.getByRole("button", { name: `${action} ${name}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** UF-08.5: search and tap Add, expecting a refusal; the sheet stays open. */
function sheetRefused(name: string): void {
  fireEvent.click(button("Add exercise"));
  const s = within(screen.getByRole("dialog"));
  fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(s.getByRole("button", { name: `Add ${name}` }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}

/** UF-08.3 through the real sheet: swap `name`'s row for `toId`. */
async function swap(name: string, toId: string): Promise<void> {
  fireEvent.click(button(`Swap ${name}`));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  const row = group.querySelector<HTMLElement>(`[data-id="${toId}"]`)!;
  fireEvent.click(within(row).getByRole("radio"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
}

/** A chip re-suggest, to read the record (`addedIds`, `mainPickId`) back off the next call. */
function chip(minutes: number): SessionInput {
  fireEvent.click(button(`${minutes} minutes`));
  return lastInput();
}

/** Empty mode at 30 min with bench-press as the main pick and inverted-row as a pick. */
async function benchAndRow(minutes = 30): Promise<void> {
  await open(minutes);
  await sheet("Bench press", "Start with");
  await sheet("Inverted row");
  expect(rowIds()).toEqual(["bench-press", "inverted-row"]);
  expect(mainRows()).toEqual(["bench-press"]);
}

// ---- Entry and record ----

describe("AC1 (B1) Start empty at 30 min", () => {
  it("0 items, the empty copy, '3 of 30 min · 27 min left', an aria-disabled Looks good that says why and doesn't navigate", async () => {
    await open(30);
    expect(rowIds()).toEqual([]);
    expect(document.querySelector('[data-part="empty-plan"]')).toHaveTextContent(
      "Nothing here yet. Pick from the suggestions or add an exercise.",
    );
    expect(document.querySelector('[data-part="nothing-fits"]')).toBeNull();
    expect(budgetText()).toHaveTextContent(/^3 of 30 min · 27 min left$/);
    const looksGood = button("Looks good");
    expect(looksGood).toHaveAttribute("aria-disabled", "true");
    expect(looksGood).not.toBeDisabled();
    looksGood.focus();
    expect(document.activeElement).toBe(looksGood);
    const reason = document.getElementById(looksGood.getAttribute("aria-describedby")!);
    expect(reason).toHaveTextContent(/^Add at least one exercise\.$/);
    fireEvent.click(looksGood);
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    // The list header is a visible h2 "Exercises" (UF-08.2.md › Empty mode › Layout).
    expect(screen.getByRole("heading", { level: 2, name: "Exercises" })).toBeInTheDocument();
    // Shuffle is not empty mode's (T-0941 adds "Other suggestions").
    expect(screen.queryByRole("button", { name: "Shuffle" })).toBeNull();
  });

  it("UF-08.1: Start empty is the secondary button under Suggest my workout", async () => {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
    const primary = button("Suggest my workout");
    const secondary = button("Start empty");
    expect(secondary).toHaveClass("wl-button--secondary");
    expect(secondary).toHaveAttribute("aria-disabled", "false");
    expect(primary.nextElementSibling).toBe(secondary);
  });
});

describe("AC2 (B1 sibling) Suggest my workout is unchanged", () => {
  it("suggested mode with the R7-E4 plan and an enabled Looks good", async () => {
    await open(30, "Suggest my workout");
    expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(button("Looks good")).not.toHaveAttribute("aria-disabled");
    expect(button("Looks good")).not.toHaveAttribute("aria-describedby");
    expect(budgetText()).toHaveTextContent(/^About \d+ of 30 min$/);
    expect(screen.getByRole("button", { name: "Shuffle" })).toBeInTheDocument();
    fireEvent.click(button("Looks good"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]));
  });
});

describe("AC3 (B1, warm-up off)", () => {
  it("reads '0 of 30 min + warm-up · 30 min left'", async () => {
    await open(30, "Start empty", false);
    expect(budgetText()).toHaveTextContent(/^0 of 30 min \+ warm-up · 30 min left$/);
  });
});

describe("AC4 the empty-mode plan call", () => {
  it("autoMainLift false, fill false, no pins, no main lift, shuffle 0, plus the usual inputs", async () => {
    await open(30);
    expect(lastInput()).toEqual({
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      favoriteIds: [],
      autoMainLift: false,
      fill: false,
    });
  });

  it("every later empty-mode call keeps fill and autoMainLift off and shuffle at 0", async () => {
    await open(30);
    await sheet("Leg extension");
    expect(lastInput()).toMatchObject({ autoMainLift: false, fill: false, shuffle: 0 });
    expect(chip(45)).toMatchObject({ autoMainLift: false, fill: false, shuffle: 0 });
  });
});

describe("AC5 (B19) the mode and picks are per visit", () => {
  it("Back, then Suggest my workout: suggested mode, no pins, no main pick", async () => {
    await open(30);
    await sheet("Barbell row", "Start with");
    await sheet("Leg extension");
    expect(mainRows()).toEqual(["barbell-row"]);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    await settle();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    // The UF-08.2 plan is UF-08.1's call: no pins, no main lift, no empty-mode switches.
    expect(lastInput().pinnedIds).toEqual([]);
    expect(lastInput().mainLiftId).toBeNull();
    expect(lastInput()).not.toHaveProperty("fill");
    expect(lastInput()).not.toHaveProperty("autoMainLift");
    expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(button("Looks good")).not.toHaveAttribute("aria-disabled");
    // mainPickId is null: the next re-suggest passes the plan's own main lift, not Barbell row.
    const next = chip(45);
    expect(next.mainLiftId).toBe("bench-press");
    expect(next.pinnedIds).toEqual([]);
  });
});

// ---- Controls in empty mode ----

describe("AC6 a UF-08.5 Add in empty mode", () => {
  it("the plan is Leg extension only, the status gives the minutes left, focus is on the new row", async () => {
    await open(30);
    fireEvent.click(button("Add exercise"));
    const s = within(screen.getByRole("dialog"));
    expect(document.querySelector(".wl-uf08__sheet-lead")).toHaveTextContent(
      /^27 of 30 min left\.$/,
    );
    fireEvent.change(s.getByLabelText("Search exercises"), {
      target: { value: "Leg extension" },
    });
    fireEvent.click(s.getByRole("button", { name: "Add Leg extension" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lastInput().pinnedIds).toEqual(["leg-extension"]);
    expect(rowIds()).toEqual(["leg-extension"]);
    expect(mainRows()).toEqual([]);
    const result = spy.mock.results.at(-1)!.value as Workout;
    const left = Math.floor(result.unusedS / 60);
    expect(status()).toHaveTextContent(new RegExp(`^Leg extension added\\. ${left} min left\\.$`));
    expect(budgetText()).toHaveTextContent(new RegExp(`· ${left} min left$`));
    const row = document.querySelector('[data-id="leg-extension"] [data-part="row-name"]');
    expect(document.activeElement).toBe(row);
    focusNotBody();
    // From 1 item "Looks good" is enabled.
    expect(button("Looks good")).not.toHaveAttribute("aria-disabled");
  });

  it("warm-up off: the lead line reads '30 of 30 min left.'", async () => {
    await open(30, "Start empty", false);
    fireEvent.click(button("Add exercise"));
    expect(document.querySelector(".wl-uf08__sheet-lead")).toHaveTextContent(
      /^30 of 30 min left\.$/,
    );
  });

  it("suggested mode keeps its lead line and its plain 'added' status", async () => {
    await open(30, "Suggest my workout");
    fireEvent.click(button("Add exercise"));
    expect(document.querySelector(".wl-uf08__sheet-lead")).toHaveTextContent(
      "The rest of your workout adjusts to fit 30 min.",
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await sheet("Lateral raise");
    expect(status()).toHaveTextContent(/^Lateral raise added\.$/);
  });
});

describe("AC7 (B17) start a one-item workout", () => {
  it("UF-08.4 shows 1 exercise and its real duration; Start writes a plan with one item", async () => {
    await open(45);
    await sheet("Leg extension");
    const workout = spy.mock.results.at(-1)!.value as Workout;
    expect(workout.plan.items).toHaveLength(1);
    fireEvent.click(button("Looks good"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]));
    const minutes = Math.ceil(workout.totalS / 60);
    expect(document.querySelector('[data-part="summary"]')).toHaveTextContent(
      new RegExp(`^${minutes} min · warm-up \\+ 1 exercise · 3 sets · done by `),
    );
    expect(upsert).not.toHaveBeenCalled();
    fireEvent.click(button("Start"));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const row = upsert.mock.calls[0]![0];
    expect(row.plan?.items.map((i) => i.exerciseId)).toEqual(["leg-extension"]);
    expect(row.time_budget_min).toBe(45);
  });
});

describe("AC8 (B9) Remove a pick", () => {
  it("out of the plan, excluded for the visit on the next call, out of the pins, Never suggest offered", async () => {
    await open(30);
    await sheet("Inverted row");
    await sheet("Leg extension");
    fireEvent.click(button("Remove Inverted row"));
    expect(rowIds()).toEqual(["leg-extension"]);
    focusNotBody();
    expect(
      within(removedLine() as HTMLElement).getByRole("button", {
        name: "Never suggest Inverted row",
      }),
    ).toBeInTheDocument();
    const next = chip(45);
    expect(next.excludeIds).toContain("inverted-row");
    expect(next.pinnedIds).toEqual(["leg-extension"]);
    expect(rowIds()).not.toContain("inverted-row");
  });

  it("removing the last pick shows the empty-plan line again and focus lands on Looks good", async () => {
    await open(30);
    await sheet("Inverted row");
    fireEvent.click(button("Remove Inverted row"));
    expect(document.querySelector('[data-part="empty-plan"]')).toBeInTheDocument();
    expect(document.querySelector('[data-part="nothing-fits"]')).toBeNull();
    expect(document.activeElement).toBe(button("Looks good"));
    expect(button("Looks good")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("AC9 (B9, main) Remove the main pick", () => {
  it("mainPickId is cleared: the next call has mainLiftId null", async () => {
    await benchAndRow();
    fireEvent.click(button("Remove Bench press"));
    expect(mainRows()).toEqual([]);
    const next = chip(45);
    expect(next.mainLiftId).toBeNull();
    expect(next.pinnedIds).toEqual(["inverted-row"]);
    expect(rowIds()).toEqual(["inverted-row"]);
  });
});

describe("AC10 (B10) swap a pick", () => {
  it("Barbell row takes Inverted row's pin; Inverted row is excluded and stays out after a chip", async () => {
    await open(30);
    await sheet("Inverted row");
    await sheet("Leg extension");
    await swap("Inverted row", "barbell-row");
    expect(rowIds()).toEqual(["barbell-row", "leg-extension"]);
    const since = spy.mock.results.length;
    const next = chip(45);
    expect(next.pinnedIds).toEqual(["barbell-row", "leg-extension"]);
    expect(next.excludeIds).toContain("inverted-row");
    expect(rowIds()).not.toContain("inverted-row");
    for (const r of spy.mock.results.slice(since)) {
      expect((r.value as Workout).plan.items.map((i) => i.exerciseId)).not.toContain(
        "inverted-row",
      );
    }
    // The last call (the chip) is the only one since the swap; it leaves Inverted row out too.
    expect(chip(60).excludeIds).toContain("inverted-row");
    expect(rowIds()).not.toContain("inverted-row");
  });
});

describe("AC11 (B10, main swap)", () => {
  it("mainPickId follows the swap: the next call has mainLiftId db-bench-press", async () => {
    await benchAndRow();
    await swap("Bench press", "db-bench-press");
    expect(mainRows()).toEqual(["db-bench-press"]);
    const next = chip(45);
    expect(next.mainLiftId).toBe("db-bench-press");
    expect(next.excludeIds).toContain("bench-press");
    expect(mainRows()).toEqual(["db-bench-press"]);
  });
});

describe("AC12 (B20) Start with this keeps the old main lift", () => {
  it("Barbell row is main and first; Bench press stays as the front pin; the status says so", async () => {
    await open(45);
    await sheet("Bench press", "Start with");
    await sheet("Barbell row");
    expect(rowIds()).toEqual(["bench-press", "barbell-row"]);
    fireEvent.click(button("Start with Barbell row"));
    expect(lastInput().mainLiftId).toBe("barbell-row");
    expect(lastInput().pinnedIds).toEqual(["bench-press"]);
    expect(mainRows()).toEqual(["barbell-row"]);
    expect(rowIds()).toEqual(["barbell-row", "bench-press"]);
    expect(status()).toHaveTextContent(/^Barbell row is the main lift now\.$/);
    focusNotBody();
    // The record: addedIds [bench-press], mainPickId barbell-row.
    const next = chip(60);
    expect(next.pinnedIds).toEqual(["bench-press"]);
    expect(next.mainLiftId).toBe("barbell-row");
  });
});

describe("AC13 (B11 / B20 refusal) the safety net on a row's Start with this", () => {
  it("making Inverted row main would push out Overhead press: refused in the status line, nothing changes", async () => {
    await open(30);
    await sheet("Inverted row");
    await sheet("Back squat");
    await sheet("Overhead press");
    expect(rowIds()).toEqual(["inverted-row", "back-squat", "overhead-press"]);
    const before = rowIds().map((id) => rowDetail(id!));
    const tap = button("Start with Inverted row");
    tap.focus();
    fireEvent.click(tap);
    expect(status()).toHaveTextContent(
      /^Inverted row would push out Overhead press\. Pick more time or remove an exercise\.$/,
    );
    expect(rowIds()).toEqual(["inverted-row", "back-squat", "overhead-press"]);
    expect(rowIds().map((id) => rowDetail(id!))).toEqual(before);
    expect(mainRows()).toEqual([]);
    expect(document.activeElement).toBe(tap);
    focusNotBody();
    // The record is unchanged: same pins, no main pick.
    const next = chip(45);
    expect(next.pinnedIds).toEqual(["inverted-row", "back-squat", "overhead-press"]);
    expect(next.mainLiftId).toBeNull();
  });

  it("when the old main lift would be pushed out, it is the one named (stubbed result)", async () => {
    await benchAndRow();
    spy.mockImplementationOnce((h, t, p, l, input, now, tz) => {
      const real = realSuggest(h, t, p, l, input, now, tz);
      // The engine places the old main lift as a pin; drop it as a tighter budget would.
      const items = real.plan.items.filter((i) => i.exerciseId !== "bench-press");
      return { ...real, plan: { ...real.plan, items } };
    });
    const tap = button("Start with Inverted row");
    tap.focus();
    fireEvent.click(tap);
    expect(lastInput().pinnedIds).toEqual(["bench-press"]);
    expect(status()).toHaveTextContent(
      /^Inverted row would push out Bench press\. Pick more time or remove an exercise\.$/,
    );
    expect(mainRows()).toEqual(["bench-press"]);
    expect(document.activeElement).toBe(tap);
  });
});

describe("AC14 the new item doesn't fit (refusal 2, on the sheet)", () => {
  it("an isolation and a compound get D-0205 §4's copy; nothing changes", async () => {
    await benchAndRow();
    await sheet("Leg extension");
    const before = rowIds();
    sheetRefused("Lateral raise");
    expect(sheetStatus()).toHaveTextContent(
      /^Lateral raise doesn't fit in 30 min\. Pick more time\.$/,
    );
    focusNotBody();
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Search exercises"), {
      target: { value: "Barbell row" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add Barbell row" }),
    );
    expect(sheetStatus()).toHaveTextContent(
      /^Barbell row doesn't fit in 30 min\. Start with it instead, or pick more time\.$/,
    );
    expect(rowIds()).toEqual(before);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chip(45).pinnedIds).toEqual(["inverted-row", "leg-extension"]);
  });

  it("a third chest-primary pick gets the cap copy", async () => {
    await open(30);
    await sheet("Bench press");
    await sheet("Db bench press");
    sheetRefused("Push up");
    expect(sheetStatus()).toHaveTextContent(/^This workout already has two Chest exercises\.$/);
    expect(rowIds()).toEqual(["bench-press", "db-bench-press"]);
  });
});

describe("AC15 the new item fits but pushes out a pick (refusal 3, on the sheet)", () => {
  it("Lateral raise would push out Inverted row: refused, nothing changes (stubbed result)", async () => {
    await open(30);
    await sheet("Inverted row");
    await sheet("Leg extension");
    spy.mockImplementationOnce((h, t, p, l, input, now, tz) => {
      const real = realSuggest(h, t, p, l, input, now, tz);
      const items = real.plan.items.filter((i) => i.exerciseId !== "inverted-row");
      return { ...real, plan: { ...real.plan, items } };
    });
    sheetRefused("Lateral raise");
    expect(lastInput().pinnedIds).toEqual(["inverted-row", "leg-extension", "lateral-raise"]);
    expect(sheetStatus()).toHaveTextContent(
      /^Lateral raise would push out Inverted row\. Pick more time or remove an exercise\.$/,
    );
    focusNotBody();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowIds()).toEqual(["inverted-row", "leg-extension"]);
    expect(chip(45).pinnedIds).toEqual(["inverted-row", "leg-extension"]);
  });
});

describe("AC16 (B7) a time chip down and back up", () => {
  it("20 keeps Bench press × 4 and drops Inverted row (named, still a pin); 30 brings it back", async () => {
    await benchAndRow();
    const at20 = chip(20);
    expect(at20.pinnedIds).toEqual(["inverted-row"]);
    expect(at20.mainLiftId).toBe("bench-press");
    expect(rowIds()).toEqual(["bench-press"]);
    expect(rowDetail("bench-press")).toMatch(/^4 × /);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toHaveTextContent(
      /^Doesn't fit in 20 min: Inverted row\.$/,
    );
    expect(status()).toHaveTextContent(/^Doesn't fit in 20 min: Inverted row\.$/);
    const at30 = chip(30);
    expect(at30.pinnedIds).toEqual(["inverted-row"]);
    expect(rowIds()).toEqual(["bench-press", "inverted-row"]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toBeNull();
  });
});

describe("AC17 (B21) a time chip that drops the main pick keeps it", () => {
  it("named in Doesn't fit, no main lift shown, still passed; the original minutes bring it back", async () => {
    await open(30);
    await sheet("Bench press", "Start with");
    // R7-E2: bench-press × 4 fits even at 15 min, so this one step is stubbed (as the AC allows).
    spy.mockImplementationOnce((h, t, p, l, input, now, tz) =>
      realSuggest(h, t, p, l, { ...input, mainLiftId: null }, now, tz),
    );
    const at15 = chip(20);
    expect(at15.mainLiftId).toBe("bench-press");
    expect(mainRows()).toEqual([]);
    expect(rowIds()).toEqual([]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toHaveTextContent(
      /^Doesn't fit in 20 min: Bench press\.$/,
    );
    const back = chip(30);
    expect(back.mainLiftId).toBe("bench-press");
    expect(mainRows()).toEqual(["bench-press"]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toBeNull();
  });
});

describe("AC18 (B22) over budget after a fitsBudget: false swap", () => {
  async function overBudget(): Promise<number> {
    await benchAndRow();
    await sheet("Leg extension");
    expect(document.querySelector(".wl-uf08__budget")).not.toHaveAttribute("data-over");
    fireEvent.click(button("Swap Leg extension"));
    const group = await screen.findByRole("radiogroup", { name: "Replacement" });
    const overRow = group.querySelector<HTMLElement>('[data-tag="over-time"]')!.closest("label")!;
    fireEvent.click(within(overRow).getByRole("radio"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    const w = document.querySelector<HTMLElement>("[data-items]")!;
    expect(w).toBeInTheDocument();
    const over = Number(/· (\d+) min over$/.exec(budgetText().textContent!)?.[1]);
    expect(over).toBeGreaterThan(0);
    return over;
  }

  it("the line reads '{used} of 30 min · X min over'; the bar keeps its classes", async () => {
    const over = await overBudget();
    expect(budgetText()).toHaveTextContent(new RegExp(`^\\d+ of 30 min · ${over} min over$`));
    const budget = document.querySelector<HTMLElement>(".wl-uf08__budget")!;
    expect(budget).toHaveAttribute("data-over", "true");
    // Words, not colour (D-0211 §5): the same classes as within budget. No CSS rule uses
    // `data-over`, so there is nothing colour-wise to assert beyond the class names.
    expect(budget.className).toBe("wl-uf08__budget");
    expect(budgetText().className).toBe("wl-uf08__budget-text");
    expect(document.querySelector('[data-part="bar"]')!.className).toBe("wl-uf08__bar");
  });

  it("UF-08.5 Add is refused on the sheet; a row's Start with this in the status line", async () => {
    const over = await overBudget();
    const calls = spy.mock.calls.length;
    sheetRefused("Lateral raise");
    expect(sheetStatus()).toHaveTextContent(
      new RegExp(`^Your workout is ${over} min over\\. Remove or swap an exercise first\\.$`),
    );
    expect(spy.mock.calls.length).toBe(calls);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const tap = button("Start with Inverted row");
    tap.focus();
    fireEvent.click(tap);
    expect(status()).toHaveTextContent(
      new RegExp(`^Your workout is ${over} min over\\. Remove or swap an exercise first\\.$`),
    );
    expect(document.activeElement).toBe(tap);
    expect(spy.mock.calls.length).toBe(calls);
    expect(mainRows()).toEqual(["bench-press"]);
  });
});

describe("AC19 (D-0239 §9) one live region", () => {
  it("empty mode: no aria-live on the budget line; one status region besides the Removed line's own", async () => {
    await open(30);
    expect(budgetText()).not.toHaveAttribute("aria-live");
    const page = document.querySelector('[data-screen-id="UF-08.2"]')!;
    const statuses = Array.from(page.querySelectorAll('[role="status"]'));
    // UF-08.2.md › Empty mode › Live region: the status line carries the messages; the Removed
    // line keeps its own persistent region for its rows (D-0199 §10). See the T-0940 log.
    expect(statuses.filter((s) => s.getAttribute("data-part") !== "removed-line")).toEqual([
      status(),
    ]);
    expect(statuses).toHaveLength(2);
    expect(page.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(page.querySelector("[aria-live]")).toHaveAttribute("data-part", "exclusion-failed");
  });

  it("suggested mode (sibling): the budget line keeps aria-live polite", async () => {
    await open(30, "Suggest my workout");
    expect(budgetText()).toHaveAttribute("aria-live", "polite");
  });
});

describe("AC20 focus never drops to body", () => {
  it("after Adds (AC6), two refusals (AC13, AC14), a Remove (AC8) and a Start with this (AC12)", async () => {
    await open(30);
    for (const name of ["Inverted row", "Back squat", "Overhead press"]) {
      await sheet(name);
      focusNotBody();
    }
    fireEvent.click(button("Start with Inverted row"));
    expect(status()).toHaveTextContent(/would push out/);
    focusNotBody();
    sheetRefused("Lateral raise");
    expect(sheetStatus()).toHaveTextContent(/^Lateral raise doesn't fit in 30 min\./);
    focusNotBody();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("Remove Overhead press"));
    focusNotBody();
    fireEvent.click(button("Start with Inverted row"));
    expect(mainRows()).toEqual(["inverted-row"]);
    focusNotBody();
  });
});

// ---- Suggested mode (D-0239 §1) ----

describe("AC21 suggested mode: Start with this sets the main pick", () => {
  it("a time chip passes mainLiftId X; X dropped by a smaller chip comes back as main", async () => {
    await open(30, "Suggest my workout");
    fireEvent.click(button("Start with Inverted row"));
    expect(mainRows()).toEqual(["inverted-row"]);
    expect(chip(45).mainLiftId).toBe("inverted-row");
    expect(mainRows()).toEqual(["inverted-row"]);
    // A smaller chip whose plan lost X (stubbed: the engine falls back to its own main lift).
    spy.mockImplementationOnce((h, t, p, l, input, now, tz) =>
      realSuggest(h, t, p, l, { ...input, mainLiftId: null }, now, tz),
    );
    expect(chip(20).mainLiftId).toBe("inverted-row");
    expect(mainRows()).not.toEqual(["inverted-row"]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toHaveTextContent(
      /^Doesn't fit in 20 min: Inverted row\.$/,
    );
    expect(chip(30).mainLiftId).toBe("inverted-row");
    expect(mainRows()).toEqual(["inverted-row"]);
  });
});

describe("AC22 suggested mode without Start with this", () => {
  it("a time chip passes the plan's main lift as before", async () => {
    await open(30, "Suggest my workout");
    expect(chip(45).mainLiftId).toBe("bench-press");
    expect(lastInput()).not.toHaveProperty("fill");
    expect(lastInput()).not.toHaveProperty("autoMainLift");
    expect(chip(60).mainLiftId).toBe((spy.mock.results.at(-2)!.value as Workout).plan.mainLiftId);
  });
});

// ---- Offline ----

describe("AC23 (B16, unit side) offline", () => {
  it("AC1, AC6 and AC12 behave the same, and nothing is written before Start", async () => {
    expect(navigator.onLine).toBe(false);
    await open(45);
    expect(budgetText()).toHaveTextContent(/^3 of 45 min · 42 min left$/);
    expect(button("Looks good")).toHaveAttribute("aria-disabled", "true");
    await sheet("Leg extension");
    expect(rowIds()).toEqual(["leg-extension"]);
    expect(status()).toHaveTextContent(/^Leg extension added\. \d+ min left\.$/);
    await sheet("Bench press", "Start with");
    await sheet("Barbell row");
    fireEvent.click(button("Start with Barbell row"));
    expect(mainRows()).toEqual(["barbell-row"]);
    expect(rowIds()).toContain("bench-press");
    expect(status()).toHaveTextContent(/^Barbell row is the main lift now\.$/);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(storeExclusion).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---- Review and QA fixes (T-0940 round 2) ----

describe("QA: a success message survives a Doesn't fit change", () => {
  it("at 20 min, remove Bench press, Start with Inverted row: 'Inverted row is the main lift now.'", async () => {
    await benchAndRow();
    chip(20);
    expect(rowIds()).toEqual(["bench-press"]);
    fireEvent.click(button("Remove Bench press"));
    await sheet("Inverted row", "Start with");
    expect(rowIds()).toEqual(["inverted-row"]);
    expect(status()).toHaveTextContent(/^Inverted row is the main lift now\.$/);
  });
});

describe("Review: a dropped main pick is demoted to the front of the pins", () => {
  it("a chip drops the main; Start with Barbell row puts Bench press first, then the others", async () => {
    await open(45);
    await sheet("Bench press", "Start with");
    await sheet("Leg extension");
    await sheet("Barbell row");
    spy.mockImplementationOnce((h, t, p, l, input, now, tz) =>
      realSuggest(h, t, p, l, { ...input, mainLiftId: null }, now, tz),
    );
    chip(30);
    expect(mainRows()).toEqual([]);
    expect(rowIds()).toContain("barbell-row");
    fireEvent.click(button("Start with Barbell row"));
    expect(lastInput().mainLiftId).toBe("barbell-row");
    expect(lastInput().pinnedIds).toEqual(["bench-press", "leg-extension"]);
  });

  it("the demoted main lift still reads 'Added by you' in empty mode", async () => {
    await open(45);
    await sheet("Bench press", "Start with");
    await sheet("Barbell row");
    fireEvent.click(button("Start with Barbell row"));
    expect(
      document.querySelector(
        '[data-part="item-row"][data-id="bench-press"] [data-part="row-detail"]',
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-part="item-row"][data-id="bench-press"]'),
    ).toHaveTextContent("Added by you");
  });
});

describe("Review: Start empty while UF-08.1 is still checking what fits", () => {
  it("does nothing until the stored list has answered", async () => {
    const table = offlineDb().excludedCache;
    const realWhere = table.where.bind(table);
    let release!: () => void;
    const gate = new Dexie.Promise<void>((r) => (release = r));
    vi.spyOn(table, "where").mockImplementation(((...args: unknown[]) => {
      if (typeof args[0] !== "object") return (realWhere as (...a: unknown[]) => unknown)(...args);
      const collection = (realWhere as (...a: unknown[]) => ReturnType<typeof realWhere>)(...args);
      return { toArray: () => gate.then(() => collection.toArray()) };
    }) as never);
    renderSetup();
    await settle(100);
    expect(screen.getByText("Checking what fits…")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-part="start-empty"]')!);
    await settle();
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(spy).not.toHaveBeenCalled();
    await act(async () => release());
  });
});

describe("Review: the budget line rounds used minutes up", () => {
  it("after Leg extension at 30 min it reads '10 of 30 min · 20 min left'", async () => {
    await open(30);
    await sheet("Leg extension");
    expect(budgetText()).toHaveTextContent(/^10 of 30 min · 20 min left$/);
  });
});
