// Shared UF-06 test fixtures (T-0307b): the L1 subset the ACs use, targets, history H and a
// seeding helper. Test-only; production code never imports this file.
import type { AreaTarget, HistorySet, LibraryExercise } from "@workoutlab/engine";
import { offlineDb, setKey } from "../../../lib/offline/db.js";

export const TZ = "Europe/Stockholm";
export const LOCALE = "en-GB";
export const NOW = new Date("2026-09-27T12:00:00+02:00");
export const USER = "aaaaaaaa-1111-4111-8111-111111111111";

function exercise(
  id: string,
  areas: LibraryExercise["areas"],
  opts: { bodyweight?: boolean; timedS?: number; kind?: "exercise" | "warmup" } = {},
): LibraryExercise {
  const spaced = id.replace(/-/g, " ");
  return {
    id,
    name: id === "push-up" ? "Push-up" : spaced.charAt(0).toUpperCase() + spaced.slice(1),
    kind: opts.kind ?? "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas,
    timed: opts.timedS !== undefined,
    defaultDurationS: opts.timedS ?? null,
    incrementKg: opts.bodyweight || opts.timedS !== undefined ? null : 2.5,
    externalLoad: !(opts.bodyweight || opts.timedS !== undefined),
  };
}

export const LIBRARY: LibraryExercise[] = [
  exercise("back-squat", { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 }),
  exercise("romanian-deadlift", { hamstrings: 1, glutes: 0.5 }),
  exercise("leg-curl", { hamstrings: 1 }),
  exercise("push-up", { chest: 1, arms: 0.5, core: 0.5 }, { bodyweight: true }),
  exercise("plank", { core: 1 }, { timedS: 45 }),
  exercise("wu-cat-cow", { core: 1, back: 0.5 }, { kind: "warmup", timedS: 40 }),
];

const TARGET_VALUES = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
} as const;

export const TARGETS: AreaTarget[] = (
  Object.keys(TARGET_VALUES) as Array<keyof typeof TARGET_VALUES>
).map((area) => ({
  area,
  setsPer14d: TARGET_VALUES[area],
  source: "default" as const,
  updatedAt: "2026-08-02T10:00:00.000Z",
}));

let counter = 0;

/** A set at a Stockholm-local wall time (CEST, +02:00, all fixture dates are in summer time). */
export function set(
  sessionId: string,
  exerciseId: string,
  local: string,
  fields: Partial<HistorySet> & { w?: number; r?: number; d?: number } = {},
): HistorySet {
  counter += 1;
  const at = new Date(`${local.replace(" ", "T")}:00+02:00`).toISOString();
  const { w, r, d, ...rest } = fields;
  return {
    clientId: `c${counter}`,
    sessionId,
    exerciseId,
    isWarmup: false,
    completedAt: at,
    editedAt: at,
    deletedAt: null,
    reps: r ?? null,
    weightKg: w ?? null,
    durationS: d ?? null,
    ...rest,
  };
}

/** History H of the ticket. */
export function historyH(): HistorySet[] {
  return [
    set("A", "back-squat", "2026-09-20 10:00", { w: 100, r: 8 }),
    set("A", "back-squat", "2026-09-20 10:05", { w: 100, r: 6 }),
    set("B", "back-squat", "2026-09-25 10:00", { w: 102.5, r: 5 }),
    set("B", "back-squat", "2026-09-25 10:05", { w: 100, r: 8 }),
    set("C", "romanian-deadlift", "2026-09-22 10:00", { w: 80, r: 10 }),
    set("D", "push-up", "2026-09-24 18:00", { w: 0, r: 15 }),
    set("D", "push-up", "2026-09-24 18:05", { w: 0, r: 12 }),
    set("D", "plank", "2026-09-24 18:10", { d: 40 }),
    set("D", "plank", "2026-09-24 18:15", { d: 45 }),
    set("E", "romanian-deadlift", "2026-09-26 10:00", { w: 60, r: 10, isWarmup: true }),
    set("F", "back-squat", "2026-09-26 10:00", {
      w: 200,
      r: 1,
      deletedAt: "2026-09-26T09:00:00.000Z",
      editedAt: "2026-09-26T09:00:00.000Z",
    }),
  ];
}

export interface SessionSeed {
  id: string;
  startedAt: string;
  endedAt?: string | null;
}

export interface Seed {
  library?: LibraryExercise[];
  targets?: AreaTarget[];
  history?: HistorySet[];
  sessions?: SessionSeed[];
  lastSyncedAt?: string;
}

/** Writes the caches directly, the way a refresh would have left them. */
export async function seed(seedData: Seed): Promise<void> {
  const db = offlineDb();
  await db.libraryCache.bulkPut(
    (seedData.library ?? LIBRARY).map((exercise) => ({
      key: `${USER}:${exercise.id}`,
      userId: USER,
      exercise,
    })),
  );
  await db.targetCache.bulkPut(
    (seedData.targets ?? TARGETS).map((target) => ({
      key: `${USER}:${target.area}`,
      userId: USER,
      target,
    })),
  );
  await db.historyCache.bulkPut(
    (seedData.history ?? []).map((s) => ({
      key: setKey(USER, s.clientId),
      userId: USER,
      clientId: s.clientId,
      sessionId: s.sessionId,
      exerciseId: s.exerciseId,
      isWarmup: s.isWarmup,
      completedAt: s.completedAt,
      editedAt: s.editedAt,
      deletedAt: s.deletedAt,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: s.durationS,
    })),
  );
  await db.sessionCache.bulkPut(
    (seedData.sessions ?? []).map((s) => ({
      key: `${USER}:${s.id}`,
      userId: USER,
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt === undefined ? null : s.endedAt,
      timeBudgetMin: 45,
      effortRating: null,
      energy: "normal",
    })),
  );
  if (seedData.lastSyncedAt !== undefined) {
    await db.syncMeta.put({
      userId: USER,
      lastSyncedAt: seedData.lastSyncedAt,
      persistRequested: false,
    });
  }
}
