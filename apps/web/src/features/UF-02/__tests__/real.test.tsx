// T-0302a AC-3: the real `@workoutlab/engine` over the real `lib/offline` cache (fake-indexeddb),
// cached server rows plus sets queued through `recordSet` (principle 3, NFR-OFF-3, R11-E4).
// `balance` and `loadEngineHistory` are spies that call the real functions, to count them.
// T-0302c AC-1: `suggest` is one too, so the card's preview is pinned to the device as well.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { recordSet } from "../../../lib/offline/queue.js";
import { F_TZ, L1, PROFILE, RDL, history, targets } from "./fixtures.js";
import { freshDb, macrotask, renderToday, seedCache, signIn, signOut, tile } from "./helpers.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, balance: vi.fn(actual.balance), suggest: vi.fn(actual.suggest) };
});
vi.mock("../../../lib/offline/engine-feed.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/engine-feed.js")>();
  return { ...actual, loadEngineHistory: vi.fn(actual.loadEngineHistory) };
});

const { balance, suggest } = await import("@workoutlab/engine");
const { loadEngineHistory } = await import("../../../lib/offline/engine-feed.js");

let online = false;

beforeEach(async () => {
  online = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  vi.mocked(balance).mockClear();
  vi.mocked(suggest).mockClear();
  vi.mocked(loadEngineHistory).mockClear();
  const db = freshDb();
  signIn();
  await seedCache(db, {
    history: history(RDL, "2026-09-20T18:00:00+02:00", 4),
    library: L1,
    targets: targets(),
    profile: PROFILE,
  });
});

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

async function queueThree(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await recordSet(
      {
        sessionId: "S2",
        exerciseId: RDL,
        setIndex: i,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-26T18:00:00+02:00") },
    );
  }
}

const urlOf = (input: unknown): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

describe("AC-3 real balance with queued sets", () => {
  it("4 cached + 3 queued RDL sets: hamstrings 7 / 16, glutes 3.5 / 20; one balance per cache read", async () => {
    await queueThree();
    renderToday(F_TZ);
    await waitFor(() => expect(tile("hamstrings")).toBe("7 / 16"));
    expect(tile("glutes")).toBe("3.5 / 20");
    await macrotask();
    expect(loadEngineHistory).toHaveBeenCalledTimes(1);
    expect(balance).toHaveBeenCalledTimes(1);
  });

  it("CONTRAST: the same seed without the queued sets reads 4 / 16 and 2 / 20", async () => {
    renderToday(F_TZ);
    await waitFor(() => expect(tile("hamstrings")).toBe("4 / 16"));
    expect(tile("glutes")).toBe("2 / 20");
  });

  it("online: fetch goes only to PostgREST, never to /functions/v1/ (no GET /balance, no suggest)", async () => {
    online = true;
    await queueThree();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => {}));
    renderToday(F_TZ);
    await waitFor(() => expect(tile("hamstrings")).toBe("7 / 16"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await macrotask();
    const urls = fetchSpy.mock.calls.map(([input]) => urlOf(input));
    expect(urls.filter((u) => u.includes("/functions/v1/"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/balance"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/workouts/suggest"))).toEqual([]);
    expect(urls.some((u) => u.includes("/rest/v1/"))).toBe(true);
    // One cache read so far (the refresh is still hanging, inside its 3 s cap): one balance.
    expect(loadEngineHistory).toHaveBeenCalledTimes(1);
    expect(balance).toHaveBeenCalledTimes(1);
  });

  it("T-0302c AC-1: the card's suggest runs on the device; fetch never reaches /functions/v1/", async () => {
    online = true;
    await queueThree();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>(() => {}));
    renderToday(F_TZ);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="card-row"]').length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await macrotask();
    expect(suggest).toHaveBeenCalledTimes(1);
    // The queued sets reach suggest too: 4 cached + 3 queued RDL sets.
    expect(vi.mocked(suggest).mock.calls[0]![0]).toHaveLength(7);
    const urls = fetchSpy.mock.calls.map(([input]) => urlOf(input));
    expect(urls.filter((u) => u.includes("/functions/v1/"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/workouts/suggest"))).toEqual([]);
  });
});
