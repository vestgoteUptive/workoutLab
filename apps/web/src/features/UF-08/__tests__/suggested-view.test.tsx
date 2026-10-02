// T-0303b UF-08.2 rendering: AC-2 (rows), AC-3 (warm-up row, empty plan), AC-4 (session chips),
// AC-6 (the chip group's pressed state), AC-7 (the bar) and AC-10 (focus after Remove, D-0109 §6),
// on injected `Workout`s. `Suggested` is rendered on its own inside a router; the host's actions
// are covered in suggested-actions.test.tsx.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Reason, Workout, WorkoutItem } from "@workoutlab/engine";
import { sessionReasonChips } from "../../../lib/i18n/workout.js";
import { Suggested, type SuggestedProps } from "../Suggested.js";
import { fLibrary, LOCALE } from "./fixtures.js";
import { settle } from "./harness.js";
import { benchItem, wR7E4 } from "./workouts.js";

vi.mock("../../../lib/i18n/workout.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/i18n/workout.js")>();
  return { ...actual, sessionReasonChips: vi.fn(actual.sessionReasonChips) };
});

const chipsSpy = vi.mocked(sessionReasonChips);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function props(workout: Workout, overrides: Partial<SuggestedProps> = {}): SuggestedProps {
  return {
    workout,
    library: fLibrary(),
    locale: LOCALE,
    onRemove: vi.fn(),
    onShuffle: vi.fn(),
    onBudget: vi.fn(),
    ...overrides,
  };
}

function show(workout: Workout, overrides: Partial<SuggestedProps> = {}) {
  return render(
    <MemoryRouter initialEntries={["/session/setup?step=suggested"]}>
      <Suggested {...props(workout, overrides)} />
    </MemoryRouter>,
  );
}

function withItem(index: number, change: Partial<WorkoutItem>): Workout {
  const w = wR7E4();
  w.plan.items[index] = { ...w.plan.items[index]!, ...change };
  return w;
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-part="item-row"]'));
const part = (row: HTMLElement, name: string) =>
  row.querySelector<HTMLElement>(`[data-part="${name}"]`);
const detail = (index: number) => part(rows()[index]!, "row-detail")!.textContent;
const names = () => rows().map((r) => part(r, "row-name")!.textContent);
const segments = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-part="bar"] > [data-segment]'));
const budgetText = () => document.querySelector<HTMLElement>('[data-part="budget-text"]')!;

