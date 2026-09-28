// AC-C14 (engine feed order), AC-C15 (through the real engine).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  balance,
  normalizeHistory,
  type LibraryExercise,
  type AreaTarget,
} from "@workoutlab/engine";
import { loadEngineHistory } from "../engine-feed.js";
import { offlineDb } from "../db.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

function makeTargets(): AreaTarget[] {
  return AREAS.map((area) => ({
    area,
    setsPer14d: 10,
    source: "default" as const,
    updatedAt: "2026-09-01T00:00:00.000Z",
  }));
}

const LIBRARY: LibraryExercise[] = [
  {
    id: "back-squat",
    name: "Back squat",
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas: { quads: 1 },
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
  },
];

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
});

afterEach(() => signOut());

describe("loadEngineHistory (AC-C14)", () => {
  it("returns server rows first (no pending key), then queued rows with pending: true", async () => {
    const db = offlineDb();
    await db.historyCache.bulkPut([
      {
        key: `${USER}:C1`,
        userId: USER,
        clientId: "C1",
        sessionId: "S1",
        exerciseId: "back-squat",
        isWarmup: false,
        completedAt: "2026-09-20T10:00:00.000Z",
        editedAt: "2026-09-20T10:00:00.000Z",
        deletedAt: null,
        reps: 8,
        weightKg: 60,
        durationS: null,
      },
      {
        key: `${USER}:C2`,
        userId: USER,
        clientId: "C2",
        sessionId: "S1",
        exerciseId: "back-squat",
        isWarmup: false,
        completedAt: "2026-09-21T10:00:00.000Z",
        editedAt: "2026-09-21T10:00:00.000Z",
        deletedAt: null,
        reps: 8,
        weightKg: 60,
        durationS: null,
      },
    ]);
    await db.sets.bulkPut([
      {
        key: `${USER}:C1`,
        userId: USER,
        clientId: "C1",
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 5,
        weightKg: 60,
        durationS: null,
        rir: null,
        isWarmup: false,
        backoff: false,
        completedAt: "2026-09-20T10:00:00.000Z",
        editedAt: "2026-09-20T10:05:00.000Z",
        deletedAt: null,
        status: "queued",
      },
      {
        key: `${USER}:C3`,
        userId: USER,
        clientId: "C3",
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 1,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        durationS: null,
        rir: null,
        isWarmup: false,
        backoff: false,
        completedAt: "2026-09-22T10:00:00.000Z",
        editedAt: "2026-09-22T10:05:00.000Z",
        deletedAt: "2026-09-22T10:05:00.000Z",
        status: "queued",
      },
    ]);

    const feed = await loadEngineHistory();
    expect(feed.map((s) => s.clientId)).toEqual(["C1", "C2", "C1", "C3"]);
    expect(feed[0]!.pending).toBeUndefined();
    expect(feed[1]!.pending).toBeUndefined();
    expect(feed[2]!.pending).toBe(true);
    expect(feed[3]!.pending).toBe(true);

    // Every element validates as a HistorySet the engine accepts (rule 0 tolerates duplicates).
    const normalized = normalizeHistory(feed);
    expect(normalized.length).toBeGreaterThan(0);
  });
});

describe("through the real engine (AC-C15)", () => {
  it("(a) a queued tombstone with a newer edited_at zeroes the load", async () => {
    const db = offlineDb();
    await db.historyCache.put({
      key: `${USER}:C1`,
      userId: USER,
      clientId: "C1",
      sessionId: "S1",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: "2026-09-20T10:00:00.000Z",
      editedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    });
    await db.sets.put({
      key: `${USER}:C1`,
      userId: USER,
      clientId: "C1",
      sessionId: "S1",
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 8,
      weightKg: 60,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: "2026-09-20T10:00:00.000Z",
      editedAt: "2026-09-20T10:05:00.000Z",
      deletedAt: "2026-09-20T10:05:00.000Z",
      status: "queued",
    });

    const feed = await loadEngineHistory();
    const result = balance(feed, makeTargets(), LIBRARY, "2026-09-28T00:00:00.000Z", "UTC");
    const quads = result.areas.find((a) => a.area === "quads")!;
    expect(quads.load).toBe(0);
  });

  it("(b) an equal edited_at tombstone loses to the server row: quads load 1", async () => {
    const db = offlineDb();
    await db.historyCache.put({
      key: `${USER}:C1`,
      userId: USER,
      clientId: "C1",
      sessionId: "S1",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: "2026-09-20T10:00:00.000Z",
      editedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    });
    await db.sets.put({
      key: `${USER}:C1`,
      userId: USER,
      clientId: "C1",
      sessionId: "S1",
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 8,
      weightKg: 60,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: "2026-09-20T10:00:00.000Z",
      editedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: "2026-09-20T10:00:00.000Z",
      status: "queued",
    });

    const feed = await loadEngineHistory();
    const result = balance(feed, makeTargets(), LIBRARY, "2026-09-28T00:00:00.000Z", "UTC");
    const quads = result.areas.find((a) => a.area === "quads")!;
    expect(quads.load).toBe(1);
  });

  it("(c) no server rows and an empty queue: the feed is [] and all 9 areas load 0", async () => {
    const feed = await loadEngineHistory();
    expect(feed).toEqual([]);
    const result = balance(feed, makeTargets(), LIBRARY, "2026-09-28T00:00:00.000Z", "UTC");
    expect(result.areas).toHaveLength(9);
    expect(result.areas.every((a) => a.load === 0)).toBe(true);
  });
});
