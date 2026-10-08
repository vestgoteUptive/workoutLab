// T-0539 UF-05.1 / UF-08.3 swap sheet and the excluded-exercises list (D-0199): AC1 ticked, AC2
// unticked, AC3 stored list filters, AC4 offline, AC5 empty states, AC6 write failure,
// AC6a running plan untouched, AC7 warm-up. Real engine, real cache; the write is a spy.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { fProfile, sessionOf, USER, w5 } from "./fixtures.js";
import {
  freezeClock,
  mountSheet,
  rowIds,
  rowRadio,
  seedCache,
  setOnline,
  settle,
  signOut,
} from "./harness.js";

const writes = vi.hoisted(() => ({ exclude: vi.fn() }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...actual, excludeExercise: writes.exclude };
});

const BOX = "Don't suggest Barbell row again";
const OFFLINE = "Connect to change excluded exercises";
let rankSpy: MockInstance<typeof engine.rankSwaps>;

async function store(...ids: string[]): Promise<void> {
  for (const exerciseId of ids) {
    await offlineDb().excludedCache.put({
      key: userScopedKey(USER, exerciseId),
      userId: USER,
      exerciseId,
      createdAt: "2026-10-01T00:00:00Z",
    });
  }
}

beforeEach(async () => {
  freezeClock();
  setOnline(true);
  writes.exclude.mockReset();
  writes.exclude.mockResolvedValue(undefined);
  rankSpy = vi.spyOn(engine, "rankSwaps");
  await seedCache();
});

afterEach(() => {
  signOut();
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const useButton = (name: string) => screen.getByRole("button", { name: `Use ${name}` });

describe("AC1 ticked", () => {
  it("excludes the current exercise once, then applies the swap", async () => {
    const { onApply } = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(screen.getByRole("checkbox", { name: BOX }));
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(writes.exclude).toHaveBeenCalledTimes(1);
    expect(writes.exclude).toHaveBeenCalledWith(USER, "barbell-row");
    const applied = onApply.mock.calls[0]![0];
    expect(applied.plan.items.map((i) => i.exerciseId)).toContain("lat-pulldown");
  });
});

describe("AC2 unticked (default)", () => {
  it("applies the swap and writes nothing", async () => {
    const { onApply } = mountSheet(w5(), 1);
    await rowIds();
    expect((screen.getByRole("checkbox", { name: BOX }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(writes.exclude).not.toHaveBeenCalled();
  });
});

describe("AC3 the stored list filters", () => {
  it("passes the stored ids as the 9th argument and drops them from the rows", async () => {
    await store("db-row");
    mountSheet(w5(), 1);
    const ids = await rowIds();
    expect(ids).not.toContain("db-row");
    expect(rankSpy.mock.calls.at(-1)![8]).toEqual(["db-row"]);
  });

  it("an empty list passes []", async () => {
    mountSheet(w5(), 1);
    const ids = await rowIds();
    expect(ids).toContain("db-row");
    expect(rankSpy.mock.calls.at(-1)![8]).toEqual([]);
  });
});

describe("AC4 offline", () => {
  it("honours the cache, disables the box with its description, still swaps, re-enables on online", async () => {
    await store("db-row");
    setOnline(false);
    const { onApply } = mountSheet(w5(), 1);
    expect(await rowIds()).not.toContain("db-row");
    const box = screen.getByRole("checkbox", { name: BOX }) as HTMLInputElement;
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe(screen.getByText(OFFLINE).id);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(writes.exclude).not.toHaveBeenCalled();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(box.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it("a box ticked before the connection dropped is cleared", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    const box = screen.getByRole("checkbox", { name: BOX }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(box.checked).toBe(false);
  });
});

describe("AC5 empty states", () => {
  it("every candidate excluded: the excluded message and no checkbox", async () => {
    const all = (await (async () => {
      const m = mountSheet(w5(), 1);
      const ids = await rowIds();
      m.unmount();
      return ids;
    })()) as string[];
    await store(...all);
    mountSheet(w5(), 1);
    expect(await screen.findByText("No alternatives left. The others are excluded.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("No alternatives fit your equipment")).toBeNull();
  });

  it("nothing fits even with an empty list: the equipment message and no checkbox", async () => {
    await seedCache({ profile: { ...fProfile(), equipment: [] } });
    mountSheet(w5(), 1);
    expect(await screen.findByText("No alternatives fit your equipment")).toBeTruthy();
    expect(screen.queryByText("No alternatives left. The others are excluded.")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("AC6 write failure (spec over AC6: the swap still applies)", () => {
  it("applies the swap, shows the alert, keeps the box ticked", async () => {
    writes.exclude.mockRejectedValue(new Error("server"));
    const { onApply } = mountSheet(w5(), 1);
    await rowIds();
    const box = screen.getByRole("checkbox", { name: BOX }) as HTMLInputElement;
    fireEvent.click(box);
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Couldn't save. Try again.");
    expect(writes.exclude).toHaveBeenCalledTimes(1);
    expect(box.checked).toBe(true);
    expect(box.getAttribute("aria-disabled")).toBeNull();
  });

  it("disables the box and the rows while the write is in flight", async () => {
    let resolveWrite!: () => void;
    writes.exclude.mockReturnValue(new Promise<void>((r) => (resolveWrite = r)));
    const { onApply } = mountSheet(w5(), 1);
    await rowIds();
    const box = screen.getByRole("checkbox", { name: BOX }) as HTMLInputElement;
    fireEvent.click(box);
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(box.getAttribute("aria-disabled")).toBe("true"));
    expect(rowRadio("lat-pulldown").disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => resolveWrite());
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });
});

describe("AC6a the running plan", () => {
  it("a ticked swap on item 2 leaves items 1 and 3 as they were", async () => {
    const before = w5();
    const snapshot = structuredClone(before.plan.items);
    const { onApply } = mountSheet(before, 1);
    await rowIds();
    fireEvent.click(screen.getByRole("checkbox", { name: BOX }));
    fireEvent.click(rowRadio("lat-pulldown"));
    fireEvent.click(useButton("Lat pulldown"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const items = onApply.mock.calls[0]![0].plan.items;
    expect(items[0]).toEqual(snapshot[0]);
    expect(items[2]).toEqual(snapshot[2]);
  });
});

describe("AC7 warm-up", () => {
  it("shows no checkbox for a warm-up item", async () => {
    const warm = sessionOf([["bench-press", 4, true]]);
    const id = warm.plan.warmup[0]!.exerciseId;
    const w = sessionOf([
      ["bench-press", 4, true],
      [id, 1],
    ]);
    rankSpy.mockReturnValue([
      {
        exerciseId: "lat-pulldown",
        muscleMatch: 1,
        bestMatch: true,
        fitsBudget: true,
        equipment: [],
        minutes: 5,
      } as never,
    ]);
    mountSheet(w, 1);
    await rowIds();
    await settle();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
