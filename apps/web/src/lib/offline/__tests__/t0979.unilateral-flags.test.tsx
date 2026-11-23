// T-0979 AC1-AC3, AC7, AC8 (lib half) and the cold hook (AC6): the in-memory one-side flag store
// (D-0260, D-0263 §1) that lets UF-09, UF-03 and UF-06 paint "per arm" on the first frame.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../auth/auth-context.js", () => ({ useAuth: () => ({ status: "signed-in" }) }));
vi.mock("../sync.js", () => ({
  startSync: () => ({ flushNow: () => Promise.resolve(), stop: () => undefined }),
}));

const { offlineDb, userScopedKey } = await import("../db.js");
const flags = await import("../unilateral-flags.js");
const { invalidateCacheWrites } = await import("../cache-generation.js");
const { refreshLibrary } = await import("../history.js");
const { AutoSync } = await import("../AutoSync.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "aaaaaaaa-1111-4111-8111-111111111111";
const OTHER = "bbbbbbbb-2222-4222-8222-222222222222";

/** Dexie's `where({ userId })` calls `where("userId")` inside; count only the outer call. */
function reads(spyFn: { mock: { calls: unknown[][] } }): number {
  return spyFn.mock.calls.filter((c) => typeof c[0] === "object").length;
}

function detail(id: string, unilateral?: unknown) {
  return {
    id,
    instructions: [],
    mistakes: [],
    cue: null,
    source: "t",
    license: "CC0",
    attribution: null,
    sourceUrl: null,
    variants: [],
    ...(unilateral === undefined ? {} : { unilateral }),
  };
}

async function seed(rows: Array<[string, unknown]>, userId = USER) {
  await offlineDb().exerciseDetails.bulkPut(
    rows.map(([id, u]) => ({
      key: userScopedKey(userId, id),
      userId,
      detail: detail(id, u) as never,
    })),
  );
}

const ROWS: Array<[string, unknown]> = [
  ["dumbbell-row", "arm"],
  ["side-plank", "side"],
  ["back-squat", null],
  ["both-row", "both"],
  ["empty-row", ""],
];

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  invalidateCacheWrites(); // empties the store left by an earlier test
  spy.reset();
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0979 AC1 store semantics", () => {
  it("T-0979 AC1 cold is undefined; warm reads the word, null for unflagged and 'both'/'' ; no row stays undefined", async () => {
    await seed(ROWS);
    expect(flags.peekUnilateral("dumbbell-row")).toBeUndefined();
    await flags.warmUnilateralFlags();
    expect(flags.peekUnilateral("dumbbell-row")).toBe("arm");
    expect(flags.peekUnilateral("side-plank")).toBe("side");
    expect(flags.peekUnilateral("back-squat")).toBeNull();
    expect(flags.peekUnilateral("both-row")).toBeNull();
    expect(flags.peekUnilateral("empty-row")).toBeNull();
    expect(flags.peekUnilateral("no-such-row")).toBeUndefined();
  });

  it("T-0979 AC1 signed out: no read, still cold, no throw", async () => {
    signOut();
    const where = vi.spyOn(offlineDb().exerciseDetails, "where");
    await expect(flags.warmUnilateralFlags()).resolves.toBeUndefined();
    expect(where).not.toHaveBeenCalled();
  });
});

describe("T-0979 AC2 sign-out and user switch", () => {
  it("T-0979 AC2 invalidateCacheWrites empties a warm store", async () => {
    await seed(ROWS);
    await flags.warmUnilateralFlags();
    expect(flags.peekUnilateral("dumbbell-row")).toBe("arm");
    invalidateCacheWrites();
    expect(flags.peekUnilateral("dumbbell-row")).toBeUndefined();
    expect(flags.peekUnilateral("back-squat")).toBeUndefined();
  });

  it("T-0979 AC2 a read still in flight when the cache is invalidated is dropped", async () => {
    await seed(ROWS);
    const pending = flags.warmUnilateralFlags();
    invalidateCacheWrites();
    await pending;
    expect(flags.peekUnilateral("dumbbell-row")).toBeUndefined();
  });

  it("T-0979 AC2 a different current user reads cold", async () => {
    await seed(ROWS);
    await flags.warmUnilateralFlags();
    signOut();
    signIn(OTHER);
    expect(flags.peekUnilateral("dumbbell-row")).toBeUndefined();
  });
});

