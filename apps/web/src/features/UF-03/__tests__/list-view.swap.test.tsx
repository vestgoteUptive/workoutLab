// T-0478 UF-03.1 Swap button on the List view's current card (D-0071 §7). AC-1 wiring (a
// test-built `ctx`, `SwapSheet` mocked so its props and `onApply`/`onClose` are under direct
// control), AC-3 focus and a11y. Each test title starts with "T-0478 AC-n" (ticket Test rules).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@workoutlab/shared";
import type { Collection } from "dexie";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import {
  LIST_PLAN,
  axeViolations,
  logged,
  makeCtx,
  settle,
  withItem,
  type SpiedCtx,
} from "./list-helpers.js";

interface SwapPropsCall {
  workout: Workout;
  itemIndex: number;
  timeZone: string | undefined;
}
const swapProps = vi.hoisted(() => ({
  calls: [] as SwapPropsCall[],
  // The `Workout` an "Apply" click hands to `onApply`; set per test.
  result: undefined as Workout | undefined,
  // T-0580: what the stub reports as the "Don't suggest again" outcome.
  exclusionFailed: false,
}));
vi.mock("../../UF-05/index.js", () => ({
  SwapSheet: (props: {
    workout: Workout;
    itemIndex: number;
    timeZone?: string;
    onApply: (result: Workout, outcome: { exclusionFailed: boolean }) => void | Promise<void>;
    onClose: () => void;
  }) => {
    swapProps.calls.push({
      workout: props.workout,
      itemIndex: props.itemIndex,
      timeZone: props.timeZone,
    });
    return (
      <div role="dialog" aria-label="Replace exercise" data-screen-id="UF-05.1">
        <button
          type="button"
          onClick={() => {
            // A rejected `onApply` (T-0421's own contract) is the sheet's to catch and show a
            // notice for; this stub only needs to not leave an unhandled rejection in the test.
            Promise.resolve(
              props.onApply(swapProps.result!, { exclusionFailed: swapProps.exclusionFailed }),
            ).catch(() => undefined);
          }}
        >
          Use replacement
        </button>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  },
}));

let warmedBeforeTests = false;

/** T-0932: the first `ListView` mount in a fresh worker pays for cold module and IndexedDB paths
 *  (about 4x a warm mount: 190-260 ms against 40-60 ms here, and over the 1000 ms `findBy` cap in
 *  one loaded gate run). `beforeAll` pays that once, with its own generous hook timeout, so no test
 *  does. A warm-up, not a longer `findBy`. */
async function warmListView(stallMs = 0): Promise<void> {
  signIn();
  const db = freshDb();
  if (stallMs > 0) stallFirstLibraryRead(db, stallMs);
  await seedLibraryAndTargets(db, L1);
  render(<ListView ctx={makeCtx()} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ }, { timeout: 30_000 });
  cleanup();
  warmedBeforeTests = true;
}

beforeAll(async () => {
  // `SwapSheet` is a lazy `import("../UF-05/index.js")`: resolve it here, too (T-0922's warm-up).
  await Promise.all([import("../../UF-05/index.js"), warmListView()]);
  signOut();
}, 60_000);

/** The first library read of this mount takes `ms` of real time (a cold read), once. */
function stallFirstLibraryRead(db: OfflineDb, ms: number): void {
  const table = db.libraryCache;
  const where = table.where.bind(table) as (...a: unknown[]) => Collection;
  let stalled = false;
  vi.spyOn(table, "where").mockImplementation(((...a: unknown[]) => {
    const collection = where(...a);
    return new Proxy(collection, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key !== "toArray") return typeof value === "function" ? value.bind(target) : value;
        return async () => {
          if (!stalled) {
            stalled = true;
            await waitReal(ms);
          }
          return target.toArray();
        };
      },
    });
  }) as never);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  signIn();
  swapProps.calls.length = 0;
  swapProps.result = undefined;
  swapProps.exclusionFailed = false;
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

