// T-0953 (D-0259 §14): logged RIR reaches the engine feed and the next pre-fill, offline (AC4)
// and from the refreshed cache (AC5); queued mapping (AC2); no RIR gives today's result (AC6).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prefill, type LibraryExercise } from "@workoutlab/engine";
import { loadEngineHistory } from "../engine-feed.js";
import { offlineDb } from "../db.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TZ = "Europe/Stockholm";
const NOW = "2026-09-27T12:00:00+02:00";

const BENCH: LibraryExercise = {
  id: "bench-press",
  name: "Bench press",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { chest: 1 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 2.5,
  externalLoad: true,
};

const RIRS = [null, null, 0] as const;

const queuedSets = (rirs: readonly (number | null)[]) =>
  rirs.map((rir, i) => ({
    key: `${USER}:q${i}`,
    userId: USER,
    clientId: `q${i}`,
    sessionId: "S1",
    exerciseId: "bench-press",
    setIndex: i,
    kind: "reps" as const,
    reps: 8,
    weightKg: 80,
    durationS: null,
    rir,
    isWarmup: false,
    backoff: false,
    completedAt: `2026-09-25T10:0${i}:00.000Z`,
    editedAt: `2026-09-25T10:0${i}:00.000Z`,
    deletedAt: null,
    status: "queued" as const,
  }));

const cachedSets = (rirs: readonly (number | null | undefined)[]) =>
  rirs.map((rir, i) => ({
    key: `${USER}:c${i}`,
    userId: USER,
    clientId: `c${i}`,
    sessionId: "S1",
    exerciseId: "bench-press",
    isWarmup: false,
    completedAt: `2026-09-25T10:0${i}:00.000Z`,
    editedAt: `2026-09-25T10:0${i}:00.000Z`,
    deletedAt: null,
    reps: 8,
    weightKg: 80,
    durationS: null,
    ...(rir === undefined ? {} : { rir }),
  }));

const next = async () =>
  prefill(BENCH, { repsMin: 6, repsMax: 8 }, await loadEngineHistory(), [BENCH], NOW, TZ, null);

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
});
afterEach(() => signOut());

describe("T-0953 queued sets carry rir (AC2)", () => {
  it("maps queued.rir 0 to 0 and null to null, pending", async () => {
    await offlineDb().sets.bulkPut(queuedSets([0, null]));
    const history = await loadEngineHistory();
    const by = (id: string) => history.find((s) => s.clientId === id)!;
    expect(by("q0")).toMatchObject({ rir: 0, pending: true });
    expect(by("q1")).toMatchObject({ rir: null, pending: true });
  });
});

describe("T-0953 RIR reaches the next pre-fill", () => {
  it("AC4 offline: 80 x 8, 8, 8 with RIR 0 on the last queued set holds 80 x 8 (hold_effort)", async () => {
    await offlineDb().sets.bulkPut(queuedSets(RIRS)); // no network is touched
    expect(await next()).toMatchObject({ weightKg: 80, reps: 8, kind: "hold_effort" });
  });

  it("AC5 online: the same set synced (server row in the cache) gives the same hold_effort", async () => {
    await offlineDb().historyCache.bulkPut(cachedSets(RIRS));
    expect(await next()).toMatchObject({ weightKg: 80, reps: 8, kind: "hold_effort" });
  });

  it("AC6: rir null on every set gives 82.5 x 6 increase, queued and cached alike", async () => {
    await offlineDb().sets.bulkPut(queuedSets([null, null, null]));
    expect(await next()).toMatchObject({ weightKg: 82.5, reps: 6, kind: "increase" });
    await offlineDb().sets.clear();
    await offlineDb().historyCache.bulkPut(cachedSets([null, null, null]));
    expect(await next()).toMatchObject({ weightKg: 82.5, reps: 6, kind: "increase" });
  });

  it("a cached row from before v6 (no rir field) still gives increase", async () => {
    await offlineDb().historyCache.bulkPut(cachedSets([undefined, undefined, undefined]));
    expect(await next()).toMatchObject({ weightKg: 82.5, kind: "increase" });
  });
});
