// T-0417 UF-03.1 List view logging, unit side (D-0142 §3, D-0015): a test-built `ctx` with
// deferred, spied `recordSet`/`editSet`/`deleteSet`. AC-1 check, AC-2 edit, AC-3 uncheck, AC-5 the
// weight field and zero history, AC-8 a11y. Negative asserts wait >= 50 ms.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import { LIST_PLAN, axeViolations, logged, makeCtx, settle, withItem } from "./list-helpers.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  signIn();
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

const PLANK: LibraryExercise = {
  id: "plank",
  name: "Plank",
  kind: "exercise",
  type: "isolation",
  level: "beginner",
  equipment: [],
  areas: { core: 1 },
  timed: true,
  defaultDurationS: 45,
  incrementKg: 0,
  externalLoad: false,
};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mount(ctx = makeCtx(), locale?: string, library: LibraryExercise[] = L1) {
  const db = freshDb();
  await seedLibraryAndTargets(db, library);
  render(<ListView ctx={ctx} locale={locale} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return ctx;
}

const toggle = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

const FIRST = {
  sessionId: "S1",
  exerciseId: "back-squat",
  setIndex: 0,
  kind: "reps",
  reps: 6,
  weightKg: 100,
  durationS: null,
  rir: null,
  isWarmup: false,
  backoff: false,
  itemIndex: 0,
  source: "list",
};

describe("AC-1 check = recordSet", () => {
  it("offline: one call with the full input", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const ctx = await mount();
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledTimes(1);
    expect(ctx.recordSet).toHaveBeenCalledWith(FIRST);
  });

  it("pending: unchecked and busy, a second click makes no second call; resolved: checked", async () => {
    const d = deferred<unknown>();
    const ctx = makeCtx();
    ctx.recordSet.mockReturnValue(d.promise);
    await mount(ctx);
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(toggle("Mark set 1 done").getAttribute("aria-busy")).toBe("true");
    expect(toggle("Mark set 1 done").checked).toBe(false);
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledTimes(1);
    d.resolve({});
    await settle();
    expect(toggle("Mark set 1 done").getAttribute("aria-busy")).toBeNull();
  });

  it("the row shows as done only once ctx.loggedSets has it (after resolve)", async () => {
    const ctx = makeCtx();
    const db = freshDb();
    await seedLibraryAndTargets(db, L1);
    const view = render(<ListView ctx={ctx} />);
    await screen.findByRole("button", { name: /Romanian deadlift/ });
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(toggle("Mark set 1 done").checked).toBe(false);
    view.rerender(<ListView ctx={{ ...ctx, loggedSets: [logged(0, 0, "back-squat", 6, 100)] }} />);
    expect(toggle("Mark set 1 not done").checked).toBe(true);
  });

  it("rejection: unchecked, polite text, no alert", async () => {
    const ctx = makeCtx();
    ctx.recordSet.mockRejectedValue(new Error("x"));
    await mount(ctx);
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(toggle("Mark set 1 done").checked).toBe(false);
    expect(screen.getByText("Couldn't save. Tap again.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(toggle("Mark set 1 done").getAttribute("aria-busy")).toBeNull();
  });

  it("a timed row sends kind timed, durationS from the field, no reps or weight", async () => {
    const timedItem = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    const plan = { ...LIST_PLAN, items: [timedItem, ...LIST_PLAN.items.slice(1)] };
    const ctx = await mount(makeCtx({ plan }), undefined, [...L1, PLANK]);
    type("Set 1 seconds", "50");
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({
        exerciseId: "plank",
        kind: "timed",
        durationS: 50,
        reps: null,
        weightKg: null,
      }),
    );
  });

  it("the back-off row sends setIndex 4, backoff true, 90 x 6", async () => {
    const plan = withItem(LIST_PLAN, 0, { backoff: { weightKg: 90, reps: 6 } });
    const ctx = await mount(makeCtx({ plan }));
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({ setIndex: 4, backoff: true, weightKg: 90, reps: 6 }),
    );
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenLastCalledWith(expect.objectContaining({ backoff: false }));
  });

  it("typed values: '102,5' under sv-SE sends 102.5", async () => {
    const ctx = await mount(makeCtx(), "sv-SE");
    type("Set 2 weight in kg", "102,5");
    fireEvent.click(toggle("Mark set 2 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({ setIndex: 1, weightKg: 102.5 }),
    );
  });

  it("an untouched kg field records the exact pre-fill (a 3-decimal weight stays)", async () => {
    const plan = withItem(LIST_PLAN, 0, {
      prefill: { weightKg: 82.125, reps: 6, durationS: null, kind: "hold" },
    });
    const ctx = await mount(makeCtx({ plan }));
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 82.125 }));
  });
});

