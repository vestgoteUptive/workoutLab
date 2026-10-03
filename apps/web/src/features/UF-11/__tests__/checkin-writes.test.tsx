// T-0470 UF-11.1 CheckinCard writes (D-0070 §3-§4, D-0166, D-0172 §1-§2). Fixtures: P2 = 7,
// P3 = 3, rhythm 3-4, `now` 2026-09-27T12:00:00+02:00, Europe/Stockholm (T-0308c's fixture F).
// Each test title starts with "T-0470 AC-n".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CheckinEvaluation } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { CheckinCard } from "../CheckinCard.js";
import { NOW, checkin } from "./fixtures.js";
import { signIn, signOut, useTimeZone } from "./test-helpers.js";
import { createWritesSpy, seedPeriods } from "./checkin-writes-helpers.js";

const TZ = "Europe/Stockholm";
const u = en.uf11.checkin;

const spy = createWritesSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const refreshCheckinsSpy = vi.fn(async () => undefined);
const refreshAllSpy = vi.fn(async (_now?: Date, _tz?: string) => undefined);
const checkinsShouldReject = { current: false };
const evaluationStub = { current: null as CheckinEvaluation | null };

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    loadCheckins: (...args: Parameters<typeof actual.loadCheckins>) =>
      checkinsShouldReject.current
        ? Promise.reject(new Error("boom"))
        : actual.loadCheckins(...args),
    refreshCheckins: async () => {
      await refreshCheckinsSpy();
    },
    refreshAll: async (...args: Parameters<typeof actual.refreshAll>) => {
      await refreshAllSpy(...args);
    },
  };
});

vi.mock("../checkin-evaluation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkin-evaluation.js")>();
  return {
    ...actual,
    evaluatePlanCheckin: (...args: Parameters<typeof actual.evaluatePlanCheckin>) =>
      evaluationStub.current ?? actual.evaluatePlanCheckin(...args),
  };
});

function renderCard() {
  return render(<CheckinCard now={() => NOW} timeZone={TZ} locale="en-GB" />);
}

/** The exact AC-1 insert payload for period 3 (completed_prev null: today's one-period engine,
 *  D-0172 §1). */
const AC1_INSERT_PAYLOAD = {
  period_index: 3,
  completed_last: 3,
  completed_prev: null,
  rhythm_min_before: 3,
  rhythm_max_before: 4,
  proposed_min: 2,
  proposed_max: 3,
  proposed_at: NOW.toISOString(),
  answer: null,
  answered_at: null,
};

const insertCalls = () =>
  spy.calls.filter((c) => c.table === "plan_checkins" && c.method === "insert");
const selectCalls = () =>
  spy.calls.filter((c) => c.table === "plan_checkins" && c.method === "select");
const tablesInOrder = () => spy.calls.map((c) => `${c.table}.${c.method}`);

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  refreshCheckinsSpy.mockClear();
  refreshAllSpy.mockClear();
  checkinsShouldReject.current = false;
  evaluationStub.current = null;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  checkinsShouldReject.current = false;
  evaluationStub.current = null;
  vi.restoreAllMocks();
});

/** Renders the AC-1 card and waits for its own first-shown insert to land, so every AC-2..AC-5
 *  test starts from the shown, unanswered state the real app would be in. */
async function renderShownCard() {
  await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
  renderCard();
  await waitFor(() => expect(insertCalls()).toHaveLength(1));
  await waitFor(() => expect(refreshCheckinsSpy).toHaveBeenCalledTimes(1));
  spy.reset();
}

