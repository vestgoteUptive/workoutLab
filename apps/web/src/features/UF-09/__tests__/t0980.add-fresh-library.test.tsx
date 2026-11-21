// T-0980 (UF-09.9, D-0246, D-0247): an add reads the library at call time. A session that loaded
// before the library cache filled has `ctx.library = []`; the add must still work. The real host
// and UF-09.10 sheet over fake-indexeddb; the engine runs for real.
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { session } from "./probe.js";
import { renderSession } from "./session-helpers.js";
import { LIB, addNamed, openSheet, prepare, seed, settle } from "./t0949-setup.js";
import { PAUSED_REST } from "./t0947-fixtures.js";

type Lib = typeof LIB;
/** What `loadLibrary()` gives the session: call 1 is the session load, later calls are the add. */
const lib = vi.hoisted(() => ({
  calls: 0,
  load: [] as unknown[],
  add: (): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: [], loaded: true }),
  useOnline: () => true,
}));
vi.mock("../../../lib/offline/favorites-hooks.js", () => ({
  useFavoriteList: () => ({ ids: [], loaded: true }),
}));
// The sheet lists the full library (its own read, history.js), as it does in the field.
vi.mock("../../../lib/offline/history.js", async (orig) => {
  const actual = await orig<typeof import("../../../lib/offline/history.js")>();
  return { ...actual, loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB) };
});
vi.mock("../../../lib/offline/index.js", async (orig) => {
  const { offlineSpies } = await import("./offline-spies.js");
  const m = await offlineSpies(orig);
  return {
    ...m,
    loadLibrary: vi.fn(async () => {
      lib.calls += 1;
      return lib.calls === 1 ? lib.load : lib.add();
    }),
  };
});

vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const upsertSpy = vi.mocked(offline.upsertSession);
const statusLine = () => document.querySelector('[data-field="added-line"]') as HTMLElement;

beforeEach(async () => {
  lib.calls = 0;
  lib.load = [];
  upsertSpy.mockClear();
  await prepare();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Seeds a paused rest and opens the sheet; the session load was the first library read. */
async function openPaused(): Promise<void> {
  await seed(PAUSED_REST);
  await renderSession();
  expect(lib.calls).toBe(1); // the load read an empty cache
  await openSheet();
}

describe("T-0980 AC1 an empty session snapshot, a filled cache", () => {
  it("inserts the item and announces it, no alert", async () => {
    lib.add = async () => LIB as Lib;
    await openPaused();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(statusLine().textContent).toBe("Lateral raise added after Bench press.");
    expect(session().plan.items.map((i) => i.exerciseId)).toContain("lateral-raise");
    expect(upsertSpy).toHaveBeenCalled();
  });
});

describe("T-0980 AC2 the cache read rejects", () => {
  it("falls back to the session snapshot and the add succeeds", async () => {
    lib.load = LIB as unknown[];
    lib.add = () => Promise.reject(new Error("idb"));
    await seed(PAUSED_REST);
    await renderSession();
    expect(lib.calls).toBe(1);
    await openSheet();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(statusLine().textContent).toBe("Lateral raise added after Bench press.");
    expect(session().plan.items.map((i) => i.exerciseId)).toContain("lateral-raise");
  });
});

describe("T-0980 AC3 both empty", () => {
  it("shows Couldn't add and writes nothing", async () => {
    lib.add = async () => [];
    await openPaused();
    await addNamed("lateral", "Lateral raise");
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("Couldn't add Lateral raise. Try again.");
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(session().plan.items).toHaveLength(3);
  });
});
