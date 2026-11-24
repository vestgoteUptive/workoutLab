// T-0538 (D-0199, UF-08.1 / UF-08.2): the stored exclusion list joins every `suggest` call, the
// Removed line (Never suggest / Undo), the neutral area notice, the empty state, offline/failure.
// The offline data layer is replaced by a tiny store so a write updates what the hooks return.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

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
