// T-0631 AC7 (UF-11.4, D-0218 §5): the export writes the whole profile row, so bar_kg and
// plates_kg are exported with the row's values and no export-code change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineDb } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import { exportAccountData } from "../index.js";
import { NOW, U, pg, twoYears, type Row } from "./fixtures.js";

let db: OfflineDb;

beforeEach(() => {
  db = freshOfflineDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("T-0631 AC7 export carries bar_kg and plates_kg", () => {
  it("exports the profile's bar_kg and plates_kg with the stored values", async () => {
    const all = twoYears(U);
    const profile = { ...all.profiles![0]!, bar_kg: 15, plates_kg: [20, 10, 1.25] };
    const fake = pg({ profiles: [profile], area_targets: all.area_targets! });
    const result = await exportAccountData(
      { userId: U, email: "u@test.local", now: NOW },
      { supabase: fake.client, db },
    );
    const exported = (result.tables.profiles as unknown as Row[])[0]!;
    expect(exported.bar_kg).toBe(15);
    expect(exported.plates_kg).toEqual([20, 10, 1.25]);
    const roundTrip = JSON.parse(JSON.stringify(result)) as { tables: { profiles: Row[] } };
    expect(roundTrip.tables.profiles[0]).toMatchObject({ bar_kg: 15, plates_kg: [20, 10, 1.25] });
  });
});
