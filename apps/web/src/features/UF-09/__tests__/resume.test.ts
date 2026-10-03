// T-0395 `findResumable` (D-0139 §2): the newest unfinished, non-stale session of the signed-in
// user with a `wl-focus:<id>` value on this device. Rows are written with the REAL
// `upsertSession` over `fake-indexeddb`; the storage argument is a plain object stub so a test
// can make it throw without touching the real `localStorage`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { offlineDb as realOfflineDb } from "../../../lib/offline/db.js";
import { initialFocusState } from "../machine.js";
import { focusKey, type FocusStorage } from "../persist.js";
import { findResumable } from "../resume.js";
import { P1, USER_A, USER_B, planWith } from "./fixtures.js";
import { freshDb, seedSession, signIn, type SeedRow } from "./helpers.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);

const NOW = new Date("2026-10-02T10:00:00.000Z");
const NOW_MS = NOW.getTime();

/** A plain `localStorage`-shaped stub, so a test never touches the real one (AC5). */
function memoryStorage(initial: Record<string, string> = {}): FocusStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function focusValue(sessionId: string, loggedCount: number): string {
  const state = initialFocusState(sessionId, P1, NOW_MS);
  const loggedSets = Array.from({ length: loggedCount }, (_, i) => ({
    clientId: `c${i}`,
    itemIndex: 0,
    setIndex: i,
    exerciseId: "bench-press",
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
  }));
  return JSON.stringify({ ...state, loggedSets });
}

beforeEach(() => {
  vi.mocked(offline.offlineDb).mockImplementation(realOfflineDb);
  window.localStorage.clear();
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("T-0395 AC1 the card's data", () => {
  it("a seeded session s1 with 3 logged sets of P1 (12 sets) resolves done 3, total 12", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 3) });
    const result = await findResumable(NOW, storage);
    expect(result).toEqual({
      sessionId: "s1",
      startedAt: "2026-10-02T09:30:00.000Z",
      done: 3,
      total: 12,
    });
  });
});

describe("T-0395 AC2 when it shows", () => {
  async function seedWith(overrides: {
    endedAt?: string | null;
    startedAt?: string;
    userId?: string;
    noFocusKey?: boolean;
    plan?: Exclude<SeedRow["plan"], undefined>;
  }): Promise<void> {
    if (overrides.userId) signIn(overrides.userId);
    const row: SeedRow = {
      id: "s1",
      started_at: overrides.startedAt ?? "2026-10-02T09:30:00.000Z",
      ended_at: overrides.endedAt ?? null,
    };
    if ("plan" in overrides) row.plan = overrides.plan;
    await seedSession(row);
  }

  it("ended_at set: null", async () => {
    await seedWith({ endedAt: "2026-10-02T09:45:00.000Z" });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("started_at 12h + 1ms before now: null (stale)", async () => {
    await seedWith({ startedAt: new Date(NOW_MS - (12 * 60 * 60 * 1000 + 1)).toISOString() });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("started_at 10 days before now: null (stale)", async () => {
    await seedWith({ startedAt: new Date(NOW_MS - 10 * 86_400_000).toISOString() });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("userId u2 (another user signed in here): null", async () => {
    await seedWith({ userId: USER_B });
    signIn(USER_A); // The viewer, after u2's row is written.
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("no wl-focus:s1 key: null", async () => {
    await seedWith({});
    expect(await findResumable(NOW, memoryStorage())).toBeNull();
  });

  it("plan null: null", async () => {
    await seedWith({ plan: null });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("a plan that fails parseSessionPlan: null", async () => {
    await seedWith({ plan: { version: 1, items: "not-an-array" } as unknown as typeof P1 });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    expect(await findResumable(NOW, storage)).toBeNull();
  });

  it("started_at exactly 12h before now: it is s1 (inclusive)", async () => {
    await seedWith({ startedAt: new Date(NOW_MS - 12 * 60 * 60 * 1000).toISOString() });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    const result = await findResumable(NOW, storage);
    expect(result?.sessionId).toBe("s1");
  });
});

describe("T-0395 AC3 the newest wins", () => {
  it("s2 (09:30) is newer than s1 (09:00): links to s2", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:00:00.000Z" });
    await seedSession({ id: "s2", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({
      [focusKey("s1")]: focusValue("s1", 0),
      [focusKey("s2")]: focusValue("s2", 0),
    });
    const result = await findResumable(NOW, storage);
    expect(result?.sessionId).toBe("s2");
  });

  it("a tie at 09:30 goes to the smaller id, s1", async () => {
    await seedSession({ id: "s2", started_at: "2026-10-02T09:30:00.000Z" });
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({
      [focusKey("s1")]: focusValue("s1", 0),
      [focusKey("s2")]: focusValue("s2", 0),
    });
    const result = await findResumable(NOW, storage);
    expect(result?.sessionId).toBe("s1");
  });
});

describe("T-0395 AC4 the sets count", () => {
  it("a wl-focus:s1 value that is not JSON gives done 0 of 12", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({ [focusKey("s1")]: "{not json" });
    const result = await findResumable(NOW, storage);
    expect(result).toMatchObject({ done: 0, total: 12 });
  });

  it("a wl-focus:s1 value with no loggedSets array gives done 0 of 12", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({ [focusKey("s1")]: JSON.stringify({ phase: "set" }) });
    const result = await findResumable(NOW, storage);
    expect(result).toMatchObject({ done: 0, total: 12 });
  });

  it("a back-off on item 0 gives total 13", async () => {
    const backoff = { weightKg: 70, reps: 6 };
    const plan = planWith({ items: [{ ...P1.items[0]!, backoff }, ...P1.items.slice(1)] });
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z", plan });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 0) });
    const result = await findResumable(NOW, storage);
    expect(result?.total).toBe(13);
  });
});

describe("T-0395 AC5 offline and failure", () => {
  it("navigator.onLine false: the same result as AC1, and fetch is never called", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 3) });
    const result = await findResumable(NOW, storage);
    expect(result).toEqual({
      sessionId: "s1",
      startedAt: "2026-10-02T09:30:00.000Z",
      done: 3,
      total: 12,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offlineDb().sessions rejects: null, no unhandled rejection, no console.error", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    const db = offline.offlineDb();
    vi.spyOn(db.sessions, "where").mockImplementation(() => {
      throw new Error("DatabaseClosedError");
    });
    const storage = memoryStorage({ [focusKey("s1")]: focusValue("s1", 3) });
    const result = await findResumable(NOW, storage);
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", onUnhandled);
    expect(result).toBeNull();
    expect(unhandled).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("storage.getItem throws: null, no unhandled rejection, no console.error", async () => {
    await seedSession({ id: "s1", started_at: "2026-10-02T09:30:00.000Z" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    const storage: FocusStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const result = await findResumable(NOW, storage);
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", onUnhandled);
    expect(result).toBeNull();
    expect(unhandled).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
