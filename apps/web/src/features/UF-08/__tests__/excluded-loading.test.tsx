// T-0538 review fix 1: the real hooks over fake-indexeddb with a DEFERRED cache read. Until the
// stored list answers, UF-08.1 keeps the fit line on "Checking what fits…" and Suggest disabled,
// so no `suggest` call can run without the stored ids.
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { offlineDb, resetOfflineDbForTest, userScopedKey } from "../../../lib/offline/db.js";
import { renderSetup, serveCache, setOnline, settle } from "./harness.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
let n = 0;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  n += 1;
  const db = resetOfflineDbForTest(`wl-offline-uf08-excl-${n}`);
  await db.excludedCache.put({
    key: userScopedKey("A", "bench-press"),
    userId: "A",
    exerciseId: "bench-press",
    createdAt: "2026-10-01T00:00:00Z",
  });
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the stored list is awaited", () => {
  it("fit line and Suggest wait for a deferred Dexie read; the first suggest has the stored id", async () => {
    const table = offlineDb().excludedCache;
    const realWhere = table.where.bind(table);
    let release!: () => void;
    const gate = new Dexie.Promise<void>((r) => (release = r));
    vi.spyOn(table, "where").mockImplementation(((...args: unknown[]) => {
      // Dexie's own object-form `where({..})` calls `where("key")` again: pass those through.
      if (typeof args[0] !== "object") return (realWhere as (...a: unknown[]) => unknown)(...args);
      const collection = (realWhere as (...a: unknown[]) => ReturnType<typeof realWhere>)(...args);
      return {
        toArray: () => gate.then(() => collection.toArray()),
      };
    }) as never);

    renderSetup();
    await settle(100);
    expect(screen.getByText("Checking what fits…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest my workout" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(spy).not.toHaveBeenCalled();

    await act(async () => release());
    await waitFor(() => expect(screen.getByText(/^Fits:/)).toBeInTheDocument());
    expect(spy.mock.calls[0]![4].excludeIds).toEqual(["bench-press"]);
    fireEvent.click(screen.getByRole("button", { name: "Suggest my workout" }));
    expect(screen.queryByText("Bench press")).toBeNull();
  });
});
