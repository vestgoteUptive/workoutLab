// T-0530 (D-0195): a cache refresh in flight when sign-out starts must not write after the clear.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClient } from "../deps.js";
import { U } from "./fixtures.js";

const h = vi.hoisted(() => ({
  gate: Promise.resolve() as Promise<void>,
  open: () => undefined as void,
  tables: new Map<string, unknown[]>(),
}));

// Every select waits on one gate, so the test decides when the fetch resolves.
function query(table: string) {
  const result = async () => {
    await h.gate;
    return { data: h.tables.get(table) ?? [], error: null };
  };
  return {
    gte: () => result(),
    maybeSingle: async () => {
      await h.gate;
      return { data: (h.tables.get(table) ?? [])[0] ?? null, error: null };
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej),
  };
}
vi.mock("../../auth/client.js", () => ({
  supabase: { from: (table: string) => ({ select: () => query(table) }) },
}));

const history = await import("../../offline/history.js");
const excluded = await import("../../offline/excluded.js");
const { freshOfflineDb, signIn, signOut } = await import("../../offline/__tests__/test-helpers.js");
const { signOutAndClearDevice } = await import("../index.js");

const NOW = new Date("2026-10-26T08:00:00Z");
const TZ = "Europe/Stockholm";

const CASES: Array<{
  name: string;
  run: () => Promise<void>;
  cache: string;
  rows: Record<string, unknown[]>;
}> = [
  {
    name: "refreshHistory",
    run: () => history.refreshHistory(NOW, TZ),
    cache: "historyCache",
    rows: {
      session_sets_live: [
        {
          client_id: "c-1",
          session_id: "S1",
          exercise_id: "back-squat",
          is_warmup: false,
          completed_at: "2026-10-20T10:00:00.000Z",
          edited_at: "2026-10-20T10:00:00.000Z",
          deleted_at: null,
          reps: 8,
          weight_kg: 60,
          duration_s: null,
        },
      ],
    },
  },
  {
    name: "refreshLibrary",
    run: () => history.refreshLibrary(),
    cache: "libraryCache",
    rows: {
      exercises: [
        {
          id: "back-squat",
          name: "Back squat",
          type: "compound",
          level: "beginner",
          equipment: [],
          kind: "exercise",
          timed: false,
          increment_kg: 2.5,
          default_duration_s: null,
          external_load: true,
        },
      ],
      exercise_areas: [{ exercise_id: "back-squat", area_id: "quads", weight: 1 }],
    },
  },
  {
    name: "refreshSessions",
    run: () => history.refreshSessions(NOW, TZ),
    cache: "sessionCache",
    rows: {
      sessions: [
        {
          id: "S1",
          started_at: "2026-10-17T09:00:00.000Z",
          ended_at: null,
          time_budget_min: 45,
          effort_rating: null,
          energy: "normal",
        },
      ],
    },
  },
  {
    name: "refreshCheckins",
    run: () => history.refreshCheckins(),
    cache: "checkinCache",
    rows: {
      plan_checkins: [
        {
          id: "ck-1",
          user_id: U,
          period_index: 1,
          completed_prev: 3,
          completed_last: 5,
          rhythm_min_before: 3,
          rhythm_max_before: 4,
          proposed_min: 4,
          proposed_max: 5,
          proposed_at: "2026-09-26T09:00:00.000Z",
          answer: null,
          answered_at: null,
        },
      ],
    },
  },
  {
    name: "refreshRoutines",
    run: () => history.refreshRoutines(),
    cache: "routineCache",
    rows: {
      routines: [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" }],
      routine_items: [{ routine_id: "R", position: 0, exercise_id: "back-squat" }],
    },
  },
  {
    name: "refreshExcluded",
    run: () => excluded.refreshExcluded(),
    cache: "excludedCache",
    rows: {
      excluded_exercises: [{ exercise_id: "bench-press", created_at: "2026-10-01T10:00:00.000Z" }],
    },
  },
  {
    name: "refreshTargets",
    run: () => history.refreshTargets(),
    cache: "targetCache",
    rows: {
      area_targets: [
        {
          area_id: "quads",
          sets_per_14d: 10,
          source: "default",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
  },
  {
    name: "refreshProfile",
    run: () => history.refreshProfile(),
    cache: "profileCache",
    rows: {
      profiles: [
        {
          goal: "build_muscle",
          level: "beginner",
          equipment: [],
          rhythm_min: 3,
          rhythm_max: 4,
          priority_areas: [],
          onboarded_at: "2026-09-01T00:00:00.000Z",
          plan_changed_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
  },
];

const okClient = {
  auth: { signOut: vi.fn(async () => ({ error: null })) },
} as unknown as AccountClient;
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

function closeGate(): void {
  h.gate = new Promise<void>((resolve) => {
    h.open = resolve;
  });
}

async function countOf(db: ReturnType<typeof freshOfflineDb>, cache: string): Promise<number> {
  const table = (
    db as unknown as Record<
      string,
      { where(k: string): { equals(v: string): { count(): Promise<number> } } }
    >
  )[cache]!;
  return table.where("userId").equals(U).count();
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  h.tables.clear();
  closeGate();
  signIn(U);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  signOut();
});

describe.each(CASES)("T-0530 $name vs sign-out", (c) => {
  function seed(): ReturnType<typeof freshOfflineDb> {
    const db = freshOfflineDb();
    for (const [t, rows] of Object.entries(c.rows)) h.tables.set(t, rows);
    return db;
  }

  it("control: without a sign-out the refresh does write its cache", async () => {
    const db = seed();
    const refresh = c.run();
    h.open();
    await refresh;
    expect(await countOf(db, c.cache)).toBeGreaterThan(0);
  });

  it("T-0530 AC-1 AC-2 a fetch that resolves after the clear writes nothing and does not reject", async () => {
    const db = seed();
    const refresh = c.run();
    const result = await signOutAndClearDevice({ userId: U }, { supabase: okClient, db });
    expect(result).toEqual({ cleared: true });

    h.open();
    await expect(refresh).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(await countOf(db, c.cache)).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("T-0530 a refresh started while auth.signOut is awaited (user still A) writes nothing", async () => {
    const db = seed();
    let refresh: Promise<void> = Promise.resolve();
    const client = {
      auth: {
        signOut: vi.fn(async () => {
          refresh = c.run(); // an `online` / onSynced refetch: currentUserId() is still U here
          return { error: null };
        }),
      },
    } as unknown as AccountClient;
    await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    h.open();
    await expect(refresh).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(await countOf(db, c.cache)).toBe(0);
    expect(unhandled).toEqual([]);
  });
});

describe("T-0530 after sign-out", () => {
  it("a refresh started after sign-out (the next sign-in) writes normally", async () => {
    const db = freshOfflineDb();
    h.tables.set(
      "area_targets",
      CASES.find((c) => c.name === "refreshTargets")!.rows.area_targets!,
    );
    await signOutAndClearDevice({ userId: U }, { supabase: okClient, db });
    const refresh = history.refreshTargets();
    h.open();
    await refresh;
    expect(await countOf(db, "targetCache")).toBeGreaterThan(0);
  });
});
