// T-0935 UF-08.2/UF-08.3/UF-08.5 (D-0235): a UF-08.3 swap survives Add, Shuffle, a time chip and
// "Start with this". AC1-AC9 (docs/tickets/T-0935). Loaders mocked; the real engine runs behind a
// spy and the real UF-05.1 sheet does the swap. The 30-min plan (F-web, R7-E4) is Bench press
// (main), Inverted row, Leg extension; the sheet offers Db row for Inverted row and Db bench press
// for Bench press.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { excludeExercise } from "../../../lib/offline/excluded.js";
import { resetOfflineDbForTest } from "../../../lib/offline/db.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({
  status: "signed-in" as const,
  userId: undefined as string | undefined,
}));
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const storeExclusion = vi.mocked(excludeExercise);

beforeEach(() => {
  auth.userId = undefined;
  spy.mockClear();
  storeExclusion.mockClear();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const rowIds = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const mainRows = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const reasonOf = (id: string) =>
  document.querySelector(`[data-part="item-row"][data-id="${id}"] [data-part="row-reason"]`)
    ?.textContent;
const removedLine = () => document.querySelector('[data-part="removed-line"]')!;

/** UF-08.1 → 30 minutes → Suggest my workout → UF-08.2. */
async function toPlan(): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
  spy.mockClear();
}

/** UF-08.3: swap `name`'s row for `toId` through the real sheet ("Don't suggest again" as given). */
async function swap(name: string, toId: string, dontSuggest = false): Promise<void> {
  fireEvent.click(button(`Swap ${name}`));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  const row = group.querySelector<HTMLElement>(`[data-id="${toId}"]`)!;
  fireEvent.click(within(row).getByRole("radio"));
  if (dontSuggest) {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox"));
  }
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
}

/** UF-08.5: search for and add `name`; resolves once the sheet has closed. */
async function add(name: string): Promise<void> {
  fireEvent.click(button("Add exercise"));
  const sheet = within(screen.getByRole("dialog"));
  fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(sheet.getByRole("button", { name: `Add ${name}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

describe("AC1 a non-main swap, then Add", () => {
  it("the plan holds Db row and Lateral raise, not Inverted row; pins [db-row, lateral-raise], A excluded", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    expect(rowIds()).toEqual(["bench-press", "db-row", "leg-extension"]);
    expect(spy).not.toHaveBeenCalled();
    await add("Lateral raise");
    expect(lastInput().pinnedIds).toEqual(["db-row", "lateral-raise"]);
    expect(lastInput().excludeIds).toContain("inverted-row");
    expect(rowIds()).toContain("db-row");
    expect(rowIds()).toContain("lateral-raise");
    expect(rowIds()).not.toContain("inverted-row");
    // A swap-in is a pin for the engine, but the user did not add it.
    expect(reasonOf("lateral-raise")).toBe("Added by you");
    expect(reasonOf("db-row")).not.toBe("Added by you");
  });

  it("a refused Add (no fit) keeps the swap and its pin", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button("Add exercise"));
    const sheet = within(screen.getByRole("dialog"));
    fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: "Back squat" } });
    fireEvent.click(sheet.getByRole("button", { name: "Add Back squat" }));
    expect(document.querySelector('[data-part="sheet-status"]')).toHaveTextContent(
      "Back squat doesn't fit in 30 min.",
    );
    expect(lastInput().pinnedIds).toEqual(["db-row", "back-squat"]);
    fireEvent.click(sheet.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowIds()).toEqual(["bench-press", "db-row", "leg-extension"]);
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["db-row"]);
  });

  it("the swapped-out exercise is not listed on the Removed line (it was not removed)", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    expect(removedLine()).not.toHaveTextContent("Inverted row");
    fireEvent.click(button("Remove Leg extension"));
    expect(removedLine()).toHaveTextContent("Leg extension");
    expect(removedLine()).not.toHaveTextContent("Inverted row");
  });
});

describe("AC2 Shuffle after a swap", () => {
  it("Db row stays and Inverted row stays out, over several shuffles", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    for (let n = 1; n <= 3; n++) {
      fireEvent.click(button("Shuffle"));
      expect(lastInput().shuffle).toBe(n);
      expect(lastInput().pinnedIds).toEqual(["db-row"]);
      expect(lastInput().excludeIds).toContain("inverted-row");
      expect(rowIds()).toContain("db-row");
      expect(rowIds()).not.toContain("inverted-row");
    }
  });
});

describe("AC3 a time chip after a swap", () => {
  it.each([45, 60])("%i minutes keeps Db row and leaves Inverted row out", async (m) => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button(`${m} minutes`));
    expect(lastInput().budgetMin).toBe(m);
    expect(lastInput().pinnedIds).toEqual(["db-row"]);
    expect(rowIds()).toContain("db-row");
    expect(rowIds()).not.toContain("inverted-row");
  });
});

describe("AC4 a main-lift swap, then Add", () => {
  it("Db bench press is the main lift (input and row); Bench press is gone; no pin for it", async () => {
    await toPlan();
    await swap("Bench press", "db-bench-press");
    expect(mainRows()).toEqual(["db-bench-press"]);
    await add("Lateral raise");
    expect(lastInput().mainLiftId).toBe("db-bench-press");
    expect(lastInput().pinnedIds).toEqual(["lateral-raise"]);
    expect(lastInput().excludeIds).toContain("bench-press");
    expect(mainRows()).toEqual(["db-bench-press"]);
    expect(rowIds()).toContain("lateral-raise");
    expect(rowIds()).not.toContain("bench-press");
  });

  it("Shuffle after a main-lift swap keeps Db bench press main and Bench press out", async () => {
    await toPlan();
    await swap("Bench press", "db-bench-press");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().mainLiftId).toBe("db-bench-press");
    expect(lastInput().excludeIds).toContain("bench-press");
    expect(mainRows()).toEqual(["db-bench-press"]);
    expect(rowIds()).not.toContain("bench-press");
  });
});

describe("AC5 a swap of an added (pinned) exercise", () => {
  it("the swap-in takes the added id's place in pinnedIds", async () => {
    await toPlan();
    await add("Back squat");
    await add("Lateral raise");
    expect(lastInput().pinnedIds).toEqual(["back-squat", "lateral-raise"]);
    await swap("Back squat", "hip-thrust");
    expect(rowIds()).not.toContain("back-squat");
    spy.mockClear();
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["hip-thrust", "lateral-raise"]);
    expect(lastInput().excludeIds).toContain("back-squat");
    expect(rowIds()).toContain("hip-thrust");
    expect(reasonOf("hip-thrust")).not.toBe("Added by you");
    expect(reasonOf("lateral-raise")).toBe("Added by you");
    expect(rowIds()).not.toContain("back-squat");
  });
});

describe("AC6 adding the swapped-out exercise back", () => {
  it("with time for it: Inverted row leaves the visit exclusions and is in the plan again", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).toContain("inverted-row");
    await add("Inverted row");
    expect(lastInput().excludeIds).not.toContain("inverted-row");
    expect(lastInput().pinnedIds).toEqual(["db-row", "inverted-row"]);
    expect(rowIds()).toContain("inverted-row");
    expect(rowIds()).toContain("db-row");
    // It stays in on the next re-suggest, and a later Remove lists it on the Removed line.
    fireEvent.click(button("Shuffle"));
    expect(lastInput().excludeIds).not.toContain("inverted-row");
    expect(rowIds()).toContain("inverted-row");
    fireEvent.click(button("Remove Inverted row"));
    expect(removedLine()).toHaveTextContent("Inverted row");
  });

  it("without time for it: the normal no-fit refusal shows and the swap stands", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button("Add exercise"));
    const sheet = within(screen.getByRole("dialog"));
    fireEvent.change(sheet.getByLabelText("Search exercises"), {
      target: { value: "Inverted row" },
    });
    fireEvent.click(sheet.getByRole("button", { name: "Add Inverted row" }));
    expect(lastInput().excludeIds).not.toContain("inverted-row");
    expect(document.querySelector('[data-part="sheet-status"]')).toHaveTextContent(
      "Inverted row doesn't fit in 30 min.",
    );
    expect(rowIds()).toEqual(["bench-press", "db-row", "leg-extension"]);
  });
});

describe("AC7 the stored excluded list", () => {
  async function signedInOnline(): Promise<void> {
    auth.userId = "u-t0935";
    resetOfflineDbForTest(`wl-offline-t0935-${Math.random()}`);
    setOnline(true);
    await toPlan();
  }

  it("unticked: no stored write, only the visit list changes", async () => {
    await signedInOnline();
    await swap("Inverted row", "db-row");
    expect(storeExclusion).not.toHaveBeenCalled();
    fireEvent.click(button("Shuffle"));
    expect(lastInput().excludeIds).toContain("inverted-row");
  });

  it("ticked: the stored write is made once for the swapped-out exercise, as before (D-0199)", async () => {
    await signedInOnline();
    await swap("Inverted row", "db-row", true);
    expect(storeExclusion).toHaveBeenCalledTimes(1);
    expect(storeExclusion).toHaveBeenCalledWith("u-t0935", "inverted-row");
    expect(rowIds()).toContain("db-row");
  });
});

describe("AC8 Back to UF-08.1 discards the swap", () => {
  it("the fresh plan has no pin and no visit exclusion from it", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    await settle();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    spy.mockClear();
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(lastInput().excludeIds).toEqual([]);
    expect(lastInput().mainLiftId).toBe("bench-press");
  });
});

describe("AC9 Reorder, then a swap and Add (D-0205 merge)", () => {
  it("Db row keeps Inverted row's place; Lateral raise is appended", async () => {
    await toPlan();
    fireEvent.click(button("Reorder"));
    fireEvent.click(button("Move Inverted row up"));
    fireEvent.click(button("Done"));
    expect(rowIds()).toEqual(["inverted-row", "bench-press", "leg-extension"]);
    await swap("Inverted row", "db-row");
    expect(rowIds()).toEqual(["db-row", "bench-press", "leg-extension"]);
    await add("Lateral raise");
    const ids = rowIds();
    expect(ids.slice(0, 2)).toEqual(["db-row", "bench-press"]);
    expect(ids.at(-1)).toBe("lateral-raise");
    expect(ids).not.toContain("inverted-row");
    expect(mainRows()).toEqual(["bench-press"]);
  });
});

// ---- Code review (T-0935 round 2) ----

describe("the swap-in leaves the visit exclusions", () => {
  it("swap back: Inverted row → Db row → Inverted row; Shuffle keeps Inverted row, Db row out", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    await swap("Db row", "inverted-row");
    expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["inverted-row"]);
    expect(lastInput().excludeIds).not.toContain("inverted-row");
    expect(lastInput().excludeIds).toContain("db-row");
    expect(rowIds()).toContain("inverted-row");
    expect(rowIds()).not.toContain("db-row");
    expect(removedLine()).not.toHaveTextContent("Inverted row");
    expect(removedLine()).not.toHaveTextContent("Db row");
  });

  it("a swap to an exercise removed earlier takes it off the Removed line and the exclusions", async () => {
    await toPlan();
    fireEvent.click(button("Remove Inverted row"));
    expect(removedLine()).toHaveTextContent("Inverted row");
    await add("Db row");
    await swap("Db row", "inverted-row");
    expect(rowIds()).toContain("inverted-row");
    expect(removedLine()).not.toHaveTextContent("Inverted row");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["inverted-row"]);
    expect(lastInput().excludeIds).not.toContain("inverted-row");
    expect(lastInput().excludeIds).toContain("db-row");
    expect(rowIds()).toContain("inverted-row");
  });
});

describe("swap chains, Remove and Start with this after a swap", () => {
  it("A → B → C: pins [C]; A and B are both excluded for the visit", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    await swap("Db row", "lat-pulldown");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["lat-pulldown"]);
    expect(lastInput().excludeIds).toEqual(expect.arrayContaining(["inverted-row", "db-row"]));
    expect(rowIds()).toContain("lat-pulldown");
    expect(rowIds()).not.toContain("inverted-row");
    expect(rowIds()).not.toContain("db-row");
  });

  it("Remove of a swap-in unpins it and lists it on the Removed line (not the swapped-out one)", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button("Remove Db row"));
    expect(rowIds()).not.toContain("db-row");
    expect(removedLine()).toHaveTextContent("Db row");
    expect(removedLine()).not.toHaveTextContent("Inverted row");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(lastInput().excludeIds).toEqual(expect.arrayContaining(["inverted-row", "db-row"]));
    expect(rowIds()).not.toContain("db-row");
    expect(rowIds()).not.toContain("inverted-row");
  });

  it("Start with this on a swap-in makes it the main lift; the swap stands on the next Shuffle", async () => {
    await toPlan();
    await swap("Inverted row", "db-row");
    fireEvent.click(button("Start with Db row"));
    expect(lastInput().mainLiftId).toBe("db-row");
    expect(mainRows()).toEqual(["db-row"]);
    // The engine's main lift (Bench press) returns to the pool (D-0205 §5): not demoted.
    expect(lastInput().pinnedIds).toEqual(["db-row"]);
    fireEvent.click(button("Shuffle"));
    expect(lastInput().mainLiftId).toBe("db-row");
    expect(lastInput().excludeIds).toContain("inverted-row");
    expect(mainRows()).toEqual(["db-row"]);
    expect(rowIds()).not.toContain("inverted-row");
  });
});

describe("Start with this demotes a main lift the user chose (D-0239 §2, QA finding)", () => {
  it("main swap Bench press → Db bench press, then Start with Inverted row: Db bench press is the first pin", async () => {
    await toPlan();
    await swap("Bench press", "db-bench-press");
    fireEvent.click(button("Start with Inverted row"));
    expect(lastInput().mainLiftId).toBe("inverted-row");
    expect(lastInput().pinnedIds).toEqual(["db-bench-press"]);
    expect(mainRows()).toEqual(["inverted-row"]);
    expect(rowIds()).toContain("db-bench-press");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().pinnedIds).toEqual(["db-bench-press"]);
    expect(lastInput().excludeIds).toContain("bench-press");
    expect(rowIds()).toContain("db-bench-press");
    expect(rowIds()).not.toContain("bench-press");
    expect(mainRows()).toEqual(["inverted-row"]);
    // A demoted swap-in is still not "Added by you" (D-0240 §2).
    expect(reasonOf("db-bench-press")).not.toBe("Added by you");
  });

  it("a main lift set by an earlier Start with this is demoted to the front of the pins", async () => {
    await toPlan();
    fireEvent.click(button("45 minutes"));
    fireEvent.click(button("Start with Inverted row"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(mainRows()).toEqual(["inverted-row"]);
    fireEvent.click(button("Add exercise"));
    const sheet = within(screen.getByRole("dialog"));
    fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: "Back squat" } });
    fireEvent.click(sheet.getByRole("button", { name: "Start with Back squat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lastInput().mainLiftId).toBe("back-squat");
    // Back squat is pinned only if it was not already in the plan (Q9); the demoted lift is first.
    expect(lastInput().pinnedIds[0]).toBe("inverted-row");
    expect(mainRows()).toEqual(["back-squat"]);
    expect(rowIds()).toContain("inverted-row");
    expect(reasonOf("inverted-row")).not.toBe("Added by you");
    fireEvent.click(button("Shuffle"));
    expect(rowIds()).toContain("inverted-row");
  });
});
