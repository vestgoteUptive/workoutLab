// T-0308a UF-07.1: the draft. AC-A4 (move buttons, focus), A5 (limits), A6 (picker), A7 (no
// sets/reps/progression editing), A12 (an item missing from the library).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { R, R2, putRoutine, renderEditor, seed } from "./harness.js";
import { spy } from "./spies.js";

vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const NAME = "Name";
const HINT = "Name your routine (up to 40 characters)";
const SAVE = () => screen.getByRole("button", { name: "Save" });

async function ready(path: string) {
  renderEditor(path);
  await screen.findByLabelText(NAME);
  if (path.endsWith(R) || path.endsWith(R2)) await screen.findByText(/^1\. /);
}

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
const search = (value: string) =>
  fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value } });
const addButtons = () => screen.queryAllByRole("button", { name: /^Add (?!exercise$)/ });

beforeEach(() => seed());

describe("AC-A4 move buttons", () => {
  it("first Up and last Down are disabled; every other move button is enabled", async () => {
    await ready(`/plan/routines/${R}`);
    const btn = (n: string) => screen.getByRole("button", { name: n });
    expect(btn("Move Barbell back squat up")).toBeDisabled();
    expect(btn("Move Leg curl (machine) down")).toBeDisabled();
    expect(btn("Move Barbell back squat down")).toBeEnabled();
    expect(btn("Move Romanian deadlift (barbell) up")).toBeEnabled();
    expect(btn("Move Romanian deadlift (barbell) down")).toBeEnabled();
    expect(btn("Move Leg curl (machine) up")).toBeEnabled();
  });

  it("keeps focus on the moved row, falls to Down at the top, and announces the move", async () => {
    await ready(`/plan/routines/${R}`);
    const up = () => screen.getByRole("button", { name: "Move Leg curl (machine) up" });
    up().focus();
    fireEvent.click(up());
    expect(screen.getByText("2. Leg curl (machine)")).toBeInTheDocument();
    expect(up()).toHaveFocus();
    fireEvent.click(up());
    expect(screen.getByText("1. Leg curl (machine)")).toBeInTheDocument();
    expect(up()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Leg curl (machine) down" })).toHaveFocus();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Leg curl (machine) moved to position 1");
  });
});

describe("AC-A5 limits", () => {
  it.each([
    ["empty", ""],
    ["whitespace only", "    "],
    ["41 characters", "x".repeat(41)],
    ["41 after trimming", `  ${"x".repeat(41)}  `],
  ])("%s name disables Save and shows the hint", async (_label, value) => {
    await ready(`/plan/routines/${R}`);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value } });
    expect(SAVE()).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("contrast: exactly 40 characters enables Save and the hint is absent", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: `  ${"x".repeat(40)} ` } });
    expect(SAVE()).toBeEnabled();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("0 exercises disables Save; adding 1 enables it", async () => {
    await ready("/plan/routines/new");
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Legs" } });
    expect(SAVE()).toBeDisabled();
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Add Plank" }));
    expect(SAVE()).toBeEnabled();
  });

  it("an exercise already in the list shows a disabled Added and adds nothing", async () => {
    await ready(`/plan/routines/${R}`);
    openPicker();
    const row = screen.getByText("Leg curl (machine)", { selector: "ul span" }).closest("li")!;
    const added = within(row).getByRole("button", { name: "Added" });
    expect(added).toBeDisabled();
    fireEvent.click(added);
    expect(screen.getAllByText(/^\d\. /)).toHaveLength(3);
  });

  it("8 items disables every Add and shows the limit; removing one clears it", async () => {
    const eight = [
      "barbell-back-squat",
      "barbell-front-squat",
      "goblet-squat-dumbbell",
      "romanian-deadlift-barbell",
      "leg-curl-machine",
      "bench-press-barbell",
      "pull-up",
      "overhead-press",
    ];
    await putRoutine(R2, "Full", eight);
    await ready(`/plan/routines/${R2}`);
    openPicker();
    expect(screen.getByText("Up to 8 exercises")).toBeInTheDocument();
    expect(addButtons().length).toBeGreaterThan(0);
    for (const button of addButtons()) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove Pull-up" }));
    expect(screen.queryByText("Up to 8 exercises")).not.toBeInTheDocument();
    for (const button of addButtons()) expect(button).toBeEnabled();
  });
});