describe("T-0979 AC3 refreshLibrary keeps the store current", () => {
  const base = {
    name: "x",
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    source: "workoutlab",
    license: "LicenseRef-workoutLab",
    attribution: null,
    source_url: null,
    kind: "exercise",
    timed: false,
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
  function serve(rows: Array<[string, string | null]>) {
    spy.setRows(
      "exercises",
      rows.map(([id, unilateral]) => ({ ...base, id, unilateral })),
    );
    spy.setRows("exercise_areas", []);
    spy.setRows("exercise_variants", []);
  }

  it("T-0979 AC3 a later refresh flips the flags with no reload", async () => {
    serve([
      ["dumbbell-row", "arm"],
      ["back-squat", null],
    ]);
    await refreshLibrary();
    expect(flags.peekUnilateral("dumbbell-row")).toBe("arm");
    expect(flags.peekUnilateral("back-squat")).toBeNull();
    serve([
      ["dumbbell-row", null],
      ["back-squat", "leg"],
    ]);
    await refreshLibrary();
    expect(flags.peekUnilateral("dumbbell-row")).toBeNull();
    expect(flags.peekUnilateral("back-squat")).toBe("leg");
  });

  it("T-0979 AC3 a rejected refresh leaves the store unchanged", async () => {
    serve([["dumbbell-row", "arm"]]);
    await refreshLibrary();
    spy.fail("exercises", { code: "PGRST301", message: "offline" });
    await expect(refreshLibrary()).rejects.toMatchObject({ code: "PGRST301" });
    expect(flags.peekUnilateral("dumbbell-row")).toBe("arm");
  });
});

describe("T-0979 AC7 the import-time warm", () => {
  it("T-0979 AC7 a signed-in import starts exactly one exerciseDetails read; signed out starts none", async () => {
    await seed(ROWS);
    vi.resetModules();
    const db = await import("../db.js");
    const where = vi.spyOn(db.offlineDb().exerciseDetails, "where");
    await import("../unilateral-flags.js");
    expect(reads(where)).toBe(1);

    signOut();
    vi.resetModules();
    const db2 = await import("../db.js");
    const where2 = vi.spyOn(db2.offlineDb().exerciseDetails, "where");
    await import("../unilateral-flags.js");
    expect(reads(where2)).toBe(0);
  });
});

describe("T-0979 AC8 offline start", () => {
  it("T-0979 AC8 AutoSync warms the store from the cache with navigator.onLine false, no refreshAll", async () => {
    await seed(ROWS);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(flags.peekUnilateral("dumbbell-row")).toBeUndefined();
    render(<AutoSync />);
    await act(async () => {
      await vi.waitFor(() => expect(flags.peekUnilateral("dumbbell-row")).toBe("arm"));
    });
    expect(spy.from).not.toHaveBeenCalled();
  });
});

describe("T-0979 AC6 cold path (hook)", () => {
  it("T-0979 AC6 a cold hook is null first, reads once, then labels; a second mount is warm on its first return", async () => {
    const { renderHook } = await import("@testing-library/react");
    await seed([["dumbbell-row", "arm"]]);
    const read = vi.spyOn(offlineDb().exerciseDetails, "get");
    const first = renderHook(() => flags.useUnilateral("dumbbell-row"));
    expect(first.result.current).toBeNull();
    await vi.waitFor(() => expect(first.result.current).toBe("arm"));
    expect(read).toHaveBeenCalledTimes(1);
    const second = renderHook(() => flags.useUnilateral("dumbbell-row"));
    expect(second.result.current).toBe("arm");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
