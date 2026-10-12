// T-0632 (D-0218, UF-09.3): bar and plates cached with the profile; loadBarbell with defaults.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("../../auth/client.js", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: h.rows[0] ?? null, error: null }),
      }),
    }),
  },
}));

const { refreshProfile, loadBarbell, loadProfile, DEFAULT_BARBELL } = await import("../history.js");
const { offlineDb } = await import("../db.js");
const { invalidateCacheWrites } = await import("../cache-generation.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");
const { wipeLocalUserData } = await import("../../account/index.js");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const profileRow = (bar_kg: number, plates_kg: number[]) => ({
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
  bar_kg: bar_kg,
  plates_kg: plates_kg,
});

beforeEach(() => {
  freshOfflineDb();
  signIn(A);
  h.rows = [profileRow(15, [20, 10])];
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("T-0632 bar and plates cache", () => {
  it("AC1 refresh writes barbell next to an unchanged profile", async () => {
    await refreshProfile();
    const row = await offlineDb().profileCache.get(A);
    expect(row?.barbell).toEqual({ barKg: 15, platesKg: [20, 10] });
    expect(row?.profile.goal).toBe("build_muscle");
  });
  it("AC2 loadBarbell reads the cached value", async () => {
    await refreshProfile();
    expect(await loadBarbell()).toEqual({ barKg: 15, platesKg: [20, 10] });
  });
  it("AC3a defaults when signed out", async () => {
    await refreshProfile();
    signOut();
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
  });
  it("AC3b defaults when no row is cached", async () => {
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
  });
  it("AC3c defaults for a row from an older build", async () => {
    await refreshProfile();
    const row = (await offlineDb().profileCache.get(A))!;
    await offlineDb().profileCache.put({ userId: A, profile: row.profile });
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
    expect((await loadProfile())?.goal).toBe("build_muscle");
  });
  it("AC3d defaults when the IndexedDB read throws", async () => {
    vi.spyOn(offlineDb().profileCache, "get").mockRejectedValue(new Error("idb"));
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
  });
  it("AC4 empty plates stay empty", async () => {
    h.rows = [profileRow(20, [])];
    await refreshProfile();
    expect(await loadBarbell()).toEqual({ barKg: 20, platesKg: [] });
  });
  it("AC5 one user never reads another's value", async () => {
    await refreshProfile();
    signOut();
    signIn(B);
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
    h.rows = [profileRow(10, [5])];
    await refreshProfile();
    expect(await loadBarbell()).toEqual({ barKg: 10, platesKg: [5] });
    signOut();
    signIn(A);
    expect(await loadBarbell()).toEqual({ barKg: 15, platesKg: [20, 10] });
  });
  it("AC6 after the sign-out wipe the default is returned", async () => {
    await refreshProfile();
    await wipeLocalUserData(A);
    signIn(A);
    expect(await loadBarbell()).toEqual(DEFAULT_BARBELL);
  });
  it("AC7 a stale generation writes neither profile nor barbell", async () => {
    const p = refreshProfile();
    invalidateCacheWrites();
    await p;
    expect(await offlineDb().profileCache.get(A)).toBeUndefined();
  });
});