describe("AC-A6 picker scope and search", () => {
  const rowNames = () =>
    Array.from(
      document.querySelectorAll(".wl-routine-editor__matches .wl-routine-editor__row-name"),
    ).map((el) => el.textContent);

  it("empty query: every exercise in localeCompare order, no warmups", async () => {
    await ready("/plan/routines/new");
    openPicker();
    const names = rowNames();
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!, "en")));
    expect(names).toHaveLength(10);
    expect(names[0]).toBe("Arnold press");
    expect(names).not.toContain("Jumping jacks");
  });

  it("SQUAT lists the three squats, case-insensitively, in order", async () => {
    await ready("/plan/routines/new");
    openPicker();
    search("SQUAT");
    expect(rowNames()).toEqual(["Barbell back squat", "Barbell front squat", "Goblet squat"]);
  });

  it("a lowercase query matches capitalised names", async () => {
    await ready("/plan/routines/new");
    openPicker();
    search("  barbell ");
    expect(rowNames()).toEqual([
      "Barbell back squat",
      "Barbell front squat",
      "Romanian deadlift (barbell)",
    ]);
  });

  it("zzz shows the empty message and no Add buttons", async () => {
    await ready("/plan/routines/new");
    openPicker();
    search("zzz");
    expect(screen.getByText('No exercises match "zzz"')).toBeInTheDocument();
    expect(addButtons()).toHaveLength(0);
  });

  it("stays open after an Add, and Done closes it", async () => {
    await ready("/plan/routines/new");
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Add Plank" }));
    expect(screen.getByLabelText("Search exercises")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Search exercises")).not.toBeInTheDocument();
  });
});

describe("AC-A7 no sets/reps/progression editing", () => {
  it("has no number input, select, spinbutton or sets/reps/progression control", async () => {
    await ready(`/plan/routines/${R}`);
    openPicker();
    expect(document.querySelector("input[type=number]")).toBeNull();
    expect(document.querySelector("select")).toBeNull();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    for (const control of screen.queryAllByRole("button")) {
      expect(control.getAttribute("aria-label") ?? control.textContent).not.toMatch(
        /sets|reps|progression/i,
      );
    }
    const inputs = Array.from(document.querySelectorAll("input")).map((i) => i.id);
    expect(inputs).toEqual(["wl-routine-name", "wl-routine-search"]);
  });

  it("the progression card is exactly the D-0070 sentence, with no button or link inside", async () => {
    await ready(`/plan/routines/${R}`);
    const sentence =
      "Double progression. When every set reaches the top of its rep range, the weight goes up next time. After a long break or two short sessions in a row, it steps back.";
    const card = screen.getByText(sentence).closest("[data-card]")!;
    expect(card.textContent).toBe(sentence);
    expect(card.querySelector("button, a, input")).toBeNull();
  });
});

describe("AC-A12 an item missing from the library", () => {
  beforeEach(async () => {
    await putRoutine(R2, "Odd", ["barbell-back-squat", "retired-exercise"]);
  });

  it("shows the raw id, can be moved and removed, and saves unchanged", async () => {
    await ready(`/plan/routines/${R2}`);
    expect(screen.getByText("2. retired-exercise")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move retired-exercise up" }));
    expect(screen.getByText("1. retired-exercise")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move retired-exercise down" }));
    expect(screen.getByText("2. retired-exercise")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove retired-exercise" }));
    expect(screen.queryByText(/^\d\. retired-exercise/)).not.toBeInTheDocument();
  });

  it("a save with no edits sends the raw exercise_id at position 1", async () => {
    await ready(`/plan/routines/${R2}`);
    fireEvent.click(SAVE());
    await waitFor(() => expect(spy.calls).toHaveLength(3));
    const rows = spy.calls[2]!.payload as Array<{ position: number; exercise_id: string }>;
    expect(rows[1]).toMatchObject({ position: 1, exercise_id: "retired-exercise" });
  });
});