describe("T-0470 AC-1 first-shown insert", () => {
  it("online, the first render makes exactly one insert, then refreshCheckins once; a re-render makes no second insert", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    const { rerender } = renderCard();

    await waitFor(() => expect(insertCalls()).toHaveLength(1));
    expect(insertCalls()[0]!.payload).toEqual(AC1_INSERT_PAYLOAD);
    await waitFor(() => expect(refreshCheckinsSpy).toHaveBeenCalledTimes(1));

    rerender(<CheckinCard now={() => NOW} timeZone={TZ} locale="en-GB" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(insertCalls()).toHaveLength(1);
  });

  it("one listed period (stub): inserts period_index 0, completed_prev null", async () => {
    evaluationStub.current = {
      periods: [
        { index: 0, start: "2026-09-13", end: "2026-09-26", completed: 0, status: "under" },
      ],
      proposal: { direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: [] },
      nextCheckinDate: "2026-10-11",
    };
    await seedPeriods({});
    renderCard();

    await waitFor(() => expect(insertCalls()).toHaveLength(1));
    expect(insertCalls()[0]!.payload).toMatchObject({ period_index: 0, completed_prev: null });
  });

  it("two listed periods (stub): inserts period_index 3, completed_last 1, completed_prev 4", async () => {
    evaluationStub.current = {
      periods: [
        { index: 2, start: "2026-08-30", end: "2026-09-12", completed: 4, status: "on_plan" },
        { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 1, status: "under" },
      ],
      proposal: { direction: "down", rhythmMin: 2, rhythmMax: 3, previewTargets: [] },
      nextCheckinDate: "2026-10-11",
    };
    await seedPeriods({});
    renderCard();

    await waitFor(() => expect(insertCalls()).toHaveLength(1));
    expect(insertCalls()[0]!.payload).toMatchObject({
      period_index: 3,
      completed_last: 1,
      completed_prev: 4,
    });
  });

  it("with a cached row for period 3: no insert", async () => {
    const existing = {
      ...checkin("existing", NOW.toISOString(), 3, [3, 4], [2, 3], null),
      periodIndex: 3,
    };
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3, checkins: [existing] });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(insertCalls()).toHaveLength(0);
  });

  it("offline: no insert; dispatching online inserts once, with no remount", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();

    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument());
    const node = document.querySelector('[data-part="checkin-card"]');
    await new Promise((r) => setTimeout(r, 20));
    expect(insertCalls()).toHaveLength(0);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    fireEvent(window, new Event("online"));

    await waitFor(() => expect(insertCalls()).toHaveLength(1));
    expect(document.querySelector('[data-part="checkin-card"]')).toBe(node);
  });

  it("no proposal: no insert", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p3: 5 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(insertCalls()).toHaveLength(0);
  });

  it("no user id: no insert", async () => {
    signOut();
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(insertCalls()).toHaveLength(0);
  });
});

