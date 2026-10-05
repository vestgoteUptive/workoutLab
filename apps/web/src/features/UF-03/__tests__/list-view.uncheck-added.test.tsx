// T-0472 UF-03.1: unchecking a logged above-plan row after a reload keeps it (unchecked, same
// values, same DOM node and focus); T-0473 folded in as AC-5 (timed "+ Add set" focus).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import { LIST_PLAN, logged, makeCtx, settle } from "./list-helpers.js";

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

const four = [
  logged(0, 0, "back-squat", 6, 100),
  logged(0, 1, "back-squat", 6, 100),
  logged(0, 2, "back-squat", 5, 100),
  logged(0, 3, "back-squat", 5, 100),
];
const row5 = { ...logged(0, 4, "back-squat", 5, 100), clientId: "c-5" };

async function mount(ctx = makeCtx(), library: LibraryExercise[] = L1) {
  const db = freshDb();
  await seedLibraryAndTargets(db, library);
  const view = render(<ListView ctx={ctx} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return { ctx, view };
}

const toggle = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });

async function uncheckRow5() {
  const { ctx, view } = await mount(makeCtx({ loggedSets: [...four, row5] }));
  const box = toggle("Mark set 5 not done");
  box.focus();
  fireEvent.click(box);
  await settle();
  return { ctx, view, box };
}

describe("T-0472", () => {
  it("T-0472 AC-1 the row stays unchecked, same node, focus kept, values kept", async () => {
    const { ctx, view, box } = await uncheckRow5();
    view.rerender(<ListView ctx={{ ...ctx, loggedSets: four }} />);
    expect(ctx.deleteSet).toHaveBeenCalledTimes(1);
    expect(ctx.deleteSet).toHaveBeenCalledWith("c-5");
    const again = toggle("Mark set 5 done");
    expect(again.checked).toBe(false);
    expect(again).toBe(box);
    expect(document.activeElement).toBe(again);
    expect(field("Set 5 weight in kg").value).toBe("100");
    expect(field("Set 5 reps").value).toBe("5");
  });

  it("T-0472 AC-2 re-check records the same index; a far row keeps its place for the next add", async () => {
    const { ctx, view } = await uncheckRow5();
    view.rerender(<ListView ctx={{ ...ctx, loggedSets: four }} />);
    fireEvent.click(toggle("Mark set 5 done"));
    await settle();
    expect(ctx.recordSet).toHaveBeenCalledTimes(1);
    expect(ctx.recordSet).toHaveBeenCalledWith(
      expect.objectContaining({
        setIndex: 4,
        weightKg: 100,
        reps: 5,
        backoff: false,
        itemIndex: 0,
      }),
    );
    cleanup();
    const far = { ...logged(0, 6, "back-squat", 4, 95), clientId: "c-7" };
    const m = await mount(makeCtx({ loggedSets: [far] }));
    fireEvent.click(toggle("Mark set 7 not done"));
    await settle();
    m.view.rerender(<ListView ctx={{ ...m.ctx, loggedSets: [] }} />);
    expect(toggle("Mark set 7 done").checked).toBe(false);
    expect(field("Set 7 weight in kg").value).toBe("95");
    expect(field("Set 7 reps").value).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "+ Add set" }));
    expect(field("Set 8 reps")).toBeTruthy();
  });

  it("T-0472 AC-4 a failed delete leaves the row checked with the save-failed status", async () => {
    const ctx = makeCtx({ loggedSets: [...four, row5] });
    ctx.deleteSet.mockRejectedValue(new Error("nope"));
    await mount(ctx);
    fireEvent.click(toggle("Mark set 5 not done"));
    await settle();
    const box = toggle("Mark set 5 not done");
    expect(box.checked).toBe(true);
    const status = box.closest("tr")!.querySelector('[data-part="row-status"]')!;
    expect(status.textContent).not.toBe("");
  });

  it("T-0472 AC-5 (T-0473) + Add set on a timed item focuses the seconds field with 45", async () => {
    const timedItem = {
      ...LIST_PLAN.items[0]!,
      exerciseId: "plank",
      repsMin: null,
      repsMax: null,
      durationS: 45,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" as const },
    };
    const plan = { ...LIST_PLAN, items: [timedItem, ...LIST_PLAN.items.slice(1)] };
    await mount(makeCtx({ plan }), [...L1, PLANK]);
    fireEvent.click(screen.getByRole("button", { name: "+ Add set" }));
    expect(document.activeElement).toBe(field("Set 5 seconds"));
    expect(field("Set 5 seconds").value).toBe("45");
  });
});
