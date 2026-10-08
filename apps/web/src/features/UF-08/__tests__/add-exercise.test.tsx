// T-0573 UF-08.5 Add exercise (part 1), AC1-AC9 (docs/tickets/T-0573). Loaders mocked; the real
// engine runs behind a spy. X1/X4 are the spec's engine examples, checked against `suggest` here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);

beforeEach(async () => {
  auth.status = "signed-in";
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const lastWorkout = () => spy.mock.results.at(-1)!.value as Workout;
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (n) => n.textContent,
  );
const rowDetails = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-detail"]')).map(
    (n) => n.textContent,
  );
const dialog = () => screen.getByRole("dialog");
const sheetStatus = () => document.querySelector('[data-part="sheet-status"]')!;
const pageStatus = () => document.querySelector('[data-part="status"]')!;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

/** UF-08.1 → `minutes` (30 by default) → Suggest: R7-E4 at 30 min. */
async function toPlan(minutes = 30): Promise<void> {
  renderSetup();
  await loaded();
  if (minutes === 30) fireEvent.click(button("30 minutes"));
  else for (let m = 45; m > minutes; m -= 5) fireEvent.click(button("5 minutes less"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

function openSheet(): void {
  fireEvent.click(button("Add exercise"));
}

async function addBackSquat(): Promise<void> {
  openSheet();
  fireEvent.click(within(dialog()).getByRole("button", { name: "Add Back squat" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("AC1 open, empty query", () => {
  it("focus in search; Today's areas Chest, Back, Quads; In this workout rows; Escape returns focus", async () => {
    await toPlan();
    const opener = button("Add exercise");
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    openSheet();
    expect(screenIds()).toEqual(["UF-08.2", "UF-08.5"]);
    const sheet = within(dialog());
    expect(sheet.getByLabelText("Search exercises")).toHaveFocus();
    expect(sheet.getByText("The rest of your workout adjusts to fit 30 min.")).toBeInTheDocument();
    const areas = sheet.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(areas).toEqual(["Chest", "Back", "Quads"]);
    const quads = within(sheet.getByRole("region", { name: "Quads" }));
    expect(quads.getByRole("button", { name: "Add Back squat" })).toBeInTheDocument();
    const leg = quads.getByText("Leg extension").closest("li")!;
    expect(within(leg).getByText("In this workout")).toBeInTheDocument();
    expect(within(leg).queryByRole("button")).toBeNull();
    const bench = sheet.getByRole("region", { name: "Chest" });
    const benchRow = within(bench).getByText("Bench press").closest("li")!;
    expect(within(benchRow).getByText("In this workout")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("Close closes it and returns focus to Add exercise", async () => {
    await toPlan();
    openSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button("Add exercise")).toHaveFocus();
  });
});

describe("AC2 search", () => {
  it("SQU lists exercise rows by name, no warm-up; zzz says nothing matches", async () => {
    await toPlan();
    openSheet();
    const search = within(dialog()).getByLabelText("Search exercises");
    fireEvent.change(search, { target: { value: "SQU" } });
    const names = Array.from(dialog().querySelectorAll(".wl-uf08__pick-name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Back squat"]);
    expect(within(dialog()).queryByText(/Wu bodyweight squat/)).toBeNull();
    fireEvent.change(search, { target: { value: "p" } });
    const many = Array.from(dialog().querySelectorAll(".wl-uf08__pick-name")).map(
      (n) => n.textContent!,
    );
    expect(many.length).toBeGreaterThan(3);
    expect(many).toEqual([...many].sort((a, b) => a.localeCompare(b, "en")));
    expect(many.every((n) => n.toLowerCase().includes("p"))).toBe(true);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(dialog()).getByText("No exercises match “zzz”.")).toBeInTheDocument();
  });
});

describe("AC3 one suggest call", () => {
  it("Add Back squat is one call with pinnedIds [back-squat], the plan's main lift and no excludes", async () => {
    await toPlan();
    openSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add Back squat" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastInput().pinnedIds).toEqual(["back-squat"]);
    expect(lastInput().mainLiftId).toBe("bench-press");
    expect(lastInput().excludeIds).toEqual([]);
  });
});

describe("AC4 X1, the rest adjusts", () => {
  it("bench x4 (main), back squat x3, straight-arm pulldown x2; 1545 s; Added by you; focus; status", async () => {
    await toPlan();
    await addBackSquat();
    const items = lastWorkout().plan.items;
    expect(items.map((i) => [i.exerciseId, i.sets, i.costS, i.isMain])).toEqual([
      ["bench-press", 4, 720, true],
      ["back-squat", 3, 555, false],
      ["straight-arm-pulldown", 2, 270, false],
    ]);
    expect(lastWorkout().itemsTotalS).toBe(1545);
    expect(lastWorkout().unusedS).toBe(75);
    expect(rowNames()).toEqual(["Bench press", "Back squat", "Straight arm pulldown"]);
    const rows = Array.from(document.querySelectorAll('[data-part="item-row"]'));
    expect(within(rows[1] as HTMLElement).getByText("Added by you")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).queryByText("Added by you")).toBeNull();
    expect(
      within(rows[1] as HTMLElement).getByRole("button", { name: /^How to do/ }),
    ).toHaveFocus();
    expect(pageStatus()).toHaveTextContent("Back squat added.");
    expect(document.querySelector('[data-part="budget-text"]')).toHaveTextContent(
      "About 29 of 30 min",
    );
    expect(rowDetails().length).toBe(3);
  });
});

describe("AC5 time refusal", () => {
  it("at 15 min a compound is refused with the Start-with copy; an isolation with Pick more time", async () => {
    await toPlan(15);
    expect(rowNames()).toEqual(["Bench press"]);
    openSheet();
    fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
      target: { value: "back squat" },
    });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add Back squat" }));
    expect(rowNames()).toEqual(["Bench press"]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sheetStatus()).toHaveTextContent(
      "Back squat doesn't fit in 15 min. Start with it instead, or pick more time.",
    );
    expect(lastWorkout().itemsTotalS).toBeLessThanOrEqual(15 * 60 - 180);
    fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
      target: { value: "leg ext" },
    });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add Leg extension" }));
    expect(sheetStatus()).toHaveTextContent("Leg extension doesn't fit in 15 min. Pick more time.");
    expect(sheetStatus().textContent).not.toMatch(/Start with it/);
    expect(rowNames()).toEqual(["Bench press"]);
    // addedIds stayed empty: the next call pins nothing of the refused adds.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toBeNull();
  });
});

describe("AC6 time chip and Shuffle keep adds", () => {
  it("20 drops it with the line, 30 brings it back; Shuffle keeps it pinned at position 2", async () => {
    await toPlan();
    await addBackSquat();
    spy.mockClear();
    fireEvent.click(button("20 minutes"));
    expect(lastInput().pinnedIds).toEqual(["back-squat"]);
    expect(lastWorkout().plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([
      ["bench-press", 4],
      ["straight-arm-pulldown", 2],
    ]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toHaveTextContent(
      "Doesn't fit in 20 min: Back squat.",
    );
    expect(pageStatus()).toHaveTextContent("Doesn't fit in 20 min: Back squat.");
    fireEvent.click(button("30 minutes"));
    expect(rowNames()).toEqual(["Bench press", "Back squat", "Straight arm pulldown"]);
    expect(document.querySelector('[data-part="doesnt-fit"]')).toBeNull();
    spy.mockClear();
    fireEvent.click(button("Shuffle"));
    expect(rowNames()[1]).toBe("Back squat");
    for (const call of spy.mock.calls) expect(call[4].pinnedIds).toEqual(["back-squat"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("AC7 all removed, then add", () => {
  it("empty query says Search to find; adding rebuilds a full plan around it", async () => {
    await toPlan();
    for (const n of ["Leg extension", "Inverted row", "Bench press"]) {
      fireEvent.click(button(`Remove ${n}`));
    }
    spy.mockClear();
    openSheet();
    expect(within(dialog()).getByText("Search to find an exercise.")).toBeInTheDocument();
    fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
      target: { value: "back squat" },
    });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Add Back squat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalledTimes(1);
    const w = lastWorkout();
    expect(w.plan.items.map((i) => i.exerciseId)).toContain("back-squat");
    expect(w.plan.mainLiftId).not.toBeNull();
    expect(w.itemsTotalS).toBeLessThanOrEqual(30 * 60 - 180);
  });
});

describe("AC8 offline", () => {
  it("search and Add make no request", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await toPlan();
      openSheet();
      fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
        target: { value: "back squat" },
      });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Add Back squat" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(rowNames()).toEqual(["Bench press", "Back squat", "Straight arm pulldown"]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AC9 per visit", () => {
  it("Back to UF-08.1 and Suggest again: R7-E4, no Added by you", async () => {
    await toPlan();
    await addBackSquat();
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await loaded();
    fireEvent.click(button("Suggest my workout"));
    expect(rowNames()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
    expect(screen.queryByText("Added by you")).toBeNull();
    expect(document.querySelector('[data-part="doesnt-fit"]')).toBeNull();
    spy.mockClear();
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual([]);
  });
});
