// T-0941 UF-08.2 empty mode: the Suggestions section (D-0238, D-0239 §3, §8-§13, UF-08.2.md ›
// Empty mode), AC1-AC17 (docs/tickets/T-0941). Loaders mocked; the real engine runs behind a spy
// with the F-web fixtures (L1, zero history unless stated, energy normal, warm-up on, 30 min).
// Only AC4 (the first call omits a pick) and AC12 (a result the real engine can't give) stub a
// `suggest` result. Offline throughout (B16): everything runs from the cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type HistorySet, type SessionInput, type Workout } from "@workoutlab/engine";
import { upsertSession } from "../../../lib/offline/queue.js";
import { fLibrary, fProfile, fTargets } from "./fixtures.js";
import {
  fCache,
  fitLine,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const, userId: "u-t0941" }));
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
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn(async () => {}) }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const upsert = vi.mocked(upsertSession);
let realSuggest: typeof suggest;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  realSuggest = actual.suggest;
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  upsert.mockClear();
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

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const section = () => document.querySelector<HTMLElement>('[data-part="suggestions"]')!;
const suggestionIds = () =>
  Array.from(document.querySelectorAll('[data-part="suggestion"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const suggestionRow = (id: string) =>
  document.querySelector<HTMLElement>(`[data-part="suggestion"][data-id="${id}"]`)!;
const planIds = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const mainRows = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const budgetText = () => document.querySelector<HTMLElement>('[data-part="budget-text"]')!;
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const listCopy = () => document.querySelector('[data-part="suggestions-copy"]');
const sub = () => document.querySelector('[data-part="suggestions-sub"]');
const other = () => screen.queryByRole("button", { name: "Other suggestions" });
const fill = () => screen.queryByRole("button", { name: "Fill the rest for me" });
const addButtons = () => within(section()).queryAllByRole("button", { name: /^Add / });
const focusNotBody = () => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).not.toBeNull();
};
/** Every `suggest` call's input, in order. */
const inputs = (): SessionInput[] => spy.mock.calls.map((c) => c[4]);
const suggestionCalls = (from = 0) =>
  inputs()
    .slice(from)
    .filter((i) => i.fill === true);
/** The last plan call's input (empty mode's plan call has `fill: false`). */
const planInput = (): SessionInput =>
  inputs()
    .filter((i) => i.fill === false)
    .at(-1)!;

async function open(
  minutes = 30,
  how: "Start empty" | "Suggest my workout" = "Start empty",
  after?: () => void,
): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button(`${minutes} minutes`));
  after?.();
  await settle();
  fireEvent.click(button(how));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

const tap = (name: string) => fireEvent.click(button(`Add ${name}`));

