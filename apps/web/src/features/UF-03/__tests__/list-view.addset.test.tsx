// T-0457 UF-03.1 "+ Add set" (D-0142 §3), unit side: a test-built `ctx` with spied writes.
// AC-1 the row, AC-2 logging it, AC-3 the index rule, AC-5 zero history, AC-6 a11y.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

async function mount(ctx = makeCtx()) {
  const db = freshDb();
  await seedLibraryAndTargets(db, L1);
  const view = render(<ListView ctx={ctx} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return { ctx, view };
}

const toggle = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const add = () => fireEvent.click(screen.getByRole("button", { name: "+ Add set" }));

const four = [
  logged(0, 0, "back-squat", 6, 100),
  logged(0, 1, "back-squat", 6, 100),
  logged(0, 2, "back-squat", 5, 100),
  logged(0, 3, "back-squat", 5, 100),
];
const BACKOFF = { backoff: { weightKg: 90, reps: 6 } };

describe("AC-1 the added row", () => {
  it("row 5 is unchecked with the last row's values and its labels", async () => {
    await mount(makeCtx({ loggedSets: four }));
    expect(screen.queryByRole("checkbox", { name: "Mark set 5 done" })).toBeNull();
    add();
    expect(toggle("Mark set 5 done").checked).toBe(false);
    expect(field("Set 5 weight in kg").value).toBe("100");
    expect(field("Set 5 reps").value).toBe("5");
  });
});

describe("AC-2 logging it", () => {
  it("offline: check calls recordSet once; uncheck calls deleteSet with the clientId", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { ctx, view } = await mount(makeCtx({ loggedSets: four }));
    add();
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledTimes(1);
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({
        setIndex: 4,
        backoff: false,
        weightKg: 100,
        reps: 5,
        itemIndex: 0,
        source: "list",
      }),
    );
    const row5 = { ...logged(0, 4, "back-squat", 5, 100), clientId: "c-new" };
    view.rerender(<ListView ctx={{ ...ctx, loggedSets: [...four, row5] }} />);
    fireEvent.click(toggle("Mark set 5 not done"));
    await settle();
    expect(ctx.deleteSet).toHaveBeenCalledWith("c-new");
  });
});

describe("AC-3 the index rule", () => {
  it("with a back-off the added row is 5 and copies the back-off values", async () => {
    const ctx = makeCtx({ plan: withItem(LIST_PLAN, 0, BACKOFF) });
    await mount(ctx);
    add();
    expect(field("Set 6 weight in kg").value).toBe("90");
    expect(field("Set 6 reps").value).toBe("6");
    fireEvent.click(toggle("Mark set 6 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({ setIndex: 5, backoff: false, weightKg: 90, reps: 6 }),
    );
  });

  it("twice gives indexes 4 and 5", async () => {
    const ctx = await mount().then((m) => m.ctx);
    add();
    add();
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    fireEvent.click(toggle("Mark set 6 done"));
    await settle();
    const idx = ctx.recordSet.mock.calls.map((c) => c[0].setIndex);
    expect(idx).toEqual([4, 5]);
  });

  it("a logged set above the plan shows as a done row and the next add is 7", async () => {
    const ctx = makeCtx({ loggedSets: [logged(0, 6, "back-squat", 4, 95)] });
    await mount(ctx);
    expect(toggle("Mark set 7 not done").checked).toBe(true);
    expect(field("Set 7 weight in kg").value).toBe("95");
    add();
    expect(field("Set 8 reps").value).toBe("4");
    fireEvent.click(toggle("Mark set 8 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ setIndex: 7 }));
  });

  it("before the planned rows are done: index 4 with row 4's pre-fill", async () => {
    const ctx = await mount().then((m) => m.ctx);
    add();
    expect(field("Set 5 weight in kg").value).toBe("100");
    expect(field("Set 5 reps").value).toBe("6");
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledWith(expect.objectContaining({ setIndex: 4 }));
  });
});

describe("AC-5 zero history", () => {
  it("an empty kg is copied and the toggle is disabled with the weight hint", async () => {
    const plan = withItem(LIST_PLAN, 0, {
      prefill: { weightKg: null, reps: 6, durationS: null, kind: "hold" },
    });
    const ctx = await mount(makeCtx({ plan })).then((m) => m.ctx);
    add();
    expect(field("Set 5 weight in kg").value).toBe("");
    expect(toggle("Mark set 5 done").getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("Enter a weight like 82.5");
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    expect(ctx.recordSet).not.toHaveBeenCalled();
  });
});

describe("AC-6 a11y", () => {
  it("the button follows the last row's toggle, takes focus to the new kg field, 0 axe violations", async () => {
    await mount(makeCtx({ loggedSets: four }));
    const button = screen.getByRole("button", { name: "+ Add set" });
    const last = toggle("Mark set 4 not done");
    expect(last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    add();
    expect(document.activeElement).toBe(field("Set 5 weight in kg"));
    expect(await axeViolations()).toEqual([]);
  });

  it("a bodyweight item focuses the reps field", async () => {
    const plan = withItem(LIST_PLAN, 0, { exerciseId: "push-up" });
    await mount(makeCtx({ plan }));
    add();
    expect(document.activeElement).toBe(field("Set 5 reps"));
  });
});
