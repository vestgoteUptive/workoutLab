// T-0538 (D-0199, UF-08.1 / UF-08.2): the stored exclusion list joins every `suggest` call, the
// Removed line (Never suggest / Undo), the neutral area notice, the empty state, offline/failure.
// The offline data layer is replaced by a tiny store so a write updates what the hooks return.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { fLibrary } from "./fixtures.js";
import {
  fCache,
  fitLine,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

const auth = vi.hoisted(() => ({ userId: "A" as string | null }));
const store = vi.hoisted(() => {
  let ids: string[] = [];
  const subs = new Set<() => void>();
  return {
    get: () => ids,
    set(next: string[]) {
      ids = [...next].sort();
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
});
const writes = vi.hoisted(() => ({
  exclude: vi.fn<(u: string, id: string) => Promise<void>>(),
  include: vi.fn<(u: string, id: string) => Promise<void>>(),
}));

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: auth.userId }),
}));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...actual, excludeExercise: writes.exclude, includeExercise: writes.include };
});
vi.mock("../../../lib/offline/excluded-hooks.js", async () => {
  const React = await import("react");
  return {
    useExcludedList: () => ({
      ids: React.useSyncExternalStore(store.subscribe, store.get),
      loaded: true,
    }),
    useOnline: () => {
      const [on, setOn] = React.useState(() => navigator.onLine !== false);
      React.useEffect(() => {
        const a = () => setOn(true);
        const b = () => setOn(false);
        window.addEventListener("online", a);
        window.addEventListener("offline", b);
        return () => {
          window.removeEventListener("online", a);
          window.removeEventListener("offline", b);
        };
      }, []);
      return on;
    },
  };
});
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
const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (n) => n.textContent,
  );
const NOTICE_QUADS = "Not suggested: Quads. Every exercise for it is excluded.";

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  auth.userId = "A";
  store.set([]);
  writes.exclude.mockReset();
  writes.include.mockReset();
  writes.exclude.mockImplementation(async (_u, id) => store.set([...store.get(), id]));
  writes.include.mockImplementation(async (_u, id) =>
    store.set(store.get().filter((x) => x !== id)),
  );
  setOnline(true);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

/** UF-08.1 → 30 min → Suggest. */
async function toSuggested(min = 30): Promise<void> {
  renderSetup();
  await loaded();
  fireEvent.click(button(`${min} minutes`));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

describe("AC1 Never suggest / Undo", () => {
  it("Remove shows the row; Never suggest stores it; Undo includes it; focus stays", async () => {
    await toSuggested();
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(button("Remove Leg extension"));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Leg extension · Never suggest");

    act(() => button("Never suggest Leg extension").focus());
    fireEvent.click(button("Never suggest Leg extension"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Leg extension won't be suggested · Undo",
      ),
    );
    expect(writes.exclude).toHaveBeenCalledTimes(1);
    expect(writes.exclude).toHaveBeenCalledWith("A", "leg-extension");
    expect(document.activeElement).toBe(
      within(screen.getByRole("status")).getByRole("button", {
        name: "Undo, Leg extension won't be suggested",
      }),
    );

    fireEvent.click(document.activeElement!);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Leg extension · Never suggest"),
    );
    expect(writes.include).toHaveBeenCalledWith("A", "leg-extension");
    expect(document.activeElement).toBe(button("Never suggest Leg extension"));
  });

  it("the status region is the same element before and after (present on mount)", async () => {
    await toSuggested();
    const before = screen.getByRole("status");
    fireEvent.click(button("Remove Leg extension"));
    expect(screen.getByRole("status")).toBe(before);
  });

  it("leave UF-08 and Start again with it still stored: not an item", async () => {
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("Never suggest Leg extension"));
    await waitFor(() => expect(store.get()).toEqual(["leg-extension"]));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await loaded();
    fireEvent.click(button("Suggest my workout"));
    expect(rowNames()).not.toContain("Leg extension");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("AC2/AC3 the union reaches suggest", () => {
  it("[bench-press] ∪ this visit's remove, sorted, on a time chip and on Shuffle", async () => {
    store.set(["bench-press"]);
    await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).toEqual(["bench-press", "inverted-row"]);
    const w = spy.mock.results.at(-1)!.value as Workout;
    const ids = w.plan.items.map((i) => i.exerciseId);
    expect(ids).not.toContain("bench-press");
    expect(ids).not.toContain("inverted-row");
    fireEvent.click(button("Shuffle"));
    expect(lastInput().excludeIds).toEqual(["bench-press", "inverted-row"]);
  });

  it("a stored id that is also removed this visit appears once", async () => {
    await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    fireEvent.click(button("Never suggest Inverted row"));
    await waitFor(() => expect(store.get()).toEqual(["inverted-row"]));
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).toEqual(["inverted-row"]);
  });

  it("AC3: after bench-press is included again, the next chip passes only the visit list", async () => {
    store.set(["bench-press"]);
    await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    act(() => store.set([]));
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).toEqual(["inverted-row"]);
  });
});

