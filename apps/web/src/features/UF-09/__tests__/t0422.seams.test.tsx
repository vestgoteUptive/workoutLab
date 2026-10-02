// T-0422 AC-1 (the entries, D-0071 §4), AC-3 (the D-0142 §7 target, pure) and the `swap`
// entry's `render`/`onApply` against a test-built `ctx` (the sheet over a real cache, the real
// engine). SwapSheet tests freeze `Date` alone (D-0160 Consequences).
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import { nextSeamActions, pauseSeamActions, swapTarget } from "../seams.js";
import { buildWorkout, type FocusSession, type SessionRow } from "../session.js";
import { P1, S1, STARTED_AT, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, signIn } from "./helpers.js";
import { findEl } from "./set-loop-helpers.js";
import { seedSwapCache } from "./t0422-fixtures.js";

const ROW: SessionRow = {
  id: S1,
  started_at: STARTED_AT,
  time_budget_min: 45,
  energy: "normal",
  warmup_in_budget: true,
  ended_at: null,
  plan: P1,
};

function logged(itemIndex: number, setIndex: number): LoggedSet {
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: P1.items[itemIndex]!.exerciseId,
    reps: 8,
    weightKg: 60,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

const range = (n: number) => Array.from({ length: n }, (_, k) => k);

/** A test-built `ctx`: only what the seam reads is real; the writes are spies. */
function ctxWith(state: Partial<FocusState>, overrides: Partial<FocusSession> = {}) {
  const full: FocusState = { ...initialFocusState(S1, P1, STARTED_AT_MS), ...state };
  const replaceItem = vi.fn<FocusSession["replaceItem"]>(async () => undefined);
  const close = vi.fn<FocusSession["close"]>();
  const ctx = {
    sessionId: S1,
    row: ROW,
    plan: P1,
    workout: buildWorkout(ROW, P1),
    state: full,
    currentItemIndex: full.itemIndex,
    currentSetIndex: full.setIndex,
    loggedSets: full.loggedSets,
    replaceItem,
    close,
    ...overrides,
  } as unknown as FocusSession;
  return {
    ctx,
    replaceItem: ctx.replaceItem as typeof replaceItem,
    close: ctx.close as typeof close,
  };
}

describe("T-0422 AC-1 the entries (D-0071 §4)", () => {
  it("each array holds one swap entry, labelled from en.uf05, keepsClockRunning false", () => {
    for (const list of [pauseSeamActions, nextSeamActions]) {
      expect(list.filter((s) => s.id === "swap")).toHaveLength(1);
      const swap = list.find((s) => s.id === "swap")!;
      expect(swap.keepsClockRunning).toBe(false);
      expect(swap.label).toBe(en.uf05.swapAction);
      expect(swap.label).toBe("Swap");
    }
  });
});

describe("T-0422 AC-3 swapTarget (D-0142 §7, pure)", () => {
  it("the current item while it has an unlogged planned position", () => {
    expect(
      swapTarget(ctxWith({ itemIndex: 0, loggedSets: range(2).map((k) => logged(0, k)) }).ctx),
    ).toBe(0);
    expect(swapTarget(ctxWith({ itemIndex: 1 }).ctx)).toBe(1);
  });

  it("the next item once the current one is fully logged", () => {
    const { ctx } = ctxWith({ itemIndex: 0, loggedSets: range(4).map((k) => logged(0, k)) });
    expect(swapTarget(ctx)).toBe(1);
  });

  it("a skipped item is passed over; the pair: not skipped, it is the target", () => {
    const sets = range(4).map((k) => logged(0, k));
    expect(swapTarget(ctxWith({ itemIndex: 0, loggedSets: sets, skippedItems: [1] }).ctx)).toBe(2);
    expect(swapTarget(ctxWith({ itemIndex: 0, loggedSets: sets, skippedItems: [2] }).ctx)).toBe(1);
  });

  it("an item before the current one is never the target", () => {
    expect(swapTarget(ctxWith({ itemIndex: 2, loggedSets: [] }).ctx)).toBe(2);
  });

  it("none left: every set logged gives the current item", () => {
    const all = P1.items.flatMap((item, i) => range(item.sets).map((k) => logged(i, k)));
    expect(swapTarget(ctxWith({ itemIndex: 1, loggedSets: all }).ctx)).toBe(1);
  });

  it("a back-off position counts as planned", () => {
    const plan = {
      ...P1,
      items: P1.items.map((it, k) =>
        k === 0 ? { ...it, backoff: { weightKg: 70, reps: 8 } } : it,
      ),
    };
    const { ctx } = ctxWith(
      { itemIndex: 0, loggedSets: range(4).map((k) => logged(0, k)) },
      { plan },
    );
    expect(swapTarget(ctx)).toBe(0);
  });
});

describe("T-0422 the swap entry's render and onApply (test-built ctx)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(STARTED_AT_MS + 20 * 60_000);
    freshDb();
    signIn(USER_A);
    await seedSwapCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const swap = () => pauseSeamActions.find((s) => s.id === "swap")!;

  async function mount(ctx: FocusSession): Promise<HTMLElement> {
    render(<>{swap().render(ctx)}</>);
    return (await findEl(() =>
      screen.queryByRole("radiogroup", { name: "Replacement" }),
    )) as HTMLElement;
  }

  async function use(id: string, label: string): Promise<void> {
    const group = screen.getByRole("radiogroup", { name: "Replacement" });
    fireEvent.click(
      within(group.querySelector<HTMLElement>(`[data-id="${id}"]`)!).getByRole("radio"),
    );
    fireEvent.click(screen.getByRole("button", { name: `Use ${label}` }));
    await flushReal();
  }

  it("renders the sheet over the target item ('Replace Barbell row' after a complete bench-press)", async () => {
    const { ctx } = ctxWith({ itemIndex: 0, loggedSets: range(4).map((k) => logged(0, k)) });
    await mount(ctx);
    expect(screen.getByRole("dialog", { name: "Replace Barbell row" })).toBeInTheDocument();
  });

  it("Close calls ctx.close and writes nothing", async () => {
    const { ctx, close, replaceItem } = ctxWith({ itemIndex: 1 });
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledTimes(1);
    await flushReal();
    expect(replaceItem).not.toHaveBeenCalled();
  });

  it("Use: replaceItem(target, result.plan.items[target], result.plan.mainLiftId), then close()", async () => {
    const order: string[] = [];
    const held: { resolve?: () => void } = {};
    const replaceItem = vi.fn<FocusSession["replaceItem"]>(
      () =>
        new Promise<void>((r) => {
          order.push("replaceItem");
          held.resolve = r;
        }),
    );
    const close = vi.fn<FocusSession["close"]>(() => void order.push("close"));
    const { ctx } = ctxWith({ itemIndex: 1 }, { replaceItem, close });
    await mount(ctx);
    await use("db-row", "Db row");
    expect(replaceItem).toHaveBeenCalledTimes(1);
    const [index, item, mainLiftId] = replaceItem.mock.calls[0]!;
    expect(index).toBe(1);
    expect(item).toMatchObject({ exerciseId: "db-row", sets: 3 });
    expect(mainLiftId).toBe("bench-press");
    expect(replaceItem.mock.calls[0]).toHaveLength(3);
    // close() waits for the write.
    expect(close).not.toHaveBeenCalled();
    await act(async () => held.resolve!());
    await flushReal();
    expect(order).toEqual(["replaceItem", "close"]);
  });

  it("the pair: a rejected replaceItem leaves the sheet open with the save notice, no close()", async () => {
    const replaceItem = vi.fn<FocusSession["replaceItem"]>(async () => {
      throw new Error("quota");
    });
    const { ctx, close } = ctxWith({ itemIndex: 1 }, { replaceItem });
    await mount(ctx);
    await use("db-row", "Db row");
    await flushReal();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(en.uf05.saveFailed);
  });
});
