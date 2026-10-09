// T-0477 (D-0175 §1, amending D-0172 §5): a set checked in the List view before the first focus
// set — during the getReady countdown or a warm-up move — starts a rest, same as T-0418 already
// does from `set`/`confirm`/`rest`/`timed`. The real SessionHost, P1, fake-indexeddb, the T-0415
// injected List view seam (`keepsClockRunning: true`), and its captured `ctx`.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { readFocusState } from "../persist.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import { P1, S1, STARTED_AT_MS, USER_A, behindStartedAt } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenIds,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { call, renderSession } from "./session-helpers.js";
import { findScreen, setLineText } from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;
const upsertSpy = vi.mocked(offline.upsertSession);
const recordSpy = vi.mocked(offline.recordSet);

let ctx: FocusSession | null = null;
const entry = (id: string, label: string, keepsClockRunning: boolean): SeamAction => ({
  id,
  label,
  keepsClockRunning,
  render: (c) => {
    ctx = c;
    return <p data-testid={`overlay-${id}`}>{label}</p>;
  },
});
const listView = entry("list-view", "List view", true);
const seams = { pause: [listView] };

function seedFocus(state: Partial<FocusState>): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, P1, NOW), timer: null, ...state }),
  );
}

const benchInput = (setIndex: number) => ({
  sessionId: S1,
  exerciseId: "bench-press",
  setIndex,
  kind: "reps" as const,
  reps: 8,
  weightKg: 60,
  isWarmup: false,
  backoff: false,
  itemIndex: 0,
});

async function openList(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await flushReal();
}

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  ctx = null;
  upsertSpy.mockClear();
  recordSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T-0477 AC-3 List view during the warm-up", () => {
  it("startRest from warmup: rest runs, warmupSpentMs recorded, old WARMUP_NEXT never fires, UF-09.3 after", async () => {
    seedFocus({
      phase: "paused",
      resumePhase: "warmup",
      pausedAtMs: NOW,
      warmupIndex: 0,
      warmupStartedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 40, pausedMs: 0 },
    });
    await renderSession({ seams });
    await openList();
    await advance(20_000);
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    act(() => ctx!.startRest("bench-press"));
    await flushReal();

    expect(ctx!.rest).toMatchObject({ remainingS: 120 });
    expect(storedFocus()).toMatchObject({
      phase: "rest",
      warmupSpentMs: 20_000,
      warmupStartedAtMs: null,
    });

    // Past the old 40 s warm-up move's expiry (20 s already elapsed + 25 s more = 45 s): the rest
    // still runs, and no WARMUP_NEXT landed (the old timer never fires once the phase left warmup).
    await advance(25_000);
    expect(storedFocus()).toMatchObject({ phase: "rest" });
    expect((storedFocus() as unknown as FocusState).timer).toMatchObject({ durationS: 120 });
    const rest = ctx!.rest;
    expect(rest).not.toBeNull();
    expect(rest!.remainingS).toBe(95);
    expect(dispatched.some((e) => e.type === "WARMUP_NEXT")).toBe(false);

    act(() => ctx!.close());
    await flushReal();
    expect(screenIds()).toEqual(["UF-09.5"]);

    await advance(95_000);
    await findScreen("UF-09.3");
    expect(setLineText()).toBe(en.uf09.liftingCaption(2, 4));
  });

  it("pair (getReady): startRest before the 5 s countdown ends gives warmupSpentMs 0, no COUNTDOWN_END phase change", async () => {
    seedFocus({
      phase: "paused",
      resumePhase: "getReady",
      pausedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 5, pausedMs: 0 },
    });
    await renderSession({ seams });
    await openList();
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    act(() => ctx!.startRest("bench-press"));
    await flushReal();

    expect(storedFocus()).toMatchObject({ phase: "rest", warmupSpentMs: 0 });
    await advance(6_000);
    expect(storedFocus()).toMatchObject({ phase: "rest" });
    expect(dispatched.some((e) => e.type === "COUNTDOWN_END")).toBe(false);
  });

  it("contrast: from timeCheck (kept showing, D-0120 §4), startRest with the List view open leaves ctx.rest null", async () => {
    // A restored time check re-runs rule 8 (D-0120 §4): a `started_at` far enough behind keeps
    // it showing UF-09.8, so the host's own effect never moves the phase off `timeCheck` here.
    await seedSession({ started_at: behindStartedAt(NOW) });
    seedFocus({ phase: "timeCheck", itemIndex: 1, timer: null });
    await renderSession({ seams });
    await findScreen("UF-09.8");
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await flushReal();
    await openList();
    act(() => ctx!.startRest("barbell-row"));
    await flushReal();
    expect(ctx!.rest).toBeNull();
    expect(storedFocus()).toMatchObject({ phase: "timeCheck" });
  });
});

describe("T-0477 AC-4 reload", () => {
  async function toWarmupRest(): Promise<void> {
    seedFocus({
      phase: "paused",
      resumePhase: "warmup",
      pausedAtMs: NOW,
      warmupIndex: 0,
      warmupStartedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 40, pausedMs: 0 },
    });
    await renderSession({ seams });
    await openList();
    await advance(20_000);
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    act(() => ctx!.startRest("bench-press"));
    await flushReal();
  }

  it("unmount and remount restores the same running rest", async () => {
    await toWarmupRest();
    const before = storedFocus();
    cleanup();
    await renderSession({ seams });
    expect(storedFocus()).toEqual(before);
    expect(storedFocus()).toMatchObject({ phase: "rest", warmupSpentMs: 20_000 });
    expect(screenIds()).toEqual(["UF-09.5"]);
  });

  it("the same holds with navigator.onLine false", async () => {
    const onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await toWarmupRest();
    const before = storedFocus();
    cleanup();
    await renderSession({ seams });
    expect(storedFocus()).toEqual(before);
    expect(storedFocus()).toMatchObject({ phase: "rest" });
    onLineSpy.mockRestore();
  });

  it("readFocusState accepts a stored rest state reached from a warm-up REST_START", () => {
    const c = { plan: P1, library: [] };
    const good = {
      ...initialFocusState(S1, P1, NOW),
      phase: "rest" as const,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      warmupSpentMs: 20_000,
      warmupStartedAtMs: null,
    };
    const store = (s: unknown) => {
      const m = new Map([[KEY, JSON.stringify(s)]]);
      return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      } as unknown as Storage;
    };
    expect(readFocusState(S1, c, store(good))).not.toBeNull();
  });
});
