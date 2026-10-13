// T-0603 UF-03.1 List view (lift) and UF-03.2 List view rest (drain): AC1 states and the drain
// value, AC3 the lift error form, AC5 glyphs and the table's semantics, AC6 behaviour unchanged
// for the new markup. Direct `ListView` mounts over fake-indexeddb, as list-view.uncheck-added.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainPercent } from "../../../components/drain/index.js";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import { logged, makeCtx, settle } from "./list-helpers.js";

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

const root = () => document.querySelector<HTMLElement>("[data-screen-id]")!;
const drain = () => root().style.getPropertyValue("--wl-drain");

describe("T-0603 AC1 states", () => {
  it("the List view root is the lift state with no fill", async () => {
    await mount();
    expect(root().getAttribute("data-screen-id")).toBe("UF-03.1");
    expect(root().getAttribute("data-wl-state")).toBe("lift");
    expect(root().classList.contains("wl-drain")).toBe(false);
  });

  it("List view rest is the rest state with --wl-drain = drainPercent(elapsed, total)", async () => {
    const { ctx } = await mount(makeCtx({ rest: { remainingS: 60, totalS: 150 } }));
    fireEvent.click(screen.getByRole("button", { name: /show rest/ }));
    expect(root().getAttribute("data-screen-id")).toBe("UF-03.2");
    expect(root().getAttribute("data-wl-state")).toBe("rest");
    expect(root().classList.contains("wl-drain")).toBe(true);
    expect(drain()).toBe(`${drainPercent(90, 150)}%`);
    expect(drain()).toBe("60%");
    expect(ctx.rest).not.toBeNull();
  });

  it("T-0671: a rest begun 30 s before the view opened starts at 1/3 risen, not 0", async () => {
    await mount(makeCtx({ rest: { remainingS: 60, totalS: 90 } }));
    fireEvent.click(screen.getByRole("button", { name: /show rest/ }));
    expect(drain()).toBe("33.3%");
  });

  it("without a total from the session, the total is the rest as first seen, moved by ±15 s", async () => {
    const ctx = makeCtx({ rest: { remainingS: 90 } });
    const { view } = await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: /show rest/ }));
    expect(drain()).toBe("0%");
    view.rerender(<ListView ctx={{ ...ctx, rest: { remainingS: 60 } }} />);
    expect(drain()).toBe("33.3%");
    // +15 s: the total grows with it, so the fill goes back to what it was before the tap.
    fireEvent.click(screen.getByRole("button", { name: "+15 s" }));
    expect(ctx.adjustRest).toHaveBeenCalledWith(15);
    view.rerender(<ListView ctx={{ ...ctx, rest: { remainingS: 75 } }} />);
    expect(drain()).toBe(`${drainPercent(30, 105)}%`);
    expect(root().getAttribute("data-drain-reset")).toBe("true");
  });

  it("the rest view's line still reads 'Rest · 1:32 left' and its buttons keep their names", async () => {
    await mount(makeCtx({ rest: { remainingS: 92, totalS: 150 } }));
    fireEvent.click(screen.getByRole("button", { name: /show rest/ }));
    expect(document.querySelector('[data-part="rest-clock"]')!.textContent).toBe(
      "Rest · 1:32 left",
    );
    for (const name of ["−15 s", "+15 s", "Skip", "Back to list"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});

describe("T-0603 AC3 the lift error form", () => {
  it("a failed save shows the status with an aria-hidden icon and the existing words", async () => {
    const row5 = { ...logged(0, 4, "back-squat", 5, 100), clientId: "c-5" };
    const ctx = makeCtx({ loggedSets: [row5] });
    ctx.deleteSet.mockRejectedValue(new Error("nope"));
    await mount(ctx);
    const box = screen.getByRole("checkbox", { name: "Mark set 5 not done" });
    fireEvent.click(box);
    await settle();
    const status = box.closest("tr")!.querySelector('[data-part="row-status"]')!;
    expect(status.classList.contains("wl-uf03-list__status")).toBe(true);
    expect(status.textContent).toBe("Couldn't save. Tap again.");
    expect(status.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("with no failure the status is empty (nothing to show)", async () => {
    await mount();
    for (const s of document.querySelectorAll('[data-part="row-status"]')) {
      expect(s.textContent).toBe("");
      expect(s.querySelector("svg")).toBeNull();
    }
  });

  it("the Finish error carries the icon and the words, and nothing before it fails", async () => {
    const ctx = makeCtx();
    ctx.finish.mockRejectedValue(new Error("no"));
    await mount(ctx);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    const confirm = document.querySelector('[data-part="finish-confirm"]')!;
    expect(confirm.querySelector(".wl-uf03-list__status")!.textContent).toBe("");
    fireEvent.click(confirm.querySelector<HTMLButtonElement>(".wl-button--session-outline")!);
    await settle();
    const status = confirm.querySelector(".wl-uf03-list__status")!;
    expect(status.textContent).toBe("Couldn't finish. Try again.");
    expect(status.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("an invalid weight marks the field aria-invalid and shows its hint with the icon", async () => {
    await mount();
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 weight in kg" });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(field, { target: { value: "abc" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const hint = document.getElementById(field.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toBe("Enter a weight like 82.5");
    expect(hint.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("T-0603 AC5/AC6 markup", () => {
  it("the glyphs are aria-hidden and the names are unchanged", async () => {
    await mount();
    for (const name of ["Focus mode", "Finish", /^Romanian deadlift/, "+ Add set", "How to"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    for (const svg of document.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
    expect(document.querySelectorAll(".wl-uf03-list__done svg").length).toBeGreaterThan(0);
  });

  it("the table keeps its semantics, and its inputs, Done boxes and text buttons use the shared classes", async () => {
    await mount();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Set",
      "Previous",
      "kg",
      "Reps",
      "Done",
    ]);
    for (const input of document.querySelectorAll('[data-part="set-row"] input[type="text"]')) {
      expect(input.classList.contains("wl-input")).toBe(true);
    }
    for (const row of document.querySelectorAll('[data-part="set-row"]')) {
      expect(row.classList.contains("wl-row")).toBe(true);
      expect(row.querySelector("label.wl-uf03-list__done > input[type=checkbox]")).not.toBeNull();
    }
    for (const name of ["Focus mode", "How to", "+ Add set"]) {
      expect(screen.getByRole("button", { name }).classList.contains("wl-button--text")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Finish" }).className).toContain(
      "wl-button--session-outline",
    );
    expect(
      screen.getByRole("button", { name: /^Romanian deadlift/ }).classList.contains("wl-row"),
    ).toBe(true);
  });

  it("the rest bar is a full-width session outline with its name and text unchanged", async () => {
    await mount(makeCtx({ rest: { remainingS: 92, totalS: 150 } }));
    const bar = screen.getByRole("button", { name: "Rest, 1:32 left, show rest" });
    expect(bar.className).toContain("wl-button--session-outline");
    expect(bar.textContent).toBe("Rest · 1:32 left");
  });
});

describe("T-0603 rework: live regions and table shape", () => {
  it("every live region is in the accessibility tree while empty (no hidden ancestor)", async () => {
    await mount();
    const live = document.querySelectorAll('[data-set-index] [aria-live="polite"]');
    // Per row: the weight hint, the count hint and the save status.
    expect(live.length).toBe(4 * 3);
    for (const el of live) {
      expect(el.textContent).toBe("");
      expect(el.closest("[hidden], [aria-hidden='true']")).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    const status = document.querySelector('[data-part="finish-confirm"] [aria-live="polite"]')!;
    expect(status.textContent).toBe("");
    expect(status.closest("[hidden], [aria-hidden='true']")).toBeNull();
  });

  it("every set row has as many cells as the table has column headers", async () => {
    const plan = makeCtx().plan;
    await mount(makeCtx({ plan, loggedSets: [logged(0, 0, "back-squat", 6, 100)] }));
    const heads = screen.getAllByRole("columnheader").length;
    const rows = document.querySelectorAll('[data-part="set-row"]');
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows)
      expect(row.querySelectorAll(":scope > th, :scope > td").length).toBe(heads);
    // An invalid entry and a swap tag add messages, not cells.
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Set 2 weight in kg" });
    fireEvent.change(field, { target: { value: "abc" } });
    for (const row of document.querySelectorAll('[data-part="set-row"]')) {
      expect(row.querySelectorAll(":scope > th, :scope > td").length).toBe(heads);
    }
  });

  it("the row header's name is 'Set n' plus the swap tag text when swapped", async () => {
    await mount();
    expect(screen.getAllByRole("rowheader")[0]!.textContent).toBe("1");
    cleanup();
    const swapped = { ...logged(0, 0, "bench-press", 6, 60), clientId: "c-old" };
    await mount(makeCtx({ loggedSets: [swapped] }));
    const th = document.querySelector('[data-set-index="0"] th')!;
    expect(th.querySelector('[data-part="tag"]')).not.toBeNull();
    expect(th.textContent).toMatch(/^1.+/);
    expect(screen.getAllByRole("rowheader")[0]).toBe(th);
  });
});