describe("AC-2 edit", () => {
  const doneCtx = () => makeCtx({ loggedSets: [logged(0, 0, "back-squat", 6, 100)] });

  it("blur calls editSet once with the changed value; Enter does the same", async () => {
    const ctx = await mount(doneCtx());
    type("Set 1 reps", "5");
    fireEvent.blur(field("Set 1 reps"));
    await settle();
    expect(ctx.editSet.mock.calls).toEqual([["c-0-0", { reps: 5 }]]);
    cleanup();
    const ctx2 = await mount(doneCtx());
    type("Set 1 reps", "5");
    fireEvent.keyDown(field("Set 1 reps"), { key: "Enter" });
    await settle();
    expect(ctx2.editSet.mock.calls).toEqual([["c-0-0", { reps: 5 }]]);
    fireEvent.blur(field("Set 1 reps"));
    await settle();
    expect(ctx2.editSet).toHaveBeenCalledTimes(1);
  });

  it("per keystroke: no call until blur, then one { weightKg: 10 }", async () => {
    const ctx = await mount(doneCtx());
    type("Set 1 weight in kg", "1");
    type("Set 1 weight in kg", "10");
    await settle();
    expect(ctx.editSet).not.toHaveBeenCalled();
    fireEvent.blur(field("Set 1 weight in kg"));
    await settle();
    expect(ctx.editSet.mock.calls).toEqual([["c-0-0", { weightKg: 10 }]]);
  });

  it("a seconds edit sends { durationS }", async () => {
    const timedItem = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    const plan = { ...LIST_PLAN, items: [timedItem, ...LIST_PLAN.items.slice(1)] };
    const ctx = makeCtx({
      plan,
      loggedSets: [{ ...logged(0, 0, "plank", 0, 0), reps: null, weightKg: null, durationS: 45 }],
    });
    await mount(ctx, undefined, [...L1, PLANK]);
    type("Set 1 seconds", "60");
    fireEvent.blur(field("Set 1 seconds"));
    await settle();
    expect(ctx.editSet.mock.calls).toEqual([["c-0-0", { durationS: 60 }]]);
  });

  it("unchanged value, or retyped to the same, makes no call", async () => {
    const ctx = await mount(doneCtx());
    fireEvent.blur(field("Set 1 reps"));
    type("Set 1 reps", "6");
    fireEvent.blur(field("Set 1 reps"));
    type("Set 1 weight in kg", "100.0");
    fireEvent.blur(field("Set 1 weight in kg"));
    await settle();
    expect(ctx.editSet).not.toHaveBeenCalled();
  });

  it("rejection restores the logged value and says so", async () => {
    const ctx = doneCtx();
    ctx.editSet.mockRejectedValue(new Error("x"));
    await mount(ctx);
    type("Set 1 reps", "5");
    fireEvent.blur(field("Set 1 reps"));
    await settle();
    expect(field("Set 1 reps").value).toBe("6");
    expect(screen.getByText("Couldn't save. Tap again.")).toBeTruthy();
  });

  it("an unlogged row's edit makes no editSet call; the check records the new value", async () => {
    const ctx = await mount();
    type("Set 2 reps", "9");
    fireEvent.blur(field("Set 2 reps"));
    await settle();
    expect(ctx.editSet).not.toHaveBeenCalled();
    fireEvent.click(toggle("Mark set 2 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ setIndex: 1, reps: 9 }));
  });
});

describe("AC-3 uncheck = deleteSet", () => {
  const doneCtx = () => makeCtx({ loggedSets: [logged(0, 0, "back-squat", 6, 100)] });

  it("one call, busy while pending, no second call", async () => {
    const d = deferred();
    const ctx = doneCtx();
    ctx.deleteSet.mockReturnValue(d.promise);
    await mount(ctx);
    fireEvent.click(toggle("Mark set 1 not done"));
    await settle();
    expect(toggle("Mark set 1 not done").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(toggle("Mark set 1 not done"));
    await settle();
    expect(ctx.deleteSet.mock.calls).toEqual([["c-0-0"]]);
    d.resolve();
    await settle();
    expect(toggle("Mark set 1 not done").getAttribute("aria-busy")).toBeNull();
  });

  it("rejection leaves the row checked with the polite text", async () => {
    const ctx = doneCtx();
    ctx.deleteSet.mockRejectedValue(new Error("x"));
    await mount(ctx);
    fireEvent.click(toggle("Mark set 1 not done"));
    await settle();
    expect(toggle("Mark set 1 not done").checked).toBe(true);
    expect(screen.getByText("Couldn't save. Tap again.")).toBeTruthy();
  });
});

describe("AC-5 the weight field and zero history", () => {
  const zero = () =>
    makeCtx({
      plan: withItem(LIST_PLAN, 0, {
        prefill: { weightKg: null, reps: 6, durationS: null, kind: "first_time" },
      }),
    });
  const HINT = "Enter a weight like 82.5";

  it("empty kg: toggle aria-disabled with the hint, a click records nothing; typing 60 clears it", async () => {
    const ctx = await mount(zero());
    expect(field("Set 1 weight in kg").value).toBe("");
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getAllByText(HINT).length).toBeGreaterThan(0);
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).not.toHaveBeenCalled();
    type("Set 1 weight in kg", "60");
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBeNull();
    expect(document.querySelector('[data-set-index="0"] .wl-uf03-list__hint')!.textContent).toBe(
      "",
    );
    expect(field("Set 1 weight in kg").getAttribute("aria-describedby")).toBeNull();
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 60 }));
  });

  it.each(["abc", "-5", "82.555"])("%s disables the toggle with the hint", async (text) => {
    const ctx = await mount();
    type("Set 1 weight in kg", text);
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(HINT)).toBeTruthy();
    expect(field("Set 1 weight in kg").getAttribute("aria-describedby")).toBe(
      screen.getByText(HINT).id,
    );
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).not.toHaveBeenCalled();
  });

  it.each([
    ["82.5", 82.5],
    ["82,5", 82.5],
    ["0", 0],
  ])("%s is valid and records %s", async (text, kg) => {
    const ctx = await mount();
    type("Set 1 weight in kg", text);
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: kg }));
  });

  it("clearing the kg on a loaded lift disables the toggle", async () => {
    await mount();
    type("Set 1 weight in kg", "");
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBe("true");
  });

  it("a bodyweight item has no kg field, is never disabled, records its pre-fill weight", async () => {
    const pushUp = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "push-up",
      prefill: { weightKg: 0, reps: 6, durationS: null, kind: "hold" as const },
    };
    const ctx = makeCtx({ plan: { ...LIST_PLAN, items: [pushUp, ...LIST_PLAN.items.slice(1)] } });
    await mount(ctx);
    expect(screen.queryByRole("textbox", { name: /weight in kg/ })).toBeNull();
    expect(toggle("Mark set 1 done").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 0, reps: 6 }));
  });
});

describe("AC-8 a11y", () => {
  it("0 axe violations with one row pending and one row showing the hint", async () => {
    const ctx = makeCtx({
      plan: withItem(LIST_PLAN, 0, {
        prefill: { weightKg: null, reps: 6, durationS: null, kind: "first_time" },
      }),
    });
    ctx.recordSet.mockReturnValue(new Promise(() => undefined));
    await mount(ctx);
    type("Set 1 weight in kg", "60");
    fireEvent.click(toggle("Mark set 1 done"));
    await settle();
    expect(toggle("Mark set 1 done").getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByText("Enter a weight like 82.5").length).toBeGreaterThan(0);
    expect(await axeViolations()).toEqual([]);
  });
});