describe("AC-2 rows render the engine (principle 3, D-0109 §4)", () => {
  it("W-R7E4 with zero history: names, details and reasons in plan order", () => {
    show(wR7E4());
    expect(names()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
    expect(rows().map((r) => part(r, "row-detail")!.textContent)).toEqual([
      "4 × 6–8 · 12 min",
      "3 × 8–12 · Bodyweight · 10 min",
      "2 × 10–15 · 5 min",
    ]);
    expect(part(rows()[0]!, "row-reason")).toHaveTextContent(
      /^Main lift · Chest 100 % below target$/,
    );
  });

  it.each([
    [80, "4 × 6–8 · 80 kg · 12 min"],
    [77.5, "4 × 6–8 · 77.5 kg · 12 min"],
    [null, "4 × 6–8 · 12 min"],
  ] as const)("bench-press prefill.weightKg %s → %s", (weightKg, text) => {
    show(withItem(0, { prefill: { weightKg, reps: 6, durationS: null, kind: "carry" } }));
    expect(detail(0)).toBe(text);
  });

  it("a hold_after_break pre-fill of 100 kg renders as returned", () => {
    show(
      withItem(0, {
        prefill: { weightKg: 100, reps: 6, durationS: null, kind: "hold_after_break" },
      }),
    );
    expect(detail(0)).toBe("4 × 6–8 · 100 kg · 12 min");
  });

  it("weight 0: externalLoad false reads 'Bodyweight', externalLoad true reads '0 kg'", () => {
    show(withItem(0, { prefill: { weightKg: 0, reps: 6, durationS: null, kind: "carry" } }));
    // bench-press is externalLoad: true; inverted-row (index 1, weight 0) is false.
    expect(detail(0)).toBe("4 × 6–8 · 0 kg · 12 min");
    expect(detail(1)).toBe("3 × 8–12 · Bodyweight · 10 min");
  });

  it("the weight follows the locale (sv-SE 77,5)", () => {
    show(withItem(0, { prefill: { weightKg: 77.5, reps: 6, durationS: null, kind: "carry" } }), {
      locale: "sv-SE",
    });
    expect(detail(0)).toBe("4 × 6–8 · 77,5 kg · 12 min");
  });

  it.each([
    [{ weightKg: 70, reps: 6 }, "+ 1 back-off 70 × 6"],
    [{ weightKg: null, reps: 6 }, "+ 1 back-off set"],
    [null, null],
  ] as const)("back-off %j → %s", (backoff, line) => {
    show(withItem(0, { backoff }));
    const el = part(rows()[0]!, "row-backoff");
    if (line === null) expect(el).toBeNull();
    else expect(el).toHaveTextContent(new RegExp(`^${line.replace(/[+]/g, "\\+")}$`));
    // No other row carries a back-off line.
    expect(document.querySelectorAll('[data-part="row-backoff"]')).toHaveLength(line ? 1 : 0);
  });

  it("a timed item: '3 × 45 s · Bodyweight · 6 min' (plank is externalLoad false)", () => {
    show(
      withItem(2, {
        exerciseId: "plank",
        sets: 3,
        repsMin: null,
        repsMax: null,
        durationS: 45,
        costS: 330,
        prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" },
      }),
    );
    expect(names()[2]).toBe("Plank");
    expect(detail(2)).toBe("3 × 45 s · Bodyweight · 6 min");
  });

  it("no sorting: reversed items render reversed", () => {
    const w = wR7E4();
    w.plan.items.reverse();
    show(w);
    expect(names()).toEqual(["Leg extension", "Inverted row", "Bench press"]);
  });

  it("reason element: '' → none; a reason → one", () => {
    show(withItem(1, { reasons: [{ code: "prefill", kind: "first_time" }] }));
    expect(part(rows()[1]!, "row-reason")).toBeNull();
    expect(part(rows()[2]!, "row-reason")).toHaveTextContent(/^Quads 100 % below target$/);
  });

  it("a name falls back to the exerciseId when the library lacks it", () => {
    show(withItem(2, { exerciseId: "mystery-move" }));
    expect(names()[2]).toBe("mystery-move");
  });
});

describe("AC-3 warm-up row and empty plan", () => {
  it("the warm-up row: title, library names in plan order, 3 min, no button", () => {
    show(wR7E4());
    const row = document.querySelector<HTMLElement>('[data-part="warmup-row"]')!;
    expect(part(row, "row-name")).toHaveTextContent(/^Warm-up$/);
    expect(part(row, "row-detail")).toHaveTextContent(
      /^Wu scap push up, Wu band pull apart, Wu bodyweight squat, Wu arm circle$/,
    );
    expect(part(row, "row-minutes")).toHaveTextContent(/^3 min$/);
    expect(within(row).queryAllByRole("button")).toEqual([]);
  });

  it("plan.warmup [] → no warm-up row", () => {
    const w = wR7E4();
    w.plan.warmup = [];
    show(w);
    expect(document.querySelector('[data-part="warmup-row"]')).toBeNull();
  });

  it("items [] → 'Nothing fits in 30 min' and Looks good stays enabled", () => {
    const w = wR7E4();
    w.plan.items = [];
    show(w);
    expect(screen.getByText("Nothing fits in 30 min")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Looks good" });
    expect(go).toBeEnabled();
    expect(go).not.toHaveAttribute("aria-disabled", "true");
  });

  it("items present → no 'Nothing fits' text", () => {
    show(wR7E4());
    expect(screen.queryByText(/^Nothing fits/)).toBeNull();
  });
});

describe("AC-4 session chips (D-0106 §4)", () => {
  const chipTexts = () =>
    Array.from(document.querySelectorAll('[data-part="session-chips"] > li')).map(
      (li) => li.textContent,
    );

  it("W-R7E4 renders Chest, Back, Quads from one sessionReasonChips call", () => {
    const w = wR7E4();
    show(w);
    expect(chipTexts()).toEqual(["Chest", "Back", "Quads"]);
    expect(chipsSpy).toHaveBeenCalledTimes(1);
    expect(chipsSpy.mock.calls[0]![0]).toBe(w.sessionReasons);
  });

  it("recovering_skipped quads → 'Quads recovering, skipped'", () => {
    const w = wR7E4();
    w.sessionReasons = [{ code: "recovering_skipped", area: "quads" }];
    show(w);
    expect(chipTexts()).toEqual(["Quads recovering, skipped"]);
  });

  it("4 reasons → 3 chips", () => {
    const w = wR7E4();
    w.sessionReasons = [
      ...w.sessionReasons,
      { code: "area_deficit", area: "calves", deficit: 1 } as Reason,
    ];
    show(w);
    expect(chipTexts()).toEqual(["Chest", "Back", "Quads"]);
  });

  it("[] → no chip list element", () => {
    const w = wR7E4();
    w.sessionReasons = [];
    show(w);
    expect(document.querySelector('[data-part="session-chips"]')).toBeNull();
    expect(screen.queryByRole("list", { name: "Why this workout" })).toBeNull();
  });
});

describe("AC-6 the Time group (D-0109 §3)", () => {
  const pressed = () =>
    within(screen.getByRole("group", { name: "Time" }))
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);

  it("holds 20/30/45/60/90; at 30 exactly the 30 chip is pressed", () => {
    show(wR7E4());
    const chips = within(screen.getByRole("group", { name: "Time" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["20", "30", "45", "60", "90"]);
    expect(pressed()).toEqual(["30"]);
  });

  it("at 50 no chip is pressed", () => {
    const w = wR7E4();
    w.budgetMin = 50;
    show(w);
    expect(pressed()).toEqual([]);
  });

  it("re-pressing the active chip calls nothing; another chip calls onBudget once", async () => {
    const onBudget = vi.fn();
    show(wR7E4(), { onBudget });
    fireEvent.click(screen.getByRole("button", { name: "30 minutes" }));
    await settle();
    expect(onBudget).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "20 minutes" }));
    expect(onBudget).toHaveBeenCalledTimes(1);
    expect(onBudget).toHaveBeenCalledWith(20);
  });
});

