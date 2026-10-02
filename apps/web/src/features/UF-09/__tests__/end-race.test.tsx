// T-0304d rework (QA + review): End workout while a UF-09.8 Trim write is pending. The late plan
// write must never undo `finish()`: `ended_at` stays set, `wl-focus:<id>` stays removed, and
// nothing is written to the row after the ended row. D-0120 §1 §8, D-0071 §6.
//
// The default (build log): End workout is aria-disabled and inert on UF-09.9 while a plan write
// is pending, and `finish()` (also reachable from a seam's `ctx`) waits for that write before it
// reads the row. A plan write that resolves once `finish()` has started moves nothing.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeCheck } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import type { SessionRow } from "../session.js";
import { S1, USER_A } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { R8_PLAN, at, benchSets } from "./r8-fixtures.js";
import { deferred, renderSession } from "./session-helpers.js";
import { findPath, seedFocus } from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./r8-mock.js").then((m) => m.r8Mock(orig)),
);
vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const tc = vi.mocked(timeCheck);
const upsert = vi.mocked(offline.upsertSession);
let realUpsert: typeof offline.upsertSession;

beforeEach(async () => {
  const engine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  const real = await vi.importActual<typeof import("../../../lib/offline/index.js")>(
    "../../../lib/offline/index.js",
  );
  realUpsert = real.upsertSession;
  tc.mockReset();
  tc.mockImplementation(engine.timeCheck);
  upsert.mockClear();
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function storedRow(): Promise<SessionRow> {
  return (await offline.offlineDb().sessions.get(S1))!.row;
}

async function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

/** UF-09.8 after item 0 at 1500 s (R8-E1: behind, Trim offered). */
async function atCheck() {
  useFakeClock(at(1500));
  await seedSession({ plan: R8_PLAN });
  seedFocus(
    at(1500),
    {
      phase: "rest",
      itemIndex: 0,
      setIndex: 3,
      loggedSets: benchSets(4),
      timer: { startedAtMs: at(1500) - 120_000, durationS: 120, pausedMs: 0 },
    },
    R8_PLAN,
  );
  await renderSession({ timeZone: "UTC", locale: "en-GB" });
  expect(screenId()).toBe("UF-09.8");
}

/** Holds the next upsertSession call; `release()` lets the REAL write land. */
function holdNextUpsert() {
  const gate = deferred<void>();
  upsert.mockImplementationOnce(async (row) => {
    await gate.promise;
    return realUpsert(row);
  });
  return {
    release: async () => {
      await act(async () => gate.resolve());
      await flushReal();
    },
  };
}

describe("T-0304d rework: End while a plan write is pending", () => {
  it("the QA probe: Trim pending → Pause → End → confirm → the write lands; ended_at kept, no wl-focus key, nothing written after the ended row", async () => {
    await atCheck();
    const trim = holdNextUpsert();
    await click("Trim");
    await click("Pause workout");
    expect(screenId()).toBe("UF-09.9");
    // End is inert while the plan write is pending.
    const end = screen.getByRole("button", { name: "End workout" });
    expect(end).toHaveAttribute("aria-disabled", "true");
    await click("End workout");
    expect(screen.queryByText("End workout? Your sets are saved.")).toBeNull();
    // A second tap (the "confirm" of the probe) is inert too: nothing is written.
    await click("End workout");
    expect(upsert).toHaveBeenCalledTimes(1);
    await trim.release();

    // The trim landed before any end: the machine walks it, still paused.
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "next", itemIndex: 1 });
    expect((await storedRow()).ended_at).toBeNull();
    // Now End works, and nothing comes after it.
    expect(screen.getByRole("button", { name: "End workout" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await click("End workout");
    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    const row = await storedRow();
    expect(row.ended_at).toBe(new Date(at(1500)).toISOString());
    expect(storedFocus()).toBeNull();
    const last = upsert.mock.calls[upsert.mock.calls.length - 1]![0];
    expect(last.ended_at).toBe(row.ended_at);
    expect(row).toEqual(last);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("through the hook (a seam's ctx.finish()) while the write is pending: finish waits, ended_at kept, no key, the late write moves nothing", async () => {
    await atCheck();
    const trim = holdNextUpsert();
    await click("Trim");
    await click("Pause workout");
    let finished = false;
    act(() => {
      void session()
        .finish()
        .then(() => {
          finished = true;
        });
    });
    await flushReal();
    // finish() hasn't written anything while the plan write is held.
    expect(finished).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    await trim.release();
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(finished).toBe(true);
    const row = await storedRow();
    expect(row.ended_at).toBe(new Date(at(1500)).toISOString());
    expect(storedFocus()).toBeNull();
    // The ended row is the last write; the plan it carries is the one that landed before it.
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]![0].ended_at).toBe(row.ended_at);
    expect(row).toEqual(upsert.mock.calls[1]![0]);
    expect((row.plan as SessionPlan).items[3]).toMatchObject({ sets: 2 });
  });

  it("the pair: Pause on UF-09.8 with no pending write → End → confirm ends at once", async () => {
    await atCheck();
    await click("Pause workout");
    const end = screen.getByRole("button", { name: "End workout" });
    expect(end).not.toHaveAttribute("aria-disabled");
    await click("End workout");
    expect(screen.getByText("End workout? Your sets are saved.")).toBeInTheDocument();
    await click("End workout");
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    const row = await storedRow();
    expect(row.ended_at).toBe(new Date(at(1500)).toISOString());
    expect(row.plan).toEqual(R8_PLAN);
    expect(storedFocus()).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
