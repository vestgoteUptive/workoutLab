// T-0975 UF-02.1 (D-0260, D-0263 §6): the Latest PR line carries the one-side word of a flagged
// exercise; a null or missing flag leaves the line exactly as before (AC1, AC3, AC7). Real
// `lib/offline` (fake-indexeddb), offline, as in latest-pr-offline.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { recordSet } from "../../../lib/offline/queue.js";
import { L1, PROFILE, TZ, history, targets } from "./fixtures.js";
import {
  TEST_USER,
  freshDb,
  macrotask,
  part,
  renderToday,
  seedCache,
  signIn,
  signOut,
} from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));

const NOW = new Date("2026-10-11T12:00:00+02:00");
let db: OfflineDb;

async function cacheDetail(id: string, unilateral: unknown): Promise<void> {
  await db.exerciseDetails.put({
    key: userScopedKey(TEST_USER, id),
    userId: TEST_USER,
    detail: {
      id,
      instructions: [],
      mistakes: [],
      cue: null,
      source: "s",
      license: "l",
      attribution: null,
      sourceUrl: null,
      variants: [],
      ...(unilateral === undefined ? {} : { unilateral }),
    } as never,
  });
}

async function logBench(reps: number, weightKg: number): Promise<void> {
  await recordSet(
    {
      sessionId: "S-new",
      exerciseId: "bench-press",
      setIndex: 0,
      kind: "reps",
      reps,
      weightKg,
      isWarmup: false,
      backoff: false,
    },
    { now: new Date("2026-10-10T18:00:00+02:00") },
  );
}

async function line(): Promise<string> {
  renderToday({ now: NOW, timeZone: TZ, locale: "en-GB" });
  await waitFor(() => expect(part("latest-pr")).not.toBeNull());
  await macrotask();
  return part("latest-pr")!.textContent!.replace(/\u00a0/g, " ");
}

beforeEach(async () => {
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  db = freshDb();
  signIn();
  await seedCache(db, {
    history: history("bench-press", "2026-10-02T10:00:00+02:00", 1, { prefix: "cached" }),
    library: L1,
    targets: targets(),
    profile: PROFILE,
  });
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("T-0975 Today PR line", () => {
  it("AC1/AC7: a flagged row reads '70 kg × 8 per arm' from the cached detail, offline", async () => {
    await cacheDetail("bench-press", "arm");
    await logBench(8, 70);
    expect(await line()).toBe("Latest PR Bench press 70 kg × 8 per arm");
  });

  it("AC3: an unflagged row (null) reads exactly as before", async () => {
    await cacheDetail("bench-press", null);
    await logBench(8, 70);
    expect(await line()).toBe("Latest PR Bench press 70 kg × 8");
  });

  it("AC7: a cached row without `unilateral`, and no detail at all, show no suffix", async () => {
    await cacheDetail("bench-press", undefined);
    await logBench(8, 70);
    expect(await line()).toBe("Latest PR Bench press 70 kg × 8");
  });

  it("AC7: an unknown stored word reads as both sides", async () => {
    await cacheDetail("bench-press", "both");
    await logBench(8, 70);
    expect(await line()).toBe("Latest PR Bench press 70 kg × 8");
  });
});