describe("AC-7 the bar (D-0109 §5)", () => {
  const grows = () => segments().map((s) => [s.dataset.segment, s.style.flexGrow]);
  const warned = () =>
    segments().filter((s) => getComputedStyle(s).backgroundColor === "var(--wl-color-warn)");

  it("warm-up in budget: aria-hidden, warm-up 180, items 720/555/270, unused 75; 'About 29 of 30 min'", () => {
    show(wR7E4());
    expect(document.querySelector('[data-part="bar"]')).toHaveAttribute("aria-hidden", "true");
    expect(grows()).toEqual([
      ["warmup", "180"],
      ["item", "720"],
      ["item", "555"],
      ["item", "270"],
      ["unused", "75"],
    ]);
    expect(budgetText()).toHaveTextContent(/^About 29 of 30 min$/);
    expect(warned()).toEqual([]);
  });

  it("warm-up off: no warm-up segment, unused 255; 'About 26 of 30 min + warm-up'", () => {
    const w = wR7E4();
    w.warmupInBudget = false;
    w.unusedS = 255;
    w.totalS = 1725;
    show(w);
    expect(grows()).toEqual([
      ["item", "720"],
      ["item", "555"],
      ["item", "270"],
      ["unused", "255"],
    ]);
    expect(budgetText()).toHaveTextContent(/^About 26 of 30 min \+ warm-up$/);
  });

  it("unusedS 0 → no unused segment", () => {
    const w = wR7E4();
    w.unusedS = 0;
    show(w);
    expect(segments().map((s) => s.dataset.segment)).toEqual(["warmup", "item", "item", "item"]);
  });

  function overBudget(itemsTotalS: number, warmupInBudget: boolean): Workout {
    const w = wR7E4();
    w.warmupInBudget = warmupInBudget;
    w.itemsTotalS = itemsTotalS;
    w.totalS = itemsTotalS + 180;
    w.unusedS = 0;
    return w;
  }

  it("over budget, warm-up in (availableS 1620, items 1830, total 2010): '34 min, 4 over', items warn", () => {
    show(overBudget(1830, true));
    expect(budgetText()).toHaveTextContent(/^34 min, 4 over$/);
    expect(warned().map((s) => s.dataset.segment)).toEqual(["item", "item", "item"]);
  });

  it("over budget, warm-up off (availableS 1800, items 1830): '31 min, 1 over + warm-up'", () => {
    show(overBudget(1830, false));
    expect(budgetText()).toHaveTextContent(/^31 min, 1 over \+ warm-up$/);
    expect(warned()).toHaveLength(3);
  });

  it("the boundary: items = availableS (1620) is within; 1621 is over", () => {
    const view = show(overBudget(1620, true));
    expect(budgetText()).toHaveTextContent(/^About 30 of 30 min$/);
    expect(warned()).toEqual([]);
    view.unmount();

    show(overBudget(1621, true));
    expect(budgetText()).toHaveTextContent(/^31 min, 1 over$/);
    expect(warned()).toHaveLength(3);
  });

  it("the text is a polite live region", () => {
    show(wR7E4());
    expect(budgetText()).toHaveAttribute("aria-live", "polite");
  });
});

