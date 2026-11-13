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
