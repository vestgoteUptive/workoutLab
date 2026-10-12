// T-0636 (UF-02.1, D-0219): the Latest PR line above Start. AC1 to AC5, AC7, AC8, AC10 (markup).
// The engine's `records()` is the real one; the cache loaders are mocked as in week-render.test.tsx.
// AC6 (offline, pending) is in latest-pr-offline.test.tsx; the computed colours and the contrast
// are in tests/e2e/uf-02-today.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { HistorySet, LibraryExercise } from "@workoutlab/shared";
import { L1_WITH_WARMUP, PROFILE, TZ, targets } from "./fixtures.js";
import { aboveStart, macrotask, part, renderToday } from "./helpers.js";
import { latestPr } from "../pr.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/engine-feed.js", () => ({
  loadEngineHistory: mocks.loadEngineHistory,
}));
vi.mock("../../../lib/offline/history.js", () => ({
  loadTargets: mocks.loadTargets,
  loadLibrary: mocks.loadLibrary,
  loadProfile: mocks.loadProfile,
  lastSyncedAt: mocks.lastSyncedAt,
  refreshAll: mocks.refreshAll,
}));

const NAMES: Record<string, string> = {
  "back-squat": "Back Squat",
  "bench-press": "Bench Press",
  "push-up": "Push-up",
  plank: "Plank",
};
const LIBRARY: LibraryExercise[] = L1_WITH_WARMUP.map((e) => ({
  ...e,
  name: NAMES[e.id] ?? e.name,
}));

const NOW = new Date("2026-10-11T12:00:00+02:00");
const PROPS = { now: NOW, timeZone: TZ, locale: "en-GB" } as const;
const NBSP = " ";

let n = 0;
function set(
  exerciseId: string,
  completedAt: string,
  session: string,
  fields: Partial<HistorySet> = {},
): HistorySet {
  n += 1;
  const iso = new Date(completedAt).toISOString();
  return {
    clientId: `pr-${n}`,
    sessionId: session,
    exerciseId,
    isWarmup: false,
    completedAt: iso,
    editedAt: iso,
    deletedAt: null,
    reps: 8,
    weightKg: 100,
    durationS: null,
    ...fields,
  };
}

/** A tombstone of `row`: same clientId, later editedAt (the engine feed doesn't dedupe). */
const tombstone = (row: HistorySet): HistorySet => ({
  ...row,
  editedAt: "2026-10-10T00:00:00.000Z",
  deletedAt: "2026-10-10T00:00:00.000Z",
});

const SQUAT_1 = set("back-squat", "2026-10-01T10:00:00+02:00", "A");
// The ticket text says 102.5 x 6, which Epley ranks below 100 x 8 (123.0 < 126.7); 107.5 x 6 (129.2) is the record.
const SQUAT_2 = set("back-squat", "2026-10-08T10:00:00+02:00", "B", { weightKg: 107.5, reps: 6 });

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(LIBRARY);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

async function ready(props: Parameters<typeof renderToday>[0] = PROPS) {
  renderToday(props);
  await waitFor(() => expect(document.querySelector('[data-part="start"]')).not.toBeNull());
  await waitFor(() => expect(document.querySelector('[data-part="card-row"]')).not.toBeNull());
  await macrotask();
}

describe("AC1 shown", () => {
  it("reads 'Latest PR Back Squat 107.5 kg × 6' and sits directly before Start", async () => {
    mocks.loadEngineHistory.mockResolvedValue([SQUAT_1, SQUAT_2]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Back Squat 107.5${NBSP}kg × 6`);
    expect(aboveStart()).toBe(part("latest-pr"));
  });

  it("the line is plain text: no live region, not focusable, a label and a value span", async () => {
    mocks.loadEngineHistory.mockResolvedValue([SQUAT_1, SQUAT_2]);
    await ready();
    const line = part("latest-pr")!;
    expect(line.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(line.querySelector("a, button, input, [tabindex]")).toBeNull();
    expect(line.hasAttribute("tabindex")).toBe(false);
    expect([...line.querySelectorAll("span")].map((s) => s.textContent)).toEqual([
      "Latest PR",
      `Back Squat 107.5${NBSP}kg × 6`,
    ]);
  });

  it("D-0219: 80 kg x 10 (e1RM 106.7) beats an earlier 90 kg x 3 (e1RM 99); the set is shown, not the e1RM", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      set("bench-press", "2026-10-02T10:00:00+02:00", "A", { weightKg: 90, reps: 3 }),
      set("bench-press", "2026-10-09T10:00:00+02:00", "B", { weightKg: 80, reps: 10 }),
    ]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Bench Press 80${NBSP}kg × 10`);
  });
});