describe("T-0470 AC-1b second device (D-0172 §2)", () => {
  it("unanswered row: the card and both buttons stay, no further write, no alert, no console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    spy.collideOn("plan_checkins");
    spy.answerRowOn("plan_checkins", null);
    renderCard();

    await waitFor(() => expect(selectCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(selectCalls()[0]!.filters).toEqual([{ op: "eq", column: "period_index", value: 3 }]);
    expect(document.querySelector('[data-part="checkin-card"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: u.keep })).toBeInTheDocument();
    expect(tablesInOrder()).toEqual(["plan_checkins.insert", "plan_checkins.select"]);
    expect(refreshAllSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("answered row: no checkin-card, refreshAll once, no alert, no console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    spy.collideOn("plan_checkins");
    spy.answerRowOn("plan_checkins", "accepted");
    renderCard();

    await waitFor(() => expect(refreshAllSpy).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("T-0470 AC-2 Accept (D-0070 §3)", () => {
  it("upsert, then profiles update, then the row update, in order; then refreshAll; then the card is gone", async () => {
    await renderShownCard();

    fireEvent.click(screen.getByRole("button", { name: u.accept }));

    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    expect(tablesInOrder()).toEqual([
      "area_targets.upsert",
      "profiles.update",
      "plan_checkins.update",
    ]);
    const areaCall = spy.calls[0]!;
    expect(areaCall.options).toEqual({ onConflict: "user_id,area_id" });
    const rows = areaCall.payload as { area_id: string; sets_per_14d: number; source: string }[];
    expect(rows).toHaveLength(9);
    for (const row of rows) expect(row.source).toBe("adapted");

    expect(spy.calls[1]!.payload).toEqual({ rhythm_min: 2, rhythm_max: 3 });

    expect(spy.calls[2]!.payload).toEqual({ answer: "accepted", answered_at: NOW.toISOString() });
    expect(spy.calls[2]!.filters).toEqual([{ op: "eq", column: "period_index", value: 3 }]);

    await waitFor(() => expect(refreshAllSpy).toHaveBeenCalledTimes(1));
  });

  it("(1) rejects: (2) and (3) aren't called, the alert shows, the card stays", async () => {
    await renderShownCard();
    spy.failOn("area_targets", "reject");

    fireEvent.click(screen.getByRole("button", { name: u.accept }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(en.uf11.saveFailed));
    expect(tablesInOrder()).toEqual(["area_targets.upsert"]);
    expect(document.querySelector('[data-part="checkin-card"]')).toBeInTheDocument();
  });

  it("(2) resolves with error: (3) isn't called; a retry starts again at (1)", async () => {
    await renderShownCard();
    spy.failOn("profiles", "error");

    fireEvent.click(screen.getByRole("button", { name: u.accept }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(tablesInOrder()).toEqual(["area_targets.upsert", "profiles.update"]);

    spy.reset();
    fireEvent.click(screen.getByRole("button", { name: u.accept }));
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    expect(tablesInOrder()).toEqual([
      "area_targets.upsert",
      "profiles.update",
      "plan_checkins.update",
    ]);
  });

  it("a REJECTED refreshAll still hides the card, with no alert", async () => {
    await renderShownCard();
    refreshAllSpy.mockRejectedValueOnce(new Error("refresh failed"));

    fireEvent.click(screen.getByRole("button", { name: u.accept }));
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("T-0470 AC-3 Keep current", () => {
  it("exactly one row update, no profiles or area_targets call, refreshAll once, card gone", async () => {
    await renderShownCard();

    fireEvent.click(screen.getByRole("button", { name: u.keep }));

    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    expect(tablesInOrder()).toEqual(["plan_checkins.update"]);
    expect(spy.calls[0]!.payload).toEqual({ answer: "kept", answered_at: NOW.toISOString() });
    expect(spy.calls[0]!.filters).toEqual([{ op: "eq", column: "period_index", value: 3 }]);
    await waitFor(() => expect(refreshAllSpy).toHaveBeenCalledTimes(1));
  });

  it("a failed Keep shows the alert and keeps the card", async () => {
    await renderShownCard();
    spy.failOn("plan_checkins", "error");

    fireEvent.click(screen.getByRole("button", { name: u.keep }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(en.uf11.saveFailed));
    expect(document.querySelector('[data-part="checkin-card"]')).toBeInTheDocument();
  });
});

describe("T-0470 AC-4 never silent (principle 4)", () => {
  it("5 mounts on 5 fake days make no profiles/area_targets write and show the card each time", async () => {
    const cachedRow = {
      ...checkin("existing", NOW.toISOString(), 3, [3, 4], [2, 3], null),
      periodIndex: 3,
    };
    const days = [
      "2026-09-27T10:00:00.000Z",
      "2026-09-28T10:00:00.000Z",
      "2026-09-29T10:00:00.000Z",
      "2026-09-30T10:00:00.000Z",
      "2026-10-01T10:00:00.000Z",
    ];
    for (const iso of days) {
      await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3, checkins: [cachedRow] });
      spy.reset();
      render(<CheckinCard now={() => new Date(iso)} timeZone={TZ} locale="en-GB" />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument(),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(spy.calls.some((c) => c.table === "profiles")).toBe(false);
      expect(spy.calls.some((c) => c.table === "area_targets")).toBe(false);
      cleanup();
    }
  });
});

describe("T-0470 AC-5 double tap", () => {
  it("a second Accept tap while the first is pending makes no second call; both buttons disabled", async () => {
    await renderShownCard();
    // Holds step (1) open, so "a write is in flight" is observable before it resolves.
    const release = spy.gateOn("area_targets");

    const accept = screen.getByRole("button", { name: u.accept });
    const keep = screen.getByRole("button", { name: u.keep });
    fireEvent.click(accept);
    fireEvent.click(accept);
    fireEvent.click(keep);

    await waitFor(() => expect(accept).toBeDisabled());
    expect(keep).toBeDisabled();
    expect(spy.calls.filter((c) => c.table === "area_targets")).toHaveLength(1);

    release();
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    // The gated call was the only Accept to go through; Keep's tap made no call at all.
    expect(
      spy.calls.filter((c) => c.table === "plan_checkins" && c.method === "update"),
    ).toHaveLength(1);
  });

  it("a second Keep tap while the first is pending makes no second call", async () => {
    await renderShownCard();
    const release = spy.gateOn("plan_checkins");

    const keep = screen.getByRole("button", { name: u.keep });
    fireEvent.click(keep);
    fireEvent.click(keep);

    await waitFor(() => expect(keep).toBeDisabled());
    expect(spy.calls.filter((c) => c.table === "plan_checkins")).toHaveLength(1);

    release();
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument(),
    );
    expect(spy.calls.filter((c) => c.table === "plan_checkins")).toHaveLength(1);
  });
});
