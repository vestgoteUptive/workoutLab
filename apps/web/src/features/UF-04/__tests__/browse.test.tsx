// T-0306a UF-04.1 Library browse: AC-1 … AC-6 and the wait-free half of AC-11.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { L1_PLUS_NAMES_SORTED, NOW, TZ, USER, exerciseRows, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({ refreshAll: vi.fn(), isEligible: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refreshAll: (...args: unknown[]) => hoisted.refreshAll(...args),
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workoutlab/engine")>();
  hoisted.isEligible.mockImplementation(real.isEligible);
  return {
    ...real,
    isEligible: (...args: Parameters<typeof real.isEligible>) => hoisted.isEligible(...args),
  };
});

const { refreshAll } = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
  "../../../lib/offline/history.js",
);
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { currentUrl, mountAt, rowNames, screenId, setOnline } = await import("./harness.js");

async function seed(options: Parameters<typeof seedSpy>[1] = {}): Promise<void> {
  spy.reset();
  seedSpy(spy, options);
  await refreshAll(NOW, TZ);
  spy.reset();
  hoisted.refreshAll.mockClear();
  hoisted.isEligible.mockClear();
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  hoisted.refreshAll.mockResolvedValue(undefined);
});
afterEach(() => signOut());

const chipLabels = () =>
  within(screen.getByRole("group"))
    .getAllByRole("button")
    .map((b) => b.textContent);
const chip = (name: string) => within(screen.getByRole("group")).getByRole("button", { name });
const ROW_LABEL_FIRST = ["Back squat", "Barbell row", "Bench press"];

describe("AC-1 order and warm-ups", () => {
  it("lists the 24 exercises sorted by name, with no warm-up row", async () => {
    await seed();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(rowNames().slice(0, 3)).toEqual(ROW_LABEL_FIRST);
    expect(rowNames().slice(-2)).toEqual(["Seated cable row", "Straight-arm pulldown"]);
    expect(rowNames()).toEqual(L1_PLUS_NAMES_SORTED);
    expect(document.querySelectorAll('a[href*="/library/wu-"]')).toHaveLength(0);
  });

  it("contrast: the seeded rows are in reverse id order, so the UI must sort", async () => {
    const ids = exerciseRows().map((r) => r.id as string);
    expect(ids).toEqual([...ids].sort((x, y) => y.localeCompare(x)));
    expect(ids.slice(-1)[0]).toBe("back-squat");
  });

  it("shows each row's areas, equipment and one link", async () => {
    await seed();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const link = screen.getByRole("link", { name: /^Back squat/ });
    expect(link).toHaveAttribute("href", "/library/back-squat");
    expect(link.querySelector('[data-field="primary"]')).toHaveTextContent("Glutes, Quads");
    expect(link.querySelector('[data-field="secondary"]')).toHaveTextContent("Core, Hamstrings");
    expect(link.querySelector('[data-field="equipment"]')).toHaveTextContent("Barbell, Rack");
    const push = screen.getByRole("link", { name: /^Push-up/ });
    expect(push.querySelector('[data-field="equipment"]')).toHaveTextContent("Bodyweight");
  });
});

describe("AC-2 search", () => {
  it("matches a trimmed, case-insensitive substring; zzz and clearing", async () => {
    await seed();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const field = screen.getByRole("searchbox");
    fireEvent.change(field, { target: { value: "  ROW " } });
    expect(rowNames().sort()).toEqual(
      ["Barbell row", "Dumbbell row", "Inverted row", "Seated cable row"].sort(),
    );
    expect(screen.queryByText("Straight-arm pulldown")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "BACK" } });
    expect(rowNames()).toEqual(["Back squat"]);
    fireEvent.change(field, { target: { value: "zzz" } });
    expect(rowNames()).toEqual([]);
    expect(screen.getByText('No exercises match "zzz"')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "" } });
    expect(rowNames()).toHaveLength(24);
  });
});

describe("AC-3 area chips", () => {
  it("Hamstrings shows weight-1 exercises only; chips are exact and aria-pressed", async () => {
    await seed();
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(chipLabels()).toEqual([
      "All",
      "Chest",
      "Back",
      "Shoulders",
      "Arms",
      "Core",
      "Glutes",
      "Quads",
      "Hamstrings",
      "Calves",
      "My equipment",
    ]);
    fireEvent.click(chip("Hamstrings"));
    expect(rowNames().sort()).toEqual(["Leg curl", "Romanian deadlift"]);
    expect(screen.queryByText("Back squat")).not.toBeInTheDocument();
    expect(screen.queryByText("Leg press")).not.toBeInTheDocument();
    expect(chip("Hamstrings")).toHaveAttribute("aria-pressed", "true");
    expect(chip("All")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Calves"));
    expect(chip("Hamstrings")).toHaveAttribute("aria-pressed", "false");
    expect(rowNames()).toEqual(["Calf raise"]);
  });
});

describe("AC-4 My equipment is the engine's isEligible", () => {
  it("dumbbell-only beginner sees exactly six, and the component calls isEligible", async () => {
    await seed({ profile: { level: "beginner", equipment: ["dumbbell"] } });
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    fireEvent.click(chip("My equipment"));
    const shown = rowNames().sort();
    expect(shown).toEqual(
      ["Biceps curl", "Dead bug", "Goblet squat", "Lateral raise", "Plank", "Push-up"].sort(),
    );
    expect(screen.queryByText("Dumbbell row")).not.toBeInTheDocument();
    expect(hoisted.isEligible).toHaveBeenCalled();
    const real = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
    const { loadLibrary } = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
      "../../../lib/offline/history.js",
    );
    const expected = (await loadLibrary())
      .filter((e) => real.isEligible(e, { level: "beginner", equipment: ["dumbbell"] }))
      .map((e) => e.name);
    expect(shown).toEqual(expected.sort());
  });

  it("Pull-up needs the intermediate level", async () => {
    await seed({ profile: { level: "beginner", equipment: ["pullup-bar"] } });
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    fireEvent.click(chip("My equipment"));
    expect(screen.queryByText("Pull-up")).not.toBeInTheDocument();
    expect(screen.getByText("Hanging knee raise")).toBeInTheDocument();
  });

  it("Pull-up shows for an intermediate profile with full equipment", async () => {
    await seed({ profile: { level: "intermediate", equipment: ["pullup-bar"] } });
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    fireEvent.click(chip("My equipment"));
    expect(rowNames()).toContain("Pull-up");
  });

  it("combines with Core: exactly Dead bug and Plank", async () => {
    await seed({ profile: { level: "beginner", equipment: ["dumbbell"] } });
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    fireEvent.click(chip("My equipment"));
    fireEvent.click(chip("Core"));
    expect(rowNames().sort()).toEqual(["Dead bug", "Plank"]);
    expect(chip("My equipment")).toHaveAttribute("aria-pressed", "true");
  });

  it("without a profile there is no My equipment chip and the other 10 still work", async () => {
    await seed({ profile: null });
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(chipLabels()).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "My equipment" })).not.toBeInTheDocument();
    fireEvent.click(chip("Hamstrings"));
    expect(rowNames()).toHaveLength(2);
  });
});

