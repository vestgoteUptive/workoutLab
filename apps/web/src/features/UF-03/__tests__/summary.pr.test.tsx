// T-0674 UF-03.3: the PR band from the engine's `records()` (D-0219). `sessionPr` picks this
// session's record with the biggest % improvement over its `previous` (tie → later completedAt);
// the view shows the actual set, never an e1RM. Offline: the sets are queued (pending) rows.
import { screen } from "@testing-library/react";
import type { HistorySet, LibraryExercise } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionPr } from "../summary-data.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import { L1, NOW, S0, S1, type SetSpec } from "./fixtures.js";
import {
  freshDb,
  renderSummary,
  seedCached,
  seedLibraryAndTargets,
  seedQueued,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

const lib = (over: Partial<LibraryExercise> & { id: string }): LibraryExercise => ({
  ...L1[0]!,
  ...over,
  name: over.name ?? over.id,
});
const set = (over: Partial<HistorySet> & { sessionId: string; at: string }): HistorySet => ({
  clientId: `${over.sessionId}-${over.exerciseId}-${over.at}`,
  exerciseId: "back-squat",
  isWarmup: false,
  completedAt: over.at,
  editedAt: over.at,
  deletedAt: null,
  reps: 5,
  weightKg: 100,
  durationS: null,
  ...over,
});

describe("sessionPr (pure)", () => {
  const library = [
    lib({ id: "a", name: "Alpha" }),
    lib({ id: "b", name: "Beta" }),
    lib({ id: "plank", name: "Plank", timed: true, defaultDurationS: 30 }),
    lib({ id: "pu", name: "Push-up", externalLoad: false, incrementKg: 0 }),
  ];
  const old = "2026-09-17T10:00:00Z";

  it("two records: the larger % improvement wins, even when the other is a bigger absolute jump", () => {
    const h = [
      set({ sessionId: S0, exerciseId: "a", weightKg: 200, reps: 5, at: old }),
      set({ sessionId: S0, exerciseId: "b", weightKg: 20, reps: 5, at: old }),
      // a: +5 kg on 200 (2.5 %); b: +5 kg on 20 (25 %)
      set({ sessionId: S1, exerciseId: "a", weightKg: 205, reps: 5, at: "2026-09-27T09:00:00Z" }),
      set({ sessionId: S1, exerciseId: "b", weightKg: 25, reps: 5, at: "2026-09-27T09:10:00Z" }),
    ];
    expect(sessionPr(h, library, S1)).toMatchObject({ name: "Beta", weightKg: 25, reps: 5 });
  });

  it("a tie goes to the later completedAt", () => {
    const h = [
      set({ sessionId: S0, exerciseId: "a", weightKg: 100, at: old }),
      set({ sessionId: S0, exerciseId: "b", weightKg: 100, at: old }),
      set({ sessionId: S1, exerciseId: "b", weightKg: 110, at: "2026-09-27T09:10:00Z" }),
      set({ sessionId: S1, exerciseId: "a", weightKg: 110, at: "2026-09-27T09:00:00Z" }),
    ];
    expect(sessionPr(h, library, S1)?.name).toBe("Beta");
    const swapped = h.map((s) =>
      s.sessionId === S1
        ? {
            ...s,
            completedAt: s.exerciseId === "a" ? "2026-09-27T09:20:00Z" : "2026-09-27T09:10:00Z",
          }
        : s,
    );
    expect(sessionPr(swapped, library, S1)?.name).toBe("Alpha");
  });

  it("none: no improvement, or a first-ever session, gives null", () => {
    const worse = [
      set({ sessionId: S0, exerciseId: "a", weightKg: 100, at: old }),
      set({ sessionId: S1, exerciseId: "a", weightKg: 90, at: "2026-09-27T09:00:00Z" }),
    ];
    expect(sessionPr(worse, library, S1)).toBeNull();
    const first = [set({ sessionId: S1, exerciseId: "a", at: "2026-09-27T09:00:00Z" })];
    expect(sessionPr(first, library, S1)).toBeNull();
  });

  it("only this session's records count: an earlier session's record is not shown", () => {
    const h = [
      set({ sessionId: S0, exerciseId: "a", weightKg: 100, at: old }),
      set({ sessionId: "S2", exerciseId: "a", weightKg: 120, at: "2026-09-20T09:00:00Z" }),
      set({ sessionId: S1, exerciseId: "b", weightKg: 50, at: "2026-09-27T09:00:00Z" }),
    ];
    expect(sessionPr(h, library, S1)).toBeNull();
  });

  it("timed and bodyweight records carry their own fields", () => {
    const timed = [
      set({
        sessionId: S0,
        exerciseId: "plank",
        weightKg: null,
        reps: null,
        durationS: 60,
        at: old,
      }),
      set({
        sessionId: S1,
        exerciseId: "plank",
        weightKg: null,
        reps: null,
        durationS: 90,
        at: "2026-09-27T09:00:00Z",
      }),
    ];
    expect(sessionPr(timed, library, S1)).toEqual({
      name: "Plank",
      weightKg: null,
      reps: null,
      durationS: 90,
      timed: true,
    });
    const bw = [
      set({ sessionId: S0, exerciseId: "pu", weightKg: 0, reps: 20, at: old }),
      set({ sessionId: S1, exerciseId: "pu", weightKg: 0, reps: 25, at: "2026-09-27T09:00:00Z" }),
    ];
    expect(sessionPr(bw, library, S1)).toMatchObject({ name: "Push-up", weightKg: 0, reps: 25 });
  });
});

describe("the band in the view (queued sets, no network)", () => {
  let db: OfflineDb;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
    db = freshDb();
    signIn();
  });
  afterEach(async () => {
    await waitReal(50);
    vi.useRealTimers();
    signOut();
  });

  const spec = (
    sessionId: string,
    exerciseId: string,
    weightKg: number,
    reps: number,
    completedAt: string,
  ): SetSpec => ({
    clientId: `${sessionId}-${exerciseId}`,
    sessionId,
    exerciseId,
    setIndex: 0,
    reps,
    weightKg,
    completedAt,
  });

  async function open(cached: SetSpec[], queued: SetSpec[]) {
    await seedSession(db);
    await seedQueued(db, queued);
    await seedCached(db, cached);
    await seedLibraryAndTargets(db);
    renderSummary();
    await screen.findByRole("radiogroup", { name: en.uf03.effortName });
  }
  const band = () => document.querySelector<HTMLElement>('[data-part="pr-band"]');

  it("a session with two records shows the larger-improvement one as the actual set", async () => {
    await open(
      [
        spec(S0, "back-squat", 100, 5, "2026-09-17T09:00:00.000Z"),
        spec(S0, "bench-press", 60, 5, "2026-09-17T09:10:00.000Z"),
      ],
      [
        spec(S1, "back-squat", 102.5, 5, "2026-09-27T09:00:00.000Z"),
        spec(S1, "bench-press", 70, 6, "2026-09-27T09:10:00.000Z"),
      ],
    );
    expect(band()!.textContent).toBe("Bench press 70 kg × 6");
    expect(band()!.textContent).not.toMatch(/1RM|e1/i);
  });

  it("a first-ever session shows no band", async () => {
    await open([], [spec(S1, "back-squat", 100, 5, "2026-09-27T09:00:00.000Z")]);
    expect(band()).toBeNull();
  });

  it("a session that beats nothing shows no band", async () => {
    await open(
      [spec(S0, "back-squat", 100, 8, "2026-09-17T09:00:00.000Z")],
      [spec(S1, "back-squat", 100, 5, "2026-09-27T09:00:00.000Z")],
    );
    expect(band()).toBeNull();
  });
});