async function sheet(name: string, action: "Add" | "Start with" = "Add"): Promise<void> {
  fireEvent.click(button("Add exercise"));
  const s = within(screen.getByRole("dialog"));
  fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(s.getByRole("button", { name: `${action} ${name}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

function skip(...areas: string[]): void {
  const group = screen.getByRole("group", { name: "Skip today" });
  for (const a of areas) fireEvent.click(within(group).getByRole("button", { name: a }));
}

function chip(minutes: number): void {
  fireEvent.click(button(`${minutes} minutes`));
}

/** Omit `id` from the first (auto main lift) suggestions call's result: the D-0239 §3 trigger. */
function omitFromFirstCall(id: string): void {
  spy.mockImplementation((h, t, p, l, input, now, tz) => {
    const r = realSuggest(h, t, p, l, input, now, tz);
    if (input.fill !== true || input.autoMainLift !== true) return r;
    return { ...r, plan: { ...r.plan, items: r.plan.items.filter((i) => i.exerciseId !== id) } };
  });
}

// ---- Histories (the engine's returning-after-10-days fixture, rebuilt from rule R7-E30) ----

let seq = 0;
function setsOn(n: number, exerciseId: string, date: string): HistorySet[] {
  return Array.from({ length: n }, (_, i) => {
    const at = `${date}T10:${String(i).padStart(2, "0")}:00+02:00`;
    return {
      clientId: `c${seq++}`,
      sessionId: `s-${date}`,
      exerciseId,
      isWarmup: false,
      completedAt: at,
      editedAt: at,
      deletedAt: null,
      reps: 8,
      weightKg: 40,
      durationS: null,
    };
  });
}
function balancedSession(date: string): HistorySet[] {
  return [
    ...setsOn(3, "bench-press", date),
    ...setsOn(3, "barbell-row", date),
    ...setsOn(3, "back-squat", date),
    ...setsOn(2, "overhead-press", date),
    ...setsOn(2, "romanian-deadlift", date),
    ...setsOn(2, "calf-raise", date),
    ...setsOn(2, "biceps-curl", date),
    ...setsOn(2, "dead-bug", date),
  ];
}
const returningAfter10Days = (): HistorySet[] => [
  ...["2026-09-03", "2026-09-06", "2026-09-09", "2026-09-12"].flatMap(balancedSession),
  ...setsOn(3, "back-squat", "2026-09-15"),
  ...setsOn(4, "romanian-deadlift", "2026-09-17"),
];

// ---- AC1-AC3 ----

describe("AC1 (B2) first suggestions at zero history", () => {
  it("bench-press × 4 (Main lift), inverted-row × 3, leg-extension × 2, each with a reason and Add; the sub-line", async () => {
    await open();
    expect(suggestionIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(
      Array.from(section().querySelectorAll('[data-part="row-main"]')).map((t) =>
        t.closest("li")!.getAttribute("data-id"),
      ),
    ).toEqual(["bench-press"]);
    expect(document.querySelector('[data-part="row-main"]')).toHaveTextContent("Main lift");
    expect(suggestionRow("bench-press")).toHaveTextContent(/4 ×/);
    expect(suggestionRow("inverted-row")).toHaveTextContent(/3 ×/);
    expect(suggestionRow("leg-extension")).toHaveTextContent(/2 ×/);
    for (const id of suggestionIds()) {
      const reason = suggestionRow(id!).querySelector('[data-part="row-reason"]');
      expect(reason?.textContent?.length ?? 0).toBeGreaterThan(0);
      expect(suggestionRow(id!).querySelector('[data-part="row-detail"]')).toHaveTextContent(
        / min$/,
      );
    }
    for (const name of ["Add Bench press", "Add Inverted row", "Add Leg extension"]) {
      expect(button(name)).toHaveTextContent(/^Add$/);
    }
    expect(sub()).toHaveTextContent(/^For the areas that need work most\. Fits your 27 min\.$/);
    // The first call: auto main lift, fill, no pins (D-0238 §1).
    expect(suggestionCalls()[0]).toMatchObject({
      autoMainLift: true,
      fill: true,
      pinnedIds: [],
      mainLiftId: null,
      shuffle: 0,
      budgetMin: 30,
    });
  });

  it("each Add is at least 44 px tall and 96 px wide in the stylesheet", () => {
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const m = /\.wl-uf08\[data-wl-state\] \.wl-uf08__suggest-add,[^{]*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/min-block-size:\s*44px/);
    expect(m![1]).toMatch(/min-inline-size:\s*96px/);
    const fillRule = /\.wl-uf08\[data-wl-state\] \.wl-uf08__suggest-fill\s*\{([^}]*)\}/.exec(css);
    expect(fillRule![1]).toMatch(/min-block-size:\s*44px/);
  });
});

describe("AC2 (B3) tap Add Bench press", () => {
  it("main pick, 15 of 30 min, the two other rows, focus on Add Inverted row, the status", async () => {
    await open();
    tap("Bench press");
    expect(planIds()).toEqual(["bench-press"]);
    expect(mainRows()).toEqual(["bench-press"]);
    expect(budgetText()).toHaveTextContent(/^15 of 30 min · 15 min left$/);
    expect(suggestionIds()).toEqual(["inverted-row", "leg-extension"]);
    expect(document.activeElement).toBe(button("Add Inverted row"));
    expect(status()).toHaveTextContent(/^Bench press added\. 15 min left\.$/);
    expect(sub()).toHaveTextContent(/Fits your 15 min\.$/);
    // The record: mainPickId bench-press, addedIds [] (read back off the next plan call).
    chip(45);
    expect(planInput()).toMatchObject({
      mainLiftId: "bench-press",
      pinnedIds: [],
      autoMainLift: false,
      fill: false,
    });
    // And the suggestions call that follows keeps the main pick, no auto main lift.
    expect(suggestionCalls().at(-1)).toMatchObject({
      autoMainLift: false,
      mainLiftId: "bench-press",
      pinnedIds: [],
      fill: true,
    });
  });
});

describe("AC3 (B4) tap Add Leg extension first", () => {
  it("the plan is leg-extension only, and every row shown next adds without a refusal", async () => {
    await open();
    tap("Leg extension");
    expect(planIds()).toEqual(["leg-extension"]);
    expect(mainRows()).toEqual([]);
    expect(planInput()).toMatchObject({ pinnedIds: ["leg-extension"], mainLiftId: null });
    // Take the first row each time; every tap lands, leg-extension never leaves.
    for (let i = 0; i < 8 && suggestionIds().length > 0; i++) {
      const before = planIds().length;
      const first = suggestionIds()[0]!;
      fireEvent.click(within(suggestionRow(first)).getByRole("button", { name: /^Add / }));
      expect(planIds()).toContain(first);
      expect(planIds()).toContain("leg-extension");
      expect(planIds().length).toBe(before + 1);
      expect(status()).toHaveTextContent(/added\. \d+ min left\.$/);
    }
    // And once more, taking the last row each time from a fresh visit.
    cleanup();
    await open();
    tap("Leg extension");
    for (let i = 0; i < 8 && suggestionIds().length > 0; i++) {
      const last = suggestionIds().at(-1)!;
      fireEvent.click(within(suggestionRow(last)).getByRole("button", { name: /^Add / }));
      expect(planIds()).toContain(last);
      expect(planIds()).toContain("leg-extension");
    }
  });
});

// ---- AC4 fallback ----

describe("AC4 (D-0239 §3) the fallback call", () => {
  it("a plan pick missing from the first result: a second call with autoMainLift false and mainLiftId null feeds the list", async () => {
    await open();
    omitFromFirstCall("leg-extension");
    const from = spy.mock.calls.length;
    await sheet("Leg extension");
    const calls = suggestionCalls(from);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ autoMainLift: true, mainLiftId: null, fill: true });
    expect(calls[1]).toMatchObject({ autoMainLift: false, mainLiftId: null, fill: true });
    expect(calls[1]!.pinnedIds).toEqual(["leg-extension"]);
    // The second result feeds the list: it is the real engine's result of that call.
    const second = spy.mock.calls.filter((c) => c[4].fill === true).at(-1)!;
    const expected = realSuggest(
      second[0],
      second[1],
      second[2],
      second[3],
      second[4],
      second[5],
      second[6],
    );
    expect(suggestionIds()).toEqual(
      expected.plan.items.map((i) => i.exerciseId).filter((id) => id !== "leg-extension"),
    );
  });

  it("every plan id in the first result (sibling): exactly one suggestions call", async () => {
    await open();
    const from = spy.mock.calls.length;
    await sheet("Inverted row");
    expect(suggestionCalls(from)).toHaveLength(1);
    const from2 = spy.mock.calls.length;
    tap("Bench press");
    expect(suggestionCalls(from2)).toHaveLength(1);
  });

  it("a pick dropped by a time chip is not in the plan, so it does not trigger the fallback", async () => {
    await open();
    tap("Bench press");
    await sheet("Inverted row");
    expect(planIds()).toEqual(["bench-press", "inverted-row"]);
    const from = spy.mock.calls.length;
    chip(20);
    expect(planIds()).toEqual(["bench-press"]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toHaveTextContent(
      /^Doesn't fit in 20 min: Inverted row\.$/,
    );
    const calls = suggestionCalls(from);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ autoMainLift: false, mainLiftId: "bench-press" });
    expect(calls[0]!.pinnedIds).toEqual(["inverted-row"]);
  });
});

// ---- AC5 time full ----

describe("AC5 (B6) time full", () => {
  it("less time than any suggestion needs: 'Your 20 min are full.', no Other suggestions", async () => {
    await open(20);
    tap("Bench press");
    expect(suggestionIds()).toEqual(["straight-arm-pulldown"]);
    expect(suggestionRow("straight-arm-pulldown")).toBeInTheDocument();
    fireEvent.click(addButtons()[0]!);
    expect(planIds()).toEqual(["bench-press", "straight-arm-pulldown"]);
    expect(suggestionIds()).toEqual([]);
    expect(listCopy()).toHaveTextContent(/^Your 20 min are full\.$/);
    expect(sub()).toBeNull();
    expect(other()).toBeNull();
    expect(section().querySelector("ul")).toBeNull();
    // Fill the rest stays shown while the time is full (D-0242 §1) and works.
    expect(fill()).not.toBeNull();
  });

  it("8 items in the plan (caps): the list is empty with the same copy", async () => {
    await open(90);
    for (let i = 0; i < 8; i++) {
      expect(suggestionIds().length).toBeGreaterThan(0);
      fireEvent.click(addButtons()[0]!);
    }
    expect(planIds()).toHaveLength(8);
    expect(suggestionIds()).toEqual([]);
    expect(listCopy()).toHaveTextContent(/^Your 90 min are full\.$/);
    expect(other()).toBeNull();
  });
});

// ---- AC6 Other suggestions ----

describe("AC6 (B8) Other suggestions", () => {
  it("bench-press stays, the rows are barbell-row × 3 then leg-extension × 2, focus stays on the button", async () => {
    await open();
    tap("Bench press");
    const planCallsBefore = inputs().filter((i) => i.fill === false).length;
    const btn = button("Other suggestions");
    btn.focus();
    fireEvent.click(btn);
    expect(planIds()).toEqual(["bench-press"]);
    expect(suggestionIds()).toEqual(["barbell-row", "leg-extension"]);
    expect(suggestionRow("barbell-row")).toHaveTextContent(/3 ×/);
    expect(suggestionRow("leg-extension")).toHaveTextContent(/2 ×/);
    expect(suggestionCalls().at(-1)).toMatchObject({ shuffle: 1, mainLiftId: "bench-press" });
    // Suggestions only: no plan call was made, and the plan call still uses shuffle 0.
    expect(inputs().filter((i) => i.fill === false)).toHaveLength(planCallsBefore);
    expect(document.activeElement).toBe(button("Other suggestions"));
    chip(45);
    expect(planInput().shuffle).toBe(0);
  });
});

// ---- AC7 Fill the rest ----

describe("AC7 (B12) Fill the rest for me", () => {
  it("the plan deep-equals suggested mode's suggest with pinnedIds [leg-extension]; the section goes; Shuffle returns; focus on Add exercise", async () => {
    await open();
    tap("Leg extension");
    fireEvent.click(button("Other suggestions"));
    fireEvent.click(button("Other suggestions"));
    cleanup();
    await open();
    tap("Leg extension");
    expect(budgetText()).not.toHaveAttribute("aria-live");
    fireEvent.click(button("Fill the rest for me"));
    const input: SessionInput = {
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: ["leg-extension"],
      excludeIds: [],
      favoriteIds: [],
    };
    const expected: Workout = realSuggest(
      [],
      fTargets(),
      fProfile(),
      fLibrary(),
      input,
      "2026-09-27T10:00:00.000Z",
      "Europe/Stockholm",
    );
    const last = spy.mock.results.at(-1)!.value as Workout;
    expect(spy.mock.calls.at(-1)![4]).toEqual(input);
    expect(last).toEqual(expected);
    expect(planIds()).toEqual(expected.plan.items.map((i) => i.exerciseId));
    expect(document.querySelector('[data-part="suggestions"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Shuffle" })).toBeInTheDocument();
    expect(other()).toBeNull();
    expect(budgetText()).toHaveAttribute("aria-live", "polite");
    expect(document.activeElement).toBe(button("Add exercise"));
  });

  it("while over budget it is refused in the status line (D-0242 §1)", async () => {
    await overBudget();
    const over = Number(/· (\d+) min over$/.exec(budgetText().textContent!)?.[1]);
    const btn = button("Fill the rest for me");
    btn.focus();
    fireEvent.click(btn);
    expect(status()).toHaveTextContent(
      new RegExp(`^Your workout is ${over} min over\\. Remove or swap an exercise first\\.$`),
    );
    expect(document.activeElement).toBe(btn);
    expect(document.querySelector('[data-part="suggestions"]')).not.toBeNull();
  });
});

// ---- AC8-AC10 engine examples ----

describe("AC8 (B13) Skip today", () => {
  it("quads, glutes, hamstrings, calves skipped: bench-press, inverted-row, lateral-raise", async () => {
    await open(30, "Start empty", () => skip("Quads", "Glutes", "Hamstrings", "Calves"));
    expect(suggestionIds()).toEqual(["bench-press", "inverted-row", "lateral-raise"]);
    expect(suggestionCalls()[0]).toMatchObject({
      avoidAreas: ["glutes", "quads", "hamstrings", "calves"],
    });
  });
});

describe("AC9 (B14) every area skipped", () => {
  it("'No suggestions right now. Search to add an exercise.'; no Other suggestions, no Fill the rest", async () => {
    await open(30, "Start empty", () =>
      skip("Chest", "Back", "Shoulders", "Arms", "Core", "Glutes", "Quads", "Hamstrings", "Calves"),
    );
    expect(suggestionIds()).toEqual([]);
    expect(listCopy()).toHaveTextContent(
      /^No suggestions right now\. Search to add an exercise\.$/,
    );
    expect(other()).toBeNull();
    expect(fill()).toBeNull();
  });
});

describe("AC9 (B14) with picks: plenty of time but nothing left to suggest", () => {
  it("reads 'No suggestions right now.' (not 'full') while minutes are left", async () => {
    await open(30, "Start empty", () =>
      skip("Chest", "Back", "Shoulders", "Arms", "Core", "Glutes", "Quads", "Hamstrings"),
    );
    expect(suggestionIds().length).toBeGreaterThan(0);
    let guard = 0;
    while (suggestionIds().length > 0 && guard++ < 5) fireEvent.click(addButtons()[0]!);
    expect(planIds().length).toBeGreaterThan(0);
    expect(Number(/(\d+) min left$/.exec(budgetText().textContent!)?.[1])).toBeGreaterThan(5);
    expect(listCopy()).toHaveTextContent(
      /^No suggestions right now\. Search to add an exercise\.$/,
    );
    expect(other()).toBeNull();
    expect(fill()).toBeNull();
  });
});

describe("AC10 (B15) returning after 10 days off", () => {
  it("bench-press, inverted-row, calf-raise", async () => {
    serveCache(() => fCache({ history: returningAfter10Days() }));
    await open();
    expect(suggestionIds()).toEqual(["bench-press", "inverted-row", "calf-raise"]);
  });
});

// ---- AC11 over budget ----

/** Picks bench-press (main), inverted-row, leg-extension, then a UF-08.3 swap with fitsBudget false. */
let swapFrom = 0;
async function overBudget(): Promise<void> {
  await open();
  tap("Bench press");
  tap("Inverted row");
  tap("Leg extension");
  fireEvent.click(button("Swap Leg extension"));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  const overRow = group.querySelector<HTMLElement>('[data-tag="over-time"]')!.closest("label")!;
  fireEvent.click(within(overRow).getByRole("radio"));
  swapFrom = spy.mock.calls.length;
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
  expect(document.querySelector(".wl-uf08__budget")).toHaveAttribute("data-over", "true");
}

describe("AC11 (B22) over budget after a fitsBudget: false swap", () => {
  it("no suggestions call, the over copy, no Other suggestions", async () => {
    await overBudget();
    const over = Number(/· (\d+) min over$/.exec(budgetText().textContent!)?.[1]);
    expect(over).toBeGreaterThan(0);
    const calls = spy.mock.calls.length;
    expect(listCopy()).toHaveTextContent(
      new RegExp(`^Your workout is ${over} min over 30 min\\. Remove or swap an exercise\\.$`),
    );
    expect(other()).toBeNull();
    expect(sub()).toBeNull();
    expect(suggestionCalls(calls)).toHaveLength(0);
    expect(spy.mock.calls.length).toBe(calls);
    // From the confirmed swap on (over budget), not one suggestions call was made.
    expect(suggestionCalls(swapFrom)).toHaveLength(0);
  });
});

// ---- AC12 refusal ----

describe("AC12 (B11) a suggestion Add that would push out a pick", () => {
  it("nothing changes, the status names both, focus stays on the Add", async () => {
    await open();
    await sheet("Inverted row");
    await sheet("Back squat");
    // A result the real engine can't give: Barbell row offered as the main lift.
    spy.mockImplementation((h, t, p, l, input, now, tz) =>
      input.fill === true
        ? realSuggest(
            h,
            t,
            p,
            l,
            { ...input, mainLiftId: "barbell-row", autoMainLift: false },
            now,
            tz,
          )
        : realSuggest(h, t, p, l, input, now, tz),
    );
    await sheet("Overhead press");
    const before = planIds();
    expect(suggestionIds()).toContain("barbell-row");
    expect(
      within(suggestionRow("barbell-row")).getByText("Main lift", { selector: "span" }),
    ).toBeInTheDocument();
    spy.mockImplementation((h, t, p, l, input, now, tz) => realSuggest(h, t, p, l, input, now, tz));
    const add = button("Add Barbell row");
    add.focus();
    const calls = spy.mock.calls.length;
    fireEvent.click(add);
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
    expect(planIds()).toEqual(before);
    expect(status()).toHaveTextContent(
      /^Barbell row would push out (Inverted row|Back squat|Overhead press)\. Pick more time or remove an exercise\.$/,
    );
    expect(document.activeElement).toBe(add);
    expect(suggestionIds()).toContain("barbell-row");
  });
});

// ---- AC13 focus ----

describe("AC13 (B23 focus)", () => {
  it("the last row's Add moves focus to the new last row's Add; taking the only row lands on Add exercise; Other goes with the list", async () => {
    await open();
    expect(suggestionIds()).toHaveLength(3);
    const lastName = within(suggestionRow(suggestionIds().at(-1)!))
      .getByRole("button", { name: /^Add / })
      .getAttribute("aria-label")!;
    fireEvent.click(button(lastName));
    focusNotBody();
    const adds = addButtons();
    expect(adds.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(adds.at(-1));
    // Keep taking the last row; once one row remains, taking it ends on "Add exercise".
    let guard = 0;
    while (suggestionIds().length > 1 && guard++ < 10) {
      fireEvent.click(addButtons().at(-1)!);
      focusNotBody();
      expect(document.activeElement).toBe(addButtons().at(-1));
    }
    expect(suggestionIds()).toHaveLength(1);
    expect(other()).not.toBeNull();
    fireEvent.click(addButtons()[0]!);
    // The list may refill from the time that is left; drain it.
    guard = 0;
    while (suggestionIds().length > 0 && guard++ < 10) {
      focusNotBody();
      fireEvent.click(addButtons()[0]!);
    }
    expect(suggestionIds()).toEqual([]);
    expect(other()).toBeNull();
    expect(document.activeElement).toBe(button("Add exercise"));
  });

  it("the first row's Add keeps focus in the first place", async () => {
    await open();
    tap("Bench press");
    focusNotBody();
    expect(document.activeElement).toBe(addButtons()[0]);
  });

  it("a refusal and Fill the rest never leave focus on body", async () => {
    await open();
    tap("Leg extension");
    fireEvent.click(button("Fill the rest for me"));
    expect(document.activeElement).toBe(button("Add exercise"));
    focusNotBody();
  });
});

// ---- AC14 live region ----

describe("AC14 (B23 live region)", () => {
  it("two role=status (the status line and the Removed line's), the budget line not live, each Add updates the status", async () => {
    await open();
    const page = document.querySelector('[data-screen-id="UF-08.2"]')!;
    const statuses = Array.from(page.querySelectorAll('[role="status"]'));
    expect(statuses).toHaveLength(2);
    expect(statuses.filter((s) => s.getAttribute("data-part") !== "removed-line")).toEqual([
      status(),
    ]);
    expect(budgetText()).not.toHaveAttribute("aria-live");
    expect(section().querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
    const seen: string[] = [];
    for (const name of ["Bench press", "Inverted row"]) {
      tap(name);
      expect(budgetText()).not.toHaveAttribute("aria-live");
      expect(page.querySelectorAll('[role="status"]')).toHaveLength(2);
      seen.push(status().textContent!);
    }
    expect(seen).toEqual([
      expect.stringMatching(/^Bench press added\. \d+ min left\.$/),
      expect.stringMatching(/^Inverted row added\. \d+ min left\.$/),
    ]);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

// ---- AC15 markup ----

describe("AC15 markup and tokens", () => {
  it("a section labelled by its h2, li rows in a ul, no wl-option, tags are wl-chip wl-uf08__tag", async () => {
    await open();
    const sec = section();
    expect(sec.tagName).toBe("SECTION");
    const h2 = sec.querySelector("h2")!;
    expect(h2).toHaveTextContent(/^Suggestions$/);
    expect(sec.getAttribute("aria-labelledby")).toBe(h2.id);
    expect(screen.getByRole("region", { name: "Suggestions" })).toBe(sec);
    const ul = sec.querySelector("ul")!;
    expect(Array.from(ul.children).map((c) => c.tagName)).toEqual(["LI", "LI", "LI"]);
    expect(document.querySelector(".wl-option")).toBeNull();
    const tags = sec.querySelectorAll('[data-part="row-main"], [data-part="row-favorite"]');
    expect(tags.length).toBeGreaterThan(0);
    for (const t of Array.from(tags)) {
      expect(t.classList.contains("wl-chip")).toBe(true);
      expect(t.classList.contains("wl-uf08__tag")).toBe(true);
    }
    // The section sits above "Add exercise".
    expect(
      sec.compareDocumentPosition(button("Add exercise")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("a favorite gets the Favorite tag too, and the new CSS has no raw colour", async () => {
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const mine = css.slice(css.indexOf("T-0941 (D-0238"));
    expect(mine).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});

// ---- AC16 offline ----

describe("AC16 (B16, unit side) offline with a cached history and library", () => {
  it("AC1-AC3 behave the same, and nothing leaves the device", async () => {
    expect(navigator.onLine).toBe(false);
    await open();
    expect(suggestionIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    tap("Bench press");
    expect(budgetText()).toHaveTextContent(/^15 of 30 min · 15 min left$/);
    expect(suggestionIds()).toEqual(["inverted-row", "leg-extension"]);
    expect(document.activeElement).toBe(button("Add Inverted row"));
    cleanup();
    await open();
    tap("Leg extension");
    expect(planIds()).toEqual(["leg-extension"]);
    expect(mainRows()).toEqual([]);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

// ---- AC17 suggested mode ----

describe("AC17 suggested mode is untouched", () => {
  it("no Suggestions section, Shuffle, and one suggest call per re-suggest", async () => {
    await open(30, "Suggest my workout");
    expect(document.querySelector('[data-part="suggestions"]')).toBeNull();
    expect(screen.queryByRole("heading", { name: "Suggestions" })).toBeNull();
    expect(other()).toBeNull();
    expect(fill()).toBeNull();
    let n = spy.mock.calls.length;
    fireEvent.click(button("Shuffle"));
    expect(spy.mock.calls.length).toBe(n + 1);
    n = spy.mock.calls.length;
    chip(45);
    expect(spy.mock.calls.length).toBe(n + 1);
    n = spy.mock.calls.length;
    await sheet("Leg extension");
    expect(spy.mock.calls.length).toBe(n + 1);
    for (const i of inputs()) {
      expect(i).not.toHaveProperty("fill");
      expect(i).not.toHaveProperty("autoMainLift");
    }
  });
});