describe("AC-5 filters live in the URL", () => {
  const profile = { level: "beginner", equipment: ["dumbbell", "bench"] };

  it("reads q, area and mine on a cold render", async () => {
    await seed({ profile });
    await mountAt("/library?q=row&area=back&mine=1");
    await waitFor(() => expect(rowNames()).toEqual(["Dumbbell row"]));
    expect(chip("Back")).toHaveAttribute("aria-pressed", "true");
    expect(chip("My equipment")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("row");
  });

  it("q + area without mine shows the four rows; area=chest shows the empty state", async () => {
    await seed({ profile });
    const view = await mountAt("/library?q=row&area=back");
    await waitFor(() => expect(rowNames()).toHaveLength(4));
    view.unmount();
    await mountAt("/library?q=row&area=chest");
    await screen.findByText('No exercises match "row"');
    expect(rowNames()).toEqual([]);
  });

  it("typing updates ?area=back&q=pull without adding a history entry", async () => {
    await seed({ profile });
    await mountAt("/library?area=back");
    await waitFor(() => expect(rowNames().length).toBeGreaterThan(0));
    const before = window.history.length;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pull" } });
    await waitFor(() => expect(currentUrl()).toBe("/library?area=back&q=pull"));
    expect(window.history.length).toBe(before);
  });

  it("Back from a detail restores the search text and the area chip", async () => {
    await seed({ profile });
    await mountAt("/library?area=back");
    await waitFor(() => expect(rowNames().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pull" } });
    await waitFor(() => expect(currentUrl()).toBe("/library?area=back&q=pull"));
    fireEvent.click(screen.getByRole("link", { name: /^Lat pulldown/ }));
    await waitFor(() => expect(screenId()).toBe("UF-04.2"));
    act(() => window.history.back());
    await waitFor(() => expect(screenId()).toBe("UF-04.1"));
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveValue("pull"));
    expect(chip("Back")).toHaveAttribute("aria-pressed", "true");
  });

  it("an unknown area renders everything with All pressed", async () => {
    await seed({ profile });
    await mountAt("/library?area=neck");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(chip("All")).toHaveAttribute("aria-pressed", "true");
  });
});

const DOWNLOAD_COPY = "The exercise library downloads the first time you're online.";

describe("AC-6 never downloaded", () => {
  it("offline with an empty cache shows the download copy, no empty-match text, no chips", async () => {
    await mountAt("/library");
    await screen.findByText(DOWNLOAD_COPY);
    expect(screen.queryByText(/No exercises match/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  // The offline path above is the easy half. Online on a first-ever launch the cache is also
  // empty, but the download is in flight, so the download copy is the opposite of the truth.
  // The refresh must be genuinely deferred: an instantaneous one closes the window that has
  // the bug, and the assertion would pass vacuously.
  it("online with an empty cache never shows the download copy while the refresh is in flight", async () => {
    spy.reset();
    seedSpy(spy);
    setOnline(true);
    let fillCache = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      // Resolving runs the real refresh, so the cache is actually filled by this promise.
      fillCache = () => resolve(refreshAll(NOW, TZ).then(() => undefined));
    });
    hoisted.refreshAll.mockReturnValue(inFlight);

    await mountAt("/library");

    // The shell is held: no download copy, and no empty-match text standing in for it.
    expect(screenId()).toBe("UF-04.1");
    expect(rowNames()).toHaveLength(0);
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(/No exercises match/)).not.toBeInTheDocument();
    // The pre-refresh cache read resolves on a real macrotask (IndexedDB), not a microtask, so
    // the window with the bug only opens after a timer tick. Flushing microtasks alone lets this
    // assertion pass against the unfixed component, which is the trap this test exists to avoid.
    for (const ms of [0, 5, 50]) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
      // Still mid-download: the cache is empty, but claiming "never downloaded" would be a lie.
      expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
      expect(rowNames()).toHaveLength(0);
    }

    await act(async () => {
      fillCache();
      await inFlight;
    });

    // Once the download lands the real rows appear, and the copy was never shown.
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
  });
});

describe("AC-11 the first paint doesn't wait on the refresh", () => {
  it("renders the 24 rows while a refresh that never resolves is pending", async () => {
    await seed();
    setOnline(true);
    hoisted.refreshAll.mockReturnValue(new Promise(() => {}));
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
  });
});