describe("AC2 newest wins", () => {
  it("a bench-press record on 10-09 is read instead of the squat", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      SQUAT_1,
      SQUAT_2,
      set("bench-press", "2026-10-02T10:00:00+02:00", "A", { weightKg: 60 }),
      set("bench-press", "2026-10-09T10:00:00+02:00", "C", { weightKg: 70, reps: 8 }),
    ]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Bench Press 70${NBSP}kg × 8`);
  });
});

describe("AC3 14-day edge (now 10-11, window starts 09-28)", () => {
  const withRecordOn = (day: string) => [
    set("back-squat", "2026-09-01T10:00:00+02:00", "A"),
    set("back-squat", `${day}T10:00:00+02:00`, "B", { weightKg: 110 }),
  ];
  it("a record on 09-28 (today - 13) shows", async () => {
    mocks.loadEngineHistory.mockResolvedValue(withRecordOn("2026-09-28"));
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Back Squat 110${NBSP}kg × 8`);
  });
  it("a record on 09-27 (today - 14) doesn't, and no line renders", async () => {
    mocks.loadEngineHistory.mockResolvedValue(withRecordOn("2026-09-27"));
    await ready();
    expect(part("latest-pr")).toBeNull();
  });
  it("the edge is the local date: 09-27 23:30 Stockholm (21:30Z) is out, 09-28 00:30 (22:30Z) is in", () => {
    const lib = LIBRARY;
    const base = set("back-squat", "2026-09-01T10:00:00+02:00", "A");
    const at = (iso: string) => [base, set("back-squat", iso, "B", { weightKg: 110 })];
    expect(latestPr(at("2026-09-27T23:30:00+02:00"), lib, NOW, TZ)).toBeNull();
    expect(latestPr(at("2026-09-28T00:30:00+02:00"), lib, NOW, TZ)?.name).toBe("Back Squat");
  });
  it("is DST-safe: across the 2026-10-25 change, now 11-05 the window starts 10-23", () => {
    const base = set("back-squat", "2026-10-01T10:00:00+02:00", "A");
    const now = new Date("2026-11-05T12:00:00+01:00");
    const at = (iso: string) => [base, set("back-squat", iso, "B", { weightKg: 110 })];
    expect(latestPr(at("2026-10-23T00:30:00+02:00"), LIBRARY, now, TZ)?.name).toBe("Back Squat");
    expect(latestPr(at("2026-10-22T23:30:00+02:00"), LIBRARY, now, TZ)).toBeNull();
  });
});

describe("AC4 kinds", () => {
  it("push-up 25 reps reads 'Push-up 25 reps'", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      set("push-up", "2026-10-02T10:00:00+02:00", "A", { weightKg: null, reps: 20 }),
      set("push-up", "2026-10-09T10:00:00+02:00", "B", { weightKg: null, reps: 25 }),
    ]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe("Latest PR Push-up 25 reps");
  });
  it("one rep reads '1 rep'", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      set("push-up", "2026-10-02T10:00:00+02:00", "A", { weightKg: 0, reps: 0 }),
      set("push-up", "2026-10-09T10:00:00+02:00", "B", { weightKg: 0, reps: 1 }),
    ]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe("Latest PR Push-up 1 rep");
  });
  it("plank 90 s reads 'Plank 90 s'", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      set("plank", "2026-10-02T10:00:00+02:00", "A", { weightKg: null, reps: null, durationS: 60 }),
      set("plank", "2026-10-09T10:00:00+02:00", "B", { weightKg: null, reps: null, durationS: 90 }),
    ]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe("Latest PR Plank 90 s");
  });
});

describe("AC5 zero history and first sessions", () => {
  it("an empty history renders no line", async () => {
    await ready();
    expect(part("latest-pr")).toBeNull();
  });
  it("one session per exercise renders no line", async () => {
    mocks.loadEngineHistory.mockResolvedValue([
      SQUAT_1,
      set("bench-press", "2026-10-09T10:00:00+02:00", "B"),
    ]);
    await ready();
    expect(part("latest-pr")).toBeNull();
  });
});

describe("AC7 tombstone", () => {
  const EARLY = set("back-squat", "2026-09-20T10:00:00+02:00", "Z", { weightKg: 80 });
  it("the newest record is tombstoned: the next best that is still a record shows", async () => {
    mocks.loadEngineHistory.mockResolvedValue([EARLY, SQUAT_1, SQUAT_2, tombstone(SQUAT_2)]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Back Squat 100${NBSP}kg × 8`);
  });
  it("CONTRAST: without the tombstone the newest shows", async () => {
    mocks.loadEngineHistory.mockResolvedValue([EARLY, SQUAT_1, SQUAT_2]);
    await ready();
    expect(part("latest-pr")!.textContent).toBe(`Latest PR Back Squat 107.5${NBSP}kg × 6`);
  });
  it("no record is left: no line", async () => {
    mocks.loadEngineHistory.mockResolvedValue([EARLY, SQUAT_2, tombstone(SQUAT_2)]);
    await ready();
    expect(part("latest-pr")).toBeNull();
  });
});

describe("AC8 states", () => {
  it("loading: no line (first read still pending)", async () => {
    mocks.loadEngineHistory.mockReturnValue(new Promise(() => {}));
    renderToday(PROPS);
    await macrotask();
    expect(part("latest-pr")).toBeNull();
    expect(part("start")).not.toBeNull();
  });
  it("no-plan: no line even with a record in the history", async () => {
    mocks.loadEngineHistory.mockResolvedValue([SQUAT_1, SQUAT_2]);
    mocks.loadProfile.mockResolvedValue(null);
    renderToday(PROPS);
    await waitFor(() => expect(part("no-plan")).not.toBeNull());
    await macrotask();
    expect(part("latest-pr")).toBeNull();
  });
});