describe("AC4 the area notice", () => {
  it("shows for a stored list that empties quads, with no quads item", async () => {
    store.set(["back-squat", "leg-extension"]);
    await toSuggested();
    expect(screen.getByText(NOTICE_QUADS)).toBeInTheDocument();
    const w = spy.mock.results; // none: the plan came from UF-08.1
    expect(w.length).toBe(0);
    expect(rowNames()).not.toContain("Leg extension");
    expect(rowNames()).not.toContain("Back squat");
  });

  it("absent for an empty list", async () => {
    await toSuggested();
    expect(screen.queryByText(/Not suggested:/)).toBeNull();
  });

  it("absent when only this visit's Remove empties an area (leg-extension is the only quads exercise)", async () => {
    serveCache(() => fCache({ library: fLibrary().filter((e) => e.id !== "back-squat") }));
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    expect(screen.queryByText(/Not suggested:/)).toBeNull();
  });
});

describe("AC5 the UF-08.1 fit line", () => {
  it("passes the stored list; [] when empty", async () => {
    store.set(["bench-press"]);
    renderSetup();
    await loaded();
    expect(spy.mock.calls[0]![4].excludeIds).toEqual(["bench-press"]);
  });

  it("empty stored list: []", async () => {
    renderSetup();
    await loaded();
    expect(spy.mock.calls[0]![4].excludeIds).toEqual([]);
  });
});

describe("AC6 offline", () => {
  it("the cached list is honoured; Never suggest is aria-disabled with one description; enabled on `online`", async () => {
    store.set(["bench-press"]);
    setOnline(false);
    await toSuggested();
    expect(rowNames()).not.toContain("Bench press");
    fireEvent.click(button("Remove Leg extension"));
    const never = button("Never suggest Leg extension");
    expect(never).toHaveAttribute("aria-disabled", "true");
    const desc = screen.getAllByText("Connect to change excluded exercises");
    expect(desc).toHaveLength(1);
    expect(never.getAttribute("aria-describedby")).toBe(desc[0]!.id);
    fireEvent.click(never);
    expect(writes.exclude).not.toHaveBeenCalled();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(button("Never suggest Leg extension")).toHaveAttribute("aria-disabled", "false");
    expect(screen.queryByText("Connect to change excluded exercises")).toBeNull();
    fireEvent.click(button("Never suggest Leg extension"));
    expect(writes.exclude).toHaveBeenCalledTimes(1);
  });
});

describe("AC7 write failure", () => {
  it("shows the alert, keeps the row's state, control enabled", async () => {
    writes.exclude.mockRejectedValue(new Error("x"));
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("Never suggest Leg extension"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save. Try again.");
    const again = button("Never suggest Leg extension");
    expect(again).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Leg extension · Never suggest");
  });
});

describe("AC8 empty state", () => {
  it("every exercise excluded, no Remove: Nothing fits, with the notice above it", async () => {
    // Exclude every library exercise: the 45-min budget has nothing to fit.
    store.set(
      fLibrary()
        .filter((e) => e.kind === "exercise")
        .map((e) => e.id),
    );
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toBe("Nothing fits in 45 min"));
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    const nothing = document.querySelector('[data-part="nothing-fits"]')!;
    expect(nothing).toHaveTextContent("Nothing fits in 45 min");
    const notice = document.querySelector(".wl-excluded-notice")!;
    expect(notice).toBeInTheDocument();
    expect(notice.compareDocumentPosition(nothing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("review fixes", () => {
  it("a fast second tap sends one write: busy until the cache update reaches the screen", async () => {
    let finish!: () => void;
    writes.exclude.mockImplementation(
      (_u, id) =>
        new Promise<void>((resolve) => {
          finish = () => {
            store.set([...store.get(), id]);
            resolve();
          };
        }),
    );
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    const never = button("Never suggest Leg extension");
    fireEvent.click(never);
    expect(never).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(never);
    expect(writes.exclude).toHaveBeenCalledTimes(1);
    act(() => finish());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Undo"));
    fireEvent.click(document.querySelector('[data-part="undo"]')!);
    expect(writes.include).toHaveBeenCalledTimes(1);
  });

  it("the failure alert is a sibling of the status region, not inside it", async () => {
    writes.exclude.mockRejectedValue(new Error("x"));
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("Never suggest Leg extension"));
    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("status")).not.toContainElement(alert);
  });

  it("the notice sits under the budget bar, or under the Skipping line when shown", async () => {
    store.set(["back-squat", "leg-extension"]);
    await toSuggested();
    const notice = document.querySelector(".wl-excluded-notice")!;
    const bar = document.querySelector(".wl-uf08__budget")!;
    expect(bar.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Chest" }));
    fireEvent.click(button("Suggest my workout"));
    const skipping = document.querySelector('[data-part="skipping"]')!;
    const notice2 = document.querySelector(".wl-excluded-notice")!;
    const bar2 = document.querySelector(".wl-uf08__budget")!;
    expect(
      skipping.compareDocumentPosition(notice2) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(notice2.compareDocumentPosition(bar2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
