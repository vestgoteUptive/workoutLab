// T-0575 UF-08.5/UF-08.2 "Start with this" (D-0205 §5), AC1-AC6. Loaders mocked; the real engine
// runs behind a spy. Only AC4 stubs `suggest`, and only for the refusal: see the chip-sweep test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const dialog = () => screen.getByRole("dialog");
const sheetStatus = () => document.querySelector('[data-part="sheet-status"]')!;
const pageStatus = () => document.querySelector('[data-part="status"]')!;
const mainRows = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-part="item-row"][data-id="${id}"]`)!;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

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

const openSheet = () => fireEvent.click(button("Add exercise"));
function search(q: string): void {
  fireEvent.change(within(dialog()).getByLabelText("Search exercises"), { target: { value: q } });
}
const sheetBtn = (name: string) => within(dialog()).queryByRole("button", { name });

describe("AC1 actions offered", () => {
  it("UF-08.2: none on bench (main) or leg extension (isolation), one on inverted row", async () => {
    await toPlan();
    expect(row("bench-press").querySelector('[data-part="start-with"]')).toBeNull();
    expect(row("leg-extension").querySelector('[data-part="start-with"]')).toBeNull();
    expect(button("Start with Inverted row")).toHaveTextContent("Start with this");
    expect(document.querySelectorAll('[data-part="start-with"]').length).toBe(1);
  });

  it("UF-08.5: Back squat has Start with, Leg extension (in plan, isolation) none, an isolation result has Add only", async () => {
    await toPlan();
    openSheet();
    expect(sheetBtn("Start with Back squat")).not.toBeNull();
    expect(sheetBtn("Start with Leg extension")).toBeNull();
    expect(sheetBtn("Start with Bench press")).toBeNull();
    expect(sheetBtn("Start with Inverted row")).not.toBeNull();
    search("calf");
    expect(sheetBtn("Add Calf raise")).not.toBeNull();
    expect(sheetBtn("Start with Calf raise")).toBeNull();
  });
});

describe("AC2 X2 from the sheet", () => {
  it.each([false, true])(
    "offline=%s: one call, back squat x4 first and main, no request",
    async (offline) => {
      setOnline(!offline);
      const fetchSpy = vi.fn(async () => new Response("{}"));
      vi.stubGlobal("fetch", fetchSpy);
      await toPlan();
      fetchSpy.mockClear();
      openSheet();
      search("back squat");
      fireEvent.click(sheetBtn("Start with Back squat")!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(lastInput().mainLiftId).toBe("back-squat");
      expect(lastInput().pinnedIds).toEqual(["back-squat"]);
      const w = lastWorkout();
      expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.costS, i.isMain])).toEqual([
        ["back-squat", 4, 720, true],
        ["bench-press", 3, 555, false],
        ["straight-arm-pulldown", 2, 270, false],
      ]);
      expect(w.itemsTotalS).toBe(1545);
      expect(rowNames()).toEqual(["Back squat", "Bench press", "Straight arm pulldown"]);
      expect(mainRows()).toEqual(["back-squat"]);
      expect(within(row("back-squat")).getByText("Main lift")).toBeInTheDocument();
      expect(pageStatus()).toHaveTextContent("Back squat is the main lift now.");
      expect(within(row("back-squat")).getByRole("button", { name: /^How to do/ })).toHaveFocus();
      if (!offline) expect(fetchSpy).not.toHaveBeenCalled();
      else expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("AC3 X3 at 15 min", () => {
  it("Add is refused, then Start with gives back squat x4 (main) only", async () => {
    await toPlan(15);
    openSheet();
    search("back squat");
    fireEvent.click(sheetBtn("Add Back squat")!);
    expect(sheetStatus()).toHaveTextContent("Start with it instead");
    fireEvent.click(sheetBtn("Start with Back squat")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lastWorkout().plan.items.map((i) => [i.exerciseId, i.sets, i.isMain])).toEqual([
      ["back-squat", 4, true],
    ]);
    expect(rowNames()).toEqual(["Back squat"]);
  });

  it("no chip budget naturally refuses Start with Back squat (so AC4 needs the stub)", async () => {
    for (const minutes of [15, 20, 30, 45, 60, 90]) {
      cleanup();
      spy.mockClear();
      await toPlan(minutes === 15 ? 15 : 30);
      if (minutes !== 15 && minutes !== 30) fireEvent.click(button(`${minutes} minutes`));
      openSheet();
      search("back squat");
      fireEvent.click(sheetBtn("Start with Back squat")!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(lastWorkout().plan.mainLiftId, `${minutes} min`).toBe("back-squat");
    }
  });
});

describe("AC4 refusal (engine stub)", () => {
  it("plan unchanged, sheet stays open with the copy, addedIds unchanged", async () => {
    await toPlan(15);
    const before = rowNames();
    const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
    spy.mockImplementation((h, t, p, l, input, now, tz) =>
      actual.suggest(h, t, p, l, { ...input, mainLiftId: "bench-press", pinnedIds: [] }, now, tz),
    );
    openSheet();
    search("back squat");
    fireEvent.click(sheetBtn("Start with Back squat")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sheetStatus()).toHaveTextContent("Back squat doesn't fit in 15 min. Pick more time.");
    expect(sheetStatus().textContent).not.toMatch(/Start with it/);
    expect(rowNames()).toEqual(before);
    expect(before).toEqual(["Bench press"]);
    expect(mainRows()).toEqual(["bench-press"]);
    // addedIds unchanged: the next call pins nothing.
    spy.mockClear();
    spy.mockImplementation(actual.suggest);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(lastInput().mainLiftId).toBe("bench-press");
  });
});

describe("AC5 from a UF-08.2 row", () => {
  it("inverted row first and main, pinnedIds [], status, focus", async () => {
    await toPlan();
    fireEvent.click(button("Start with Inverted row"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastInput().mainLiftId).toBe("inverted-row");
    expect(lastInput().pinnedIds).toEqual([]);
    const w = lastWorkout();
    expect(w.plan.mainLiftId).toBe("inverted-row");
    expect(w.plan.items[0]!.exerciseId).toBe("inverted-row");
    expect(rowNames()[0]).toBe("Inverted row");
    expect(mainRows()).toEqual(["inverted-row"]);
    expect(pageStatus()).toHaveTextContent("Inverted row is the main lift now.");
    expect(within(row("inverted-row")).getByRole("button", { name: /^How to do/ })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Start with Inverted row" })).toBeNull();
  });
});

describe("AC6 kept by re-suggests", () => {
  it("45 then Shuffle keep back squat first and main", async () => {
    await toPlan();
    openSheet();
    fireEvent.click(sheetBtn("Start with Back squat")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("45 minutes"));
    expect(lastInput().mainLiftId).toBe("back-squat");
    expect(lastInput().pinnedIds).toEqual(["back-squat"]);
    expect(lastWorkout().plan.items[0]!.exerciseId).toBe("back-squat");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().mainLiftId).toBe("back-squat");
    expect(lastWorkout().plan.items[0]!.exerciseId).toBe("back-squat");
    expect(rowNames()[0]).toBe("Back squat");
    expect(mainRows()).toEqual(["back-squat"]);
  });
});
