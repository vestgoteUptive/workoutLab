// AC-C13 (56-day history fetch), AC-C16 (library/targets/profile cache).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SelectCall {
  table: string;
  columns: string;
  gte?: [string, string];
}

const calls: SelectCall[] = [];
const tableData = new Map<string, unknown[]>();

function makeQuery(table: string, columns: string) {
  const call: SelectCall = { table, columns };
  calls.push(call);
  const data = tableData.get(table) ?? [];
  const result = { data, error: null };
  const query = {
    gte: (col: string, value: string) => {
      call.gte = [col, value];
      return Promise.resolve(result);
    },
    maybeSingle: () => Promise.resolve({ data: (data[0] as unknown) ?? null, error: null }),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return query;
}

const from = vi.fn((table: string) => ({
  select: (columns: string) => makeQuery(table, columns),
}));

vi.mock("../../auth/client.js", () => ({ supabase: { from } }));

const {
  refreshHistory,
  refreshLibrary,
  refreshTargets,
  refreshProfile,
  loadLibrary,
  loadTargets,
  loadProfile,
} = await import("../history.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  calls.length = 0;
  tableData.clear();
});

afterEach(() => signOut());

describe("refreshHistory (AC-C13)", () => {
  it("queries session_sets_live with gte(completed_at, 56-local-day window start) and caches", async () => {
    tableData.set("session_sets_live", [
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
    ]);

    await refreshHistory(new Date("2026-10-26T08:00:00Z"), "Europe/Stockholm");

    const call = calls.find((c) => c.table === "session_sets_live")!;
    expect(call.gte).toEqual(["completed_at", "2026-08-31T22:00:00.000Z"]);

    const db = offlineDb();
    const cached = await db.historyCache.where({ userId: USER }).toArray();
    expect(cached).toHaveLength(1);
    expect(cached[0]!.clientId).toBe("c-1");

    const meta = await db.syncMeta.get(USER);
    expect(meta?.lastSyncedAt).toBe("2026-10-26T08:00:00.000Z");
  });
});

describe("refreshLibrary/refreshTargets/refreshProfile + loaders (AC-C16)", () => {
  it("caches the library, targets and profile so a later start reads them with no network call", async () => {
    tableData.set("exercises", [
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
    ]);
    tableData.set("exercise_areas", [{ exercise_id: "back-squat", area_id: "quads", weight: 1 }]);
    tableData.set(
      "area_targets",
      Array.from({ length: 1 }, () => ({
        area_id: "quads",
        sets_per_14d: 10,
        source: "default",
        updated_at: "2026-09-01T00:00:00.000Z",
      })),
    );
    tableData.set("profiles", [
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
    ]);

    await refreshLibrary();
    await refreshTargets();
    await refreshProfile();

    // "no network call awaited" for a subsequent start: the loaders read only from IDB.
    from.mockClear();

    const library = await loadLibrary();
    const targets = await loadTargets();
    const profile = await loadProfile();

    expect(from).not.toHaveBeenCalled();
    expect(library).toHaveLength(1);
    expect(library[0]!.id).toBe("back-squat");
    expect(targets).toHaveLength(1);
    expect(targets[0]!.area).toBe("quads");
    expect(profile?.goal).toBe("build_muscle");
  });
});
