// T-0636 AC6 (UF-02.1): offline, a record in a queued `pending: true` set shows from the first
// cache read with no network call. Real `lib/offline` (fake-indexeddb), as in real.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { recordSet } from "../../../lib/offline/queue.js";
import { L1, PROFILE, TZ, history, targets } from "./fixtures.js";
import { freshDb, macrotask, part, renderToday, seedCache, signIn, signOut } from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));

const NOW = new Date("2026-10-11T12:00:00+02:00");

beforeEach(async () => {
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  const db = freshDb();
  signIn();
  await seedCache(db, {
    // One earlier cached session of bench press: 60 kg x 8.
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

describe("AC6 offline, pending", () => {
  it("a queued 70 kg x 8 set shows 'Latest PR Bench press 70 kg × 8' with no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await recordSet(
      {
        sessionId: "S-new",
        exerciseId: "bench-press",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 70,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-10-10T18:00:00+02:00") },
    );
    renderToday({ now: NOW, timeZone: TZ, locale: "en-GB" });
    await waitFor(() => expect(part("latest-pr")).not.toBeNull());
    expect(part("latest-pr")!.textContent).toBe("Latest PR Bench press 70 kg × 8");
    await macrotask();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("CONTRAST: with no queued set the cached session alone is no record", async () => {
    renderToday({ now: NOW, timeZone: TZ, locale: "en-GB" });
    await waitFor(() => expect(part("start")).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-part="card-row"]')).not.toBeNull());
    await macrotask();
    expect(part("latest-pr")).toBeNull();
  });
});