describe("AC-10 names and focus after Remove (D-0109 §6)", () => {
  /** Plays the host: each Remove swaps in the next scripted `Workout`. */
  function Scripted({ start, next }: { start: Workout; next: Workout }) {
    const [workout, setWorkout] = useState(start);
    return <Suggested {...props(workout, { onRemove: () => setWorkout(next) })} />;
  }

  function play(start: Workout, next: Workout) {
    render(
      <MemoryRouter>
        <Scripted start={start} next={next} />
      </MemoryRouter>,
    );
  }

  const removeButtons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-part="remove"]'));

  it("Remove buttons are named 'Remove {name}'", () => {
    show(wR7E4());
    expect(removeButtons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remove Bench press",
      "Remove Inverted row",
      "Remove Leg extension",
    ]);
    expect(screen.getByRole("button", { name: "Remove Bench press" })).toBeInTheDocument();
  });

  it("removing row 1 of 3 focuses the new row 1's Remove", () => {
    const next = wR7E4();
    next.plan.items = [benchItem({ exerciseId: "db-bench-press" }), ...next.plan.items.slice(1)];
    play(wR7E4(), next);
    const first = screen.getByRole("button", { name: "Remove Bench press" });
    first.focus();
    fireEvent.click(first);
    expect(screen.getByRole("button", { name: "Remove Db bench press" })).toHaveFocus();
  });

  it("removing the last row focuses the new last row's Remove", () => {
    const next = wR7E4();
    next.plan.items = next.plan.items.slice(0, 2);
    play(wR7E4(), next);
    fireEvent.click(screen.getByRole("button", { name: "Remove Leg extension" }));
    expect(screen.getByRole("button", { name: "Remove Inverted row" })).toHaveFocus();
  });

  it("removing the only row focuses Looks good", () => {
    const start = wR7E4();
    start.plan.items = start.plan.items.slice(0, 1);
    const next = wR7E4();
    next.plan.items = [];
    play(start, next);
    fireEvent.click(screen.getByRole("button", { name: "Remove Bench press" }));
    expect(screen.getByRole("button", { name: "Looks good" })).toHaveFocus();
  });

  it("contrast: Shuffle moves no focus (no Remove pending)", () => {
    function ShuffleHost() {
      const [workout, setWorkout] = useState(wR7E4());
      return <Suggested {...props(workout, { onShuffle: () => setWorkout(wR7E4()) })} />;
    }
    render(
      <MemoryRouter>
        <ShuffleHost />
      </MemoryRouter>,
    );
    const shuffle = screen.getByRole("button", { name: "Shuffle" });
    shuffle.focus();
    fireEvent.click(shuffle);
    expect(shuffle).toHaveFocus();
  });
});