/** T-0932: makes the `swapping` focus effect run "late" on demand. Every `.focus()` on the Swap
 *  button is deferred by `ms` of real time, so the dialog is already gone when the test reads
 *  `document.activeElement`: the ordering a loaded machine produced by chance (the dialog's DOM
 *  removal and the passive effect that focuses the button are two different steps). */
function deferSwapFocus(ms: number): void {
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, ...a) {
    if (this.getAttribute("aria-label") !== "Swap Back squat") return focus.apply(this, a);
    setTimeout(() => focus.apply(this, a), ms);
  });
}

async function mount(ctx: SpiedCtx = makeCtx(), stallMs = 0) {
  const db = freshDb();
  if (stallMs > 0) stallFirstLibraryRead(db, stallMs);
  await seedLibraryAndTargets(db, L1);
  const view = render(<ListView ctx={ctx} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return { ctx, view };
}

/** A `Workout` the mocked sheet's "Use replacement" hands to `onApply`: `ctx.plan` with item 0
 *  replaced by hip-thrust (T-0478's own fixture candidate, the real `rankSwaps`/`applySwap`
 *  output for this ticket's `PLAN`, see the AC-2 host test). */
function swapResult(ctx: SpiedCtx): Workout {
  const items = ctx.plan.items.map((it, i) =>
    i === 0
      ? {
          ...it,
          exerciseId: "hip-thrust",
          prefill: { weightKg: null, reps: 6, durationS: null, kind: "first_time" as const },
        }
      : it,
  );
  return {
    ...ctx.workout,
    plan: { ...ctx.plan, items, mainLiftId: "hip-thrust" },
  };
}

describe("T-0932 AC2 a cold first mount", () => {
  it("T-0932 AC2: the ListView mount and the SwapSheet import are warmed before the first test", () => {
    expect(warmedBeforeTests).toBe(true);
  });

  it("T-0932 AC2: a first library read stalled 1.2 s outlasts the 1 s find (the cold-mount failure)", async () => {
    await expect(mount(makeCtx(), 1200)).rejects.toThrow(/Romanian deadlift/);
  });

  it("T-0932 AC2: the same stall is paid inside the warm-up, so the test's own mount finds the card", async () => {
    await warmListView(1200);
    await mount();
    expect(screen.getByRole("button", { name: "Swap Back squat" })).toBeTruthy();
  });
});

describe("T-0478 AC-1 Swap from the list", () => {
  it("opens SwapSheet with workout reference-equal to ctx.workout, itemIndex 0, ctx.timeZone", async () => {
    const ctx = makeCtx({ timeZone: "America/New_York" });
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    // `SwapSheet` is `React.lazy` (T-0478, so a static import of this sheet never forces
    // `UF-05/index.js` to resolve just from `UF-03/index.js`'s barrel, D-0071 §3): the dialog
    // appears only once the lazy import resolves.
    await screen.findByRole("dialog", { name: "Replace exercise" });
    const call = swapProps.calls.at(-1)!;
    expect(call.workout).toBe(ctx.workout);
    expect(call.itemIndex).toBe(0);
    expect(call.timeZone).toBe("America/New_York");
  });

  it("the other cards have no Swap button", async () => {
    await mount();
    expect(screen.queryAllByRole("button", { name: /^Swap /i })).toHaveLength(1);
  });

  it("Apply calls ctx.replaceItem(0, item, mainLiftId) exactly once, returns its promise, no other plan write", async () => {
    const ctx = makeCtx();
    swapProps.result = swapResult(ctx);
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    // Waits for the sheet to actually close (the `onApply` wrapper's whole `async` body, every
    // `await` included, has run), not just for the first of a possible extra call — a `waitFor`
    // on the call count alone can observe it transiently at 1 and return before a second call.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ctx.replaceItem).toHaveBeenCalledTimes(1);
    expect(ctx.replaceItem).toHaveBeenCalledWith(0, swapResult(ctx).plan.items[0], "hip-thrust");
  });

  it("T-0580: a failed exclusion write shows the alert on the card once the sheet has closed", async () => {
    const ctx = makeCtx();
    swapProps.result = swapResult(ctx);
    swapProps.exclusionFailed = true;
    await mount(ctx);
    const region = () => document.querySelector<HTMLElement>('[data-part="exclusion-failed"]');
    expect(region()).toHaveAttribute("aria-live", "assertive");
    expect(region()).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(region()!).getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    // Opening the sheet again clears it.
    fireEvent.click(screen.getByRole("button", { name: /^Swap / }));
    await screen.findByRole("dialog", { name: "Replace exercise" });
    expect(region()).toBeEmptyDOMElement();
  });

  it("the pair: no failed exclusion leaves the alert empty", async () => {
    const ctx = makeCtx();
    swapProps.result = swapResult(ctx);
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector('[data-part="exclusion-failed"]')).toBeEmptyDOMElement();
  });

  it("CONTRAST: the T-0417 AC-4 scan finds no upsertSession import in ListView.tsx", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "../ListView.tsx"), "utf8");
    expect(source).not.toMatch(/\bupsertSession\b/);
  });

  it("Cancel (onClose) returns to UF-03.1 with no replaceItem call", async () => {
    const ctx = makeCtx();
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    await screen.findByRole("dialog", { name: "Replace exercise" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-screen-id="UF-03.1"]')).not.toBeNull();
    expect(ctx.replaceItem).not.toHaveBeenCalled();
  });

  it("rejection: the sheet stays open and the card still shows back-squat", async () => {
    const ctx = makeCtx({
      replaceItem: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    swapProps.result = swapResult(ctx);
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(ctx.replaceItem).toHaveBeenCalledTimes(1));
    await settle();
    // A rejected write never closes the sheet (D-0071 §4): the dialog is still there and the
    // card underneath (hidden while `swapping`, D-0142 §3) is still back-squat's.
    expect(screen.getByRole("dialog", { name: "Replace exercise" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Back squat" })).toBeTruthy();
  });

  it("during a rest: the bar stays visible throughout, and ListView never calls skipRest/adjustRest", async () => {
    // `RestBar` is rendered at the top of `ListView`, unconditionally on `ctx.rest` (D-0142 §3):
    // opening or closing the swap sheet never touches it. This unit test can only prove ListView
    // itself doesn't call the host's rest-mutating methods; the bar's clock surviving a real
    // Cancel, through a real running rest, is list-view.swap.host.test.tsx's own "during a rest"
    // test (a mocked `ctx.rest` object here is never written back to by anything, mocked or real,
    // so asserting its identity/value proves nothing about the real interaction).
    const ctx = makeCtx({ rest: { remainingS: 90 } });
    await mount(ctx);
    expect(screen.getByRole("button", { name: /^Rest,/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    await screen.findByRole("dialog", { name: "Replace exercise" });
    expect(screen.getByRole("button", { name: /^Rest,/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.getByRole("button", { name: /^Rest,/ })).toBeTruthy();
    expect(ctx.skipRest).not.toHaveBeenCalled();
    expect(ctx.adjustRest).not.toHaveBeenCalled();
  });
});

describe("T-0478 AC-3 focus and a11y", () => {
  it("after Cancel, focus returns to the Swap button named 'Swap Back squat'", async () => {
    const ctx = makeCtx();
    await mount(ctx);
    const swapButton = screen.getByRole("button", { name: "Swap Back squat" });
    fireEvent.click(swapButton);
    await screen.findByRole("dialog", { name: "Replace exercise" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })),
    );
  });

  it("after a resolved Apply, focus returns to the (still addressable) Swap button", async () => {
    // This test-built `ctx.plan` is frozen (unlike the real host, which re-renders with the
    // written plan), so the button's name here stays "Swap Back squat"; the real rename to
    // "Swap Hip thrust" after a resolved Apply is T-0478 AC-3's host test
    // (list-view.swap.host.test.tsx), through the real SessionHost.
    const ctx = makeCtx();
    swapProps.result = swapResult(ctx);
    const { view } = await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.container.querySelector('[data-screen-id="UF-03.1"]')).not.toBeNull();
    // T-0932: the dialog's removal and the `swapping` effect's `focus()` are two steps; wait on the focus.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })),
    );
  });

  // T-0932 AC2: the focus effect forced to run after the dialog is gone (no CPU load needed).
  // Under load a real run produced this order by chance (3 of 200 Apply runs, 135-230 ms late).
  it("T-0932 AC2: after Cancel with a late focus effect, the dialog is gone first and focus still arrives", async () => {
    await mount(makeCtx());
    deferSwapFocus(150);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    await screen.findByRole("dialog", { name: "Replace exercise" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Swap Back squat" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })),
    );
  });

  it("T-0932 AC2: after Apply with a late focus effect, the dialog is gone first and focus still arrives", async () => {
    const ctx = makeCtx();
    swapProps.result = swapResult(ctx);
    await mount(ctx);
    deferSwapFocus(150);
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Swap Back squat" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Swap Back squat" })),
    );
  });

  it("CONTRAST: opening the sheet (no Cancel, no Apply) never moves focus to the Swap button", async () => {
    // Proves the assertions above are about the close path specifically (the `wasSwapping` edge
    // in `Card`, T-0478 AC-3), not some unconditional "Swap always ends up focused" default.
    const ctx = makeCtx();
    await mount(ctx);
    const swapButton = screen.getByRole<HTMLButtonElement>("button", { name: "Swap Back squat" });
    swapButton.blur();
    fireEvent.click(swapButton);
    await screen.findByRole("dialog", { name: "Replace exercise" });
    expect(document.activeElement).not.toBe(swapButton);
  });

  it("axe finds 0 violations on UF-03.1 with the Swap button showing", async () => {
    await mount();
    const violations = await axeViolations();
    expect(violations).toEqual([]);
  });
});

describe("T-0478 AC-2 rows after a swap (unit side)", () => {
  it("a row logged under back-squat, with the card now showing hip-thrust, keeps its values and a tag", async () => {
    // `ctx.plan` as it reads right after a swap (`item.exerciseId` is the new exercise); the two
    // logged sets carry their own, older `exerciseId` — exactly what `ctx.replaceItem` leaves
    // behind (it never rewrites a `loggedSets` entry, only `plan.items[index]`).
    const ctx = makeCtx({
      plan: withItem(LIST_PLAN, 0, { exerciseId: "hip-thrust" }),
      loggedSets: [logged(0, 0, "back-squat", 6, 100), logged(0, 1, "back-squat", 6, 100)],
    });
    await mount(ctx);
    const row1 = document.querySelector('[data-set-index="0"]')!;
    const row2 = document.querySelector('[data-set-index="1"]')!;
    expect(row1.querySelector('[data-part="tag"]')).toHaveTextContent("Back squat");
    expect(row2.querySelector('[data-part="tag"]')).toHaveTextContent("Back squat");
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 weight in kg" }).value,
    ).toBe("100");
  });

  it("CONTRAST: a row logged under the card's own current exerciseId shows no tag", async () => {
    const ctx = makeCtx({
      loggedSets: [logged(0, 0, "back-squat", 6, 100), logged(0, 1, "back-squat", 6, 100)],
    });
    await mount(ctx);
    const row1 = document.querySelector('[data-set-index="0"]')!;
    const row2 = document.querySelector('[data-set-index="1"]')!;
    expect(row1.querySelector('[data-part="tag"]')).toBeNull();
    expect(row2.querySelector('[data-part="tag"]')).toBeNull();
  });
});
