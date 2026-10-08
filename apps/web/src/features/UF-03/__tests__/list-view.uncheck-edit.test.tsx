// T-0464 UF-03.1: an uncheck tapped while a done row's edit is saving runs once the edit settles.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import { freshDb, seedLibraryAndTargets, signIn, signOut, waitReal } from "./helpers.js";
import { logged, makeCtx as baseCtx, settle, type SpiedCtx } from "./list-helpers.js";
import type { RenderResult } from "@testing-library/react";

const makeCtx = (over: Parameters<typeof baseCtx>[0] = {}) =>
  baseCtx(over) as SpiedCtx & { view: RenderResult };

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

const row = { ...logged(0, 0, "back-squat", 8, 60), clientId: "c-row" };

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mount(over: Parameters<typeof makeCtx>[0] = {}) {
  const ctx = makeCtx({ loggedSets: [row], ...over });
  const db = freshDb();
  await seedLibraryAndTargets(db, L1);
  const view = render(<ListView ctx={ctx} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  ctx.view = view;
  return ctx;
}

const box = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
const kg = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Set 1 weight in kg" });

/** Types 62.5, then clicks the checkbox; the blur fires `editSet`, which stays pending. */
async function typeAndClick(clicks = 1) {
  const field = kg();
  field.focus();
  fireEvent.change(field, { target: { value: "62.5" } });
  const check = box("Mark set 1 not done");
  fireEvent.blur(field);
  for (let i = 0; i < clicks; i += 1) fireEvent.click(check);
  await settle();
  return check;
}

describe("T-0464", () => {
  it("AC-1 an uncheck during a pending edit runs once, after the edit, and the row ends unchecked", async () => {
    const edit = deferred();
    const ctx = await mount({ editSet: vi.fn(() => edit.promise) });
    const del = vi.fn(async () => {
      expect(ctx.editSet).toHaveBeenCalledTimes(1);
    });
    ctx.deleteSet = del;
    await typeAndClick();
    expect(ctx.editSet).toHaveBeenCalledWith("c-row", { weightKg: 62.5 });
    expect(del).not.toHaveBeenCalled();
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("c-row");
  });

  it("AC-1b the row ends unchecked once the store drops the set", async () => {
    const edit = deferred();
    const ctx = await mount({ editSet: vi.fn(() => edit.promise) });
    await typeAndClick();
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(ctx.deleteSet).toHaveBeenCalledTimes(1);
    ctx.view.rerender(<ListView ctx={{ ...ctx, loggedSets: [] }} />);
    expect(box("Mark set 1 done").checked).toBe(false);
    expect(box("Mark set 1 done").getAttribute("aria-busy")).toBeNull();
  });

  it("AC-2 the edit fails: deleteSet still runs exactly once", async () => {
    const edit = deferred();
    const ctx = await mount({ editSet: vi.fn(() => edit.promise) });
    await typeAndClick();
    expect(ctx.deleteSet).not.toHaveBeenCalled();
    await act(async () => {
      edit.reject(new Error("offline"));
      await waitReal(20);
    });
    expect(ctx.deleteSet).toHaveBeenCalledTimes(1);
    expect(ctx.deleteSet).toHaveBeenCalledWith("c-row");
    ctx.view.rerender(<ListView ctx={{ ...ctx, loggedSets: [] }} />);
    expect(box("Mark set 1 done").checked).toBe(false);
  });

  it("replay guard: the row was removed meanwhile, so the remembered toggle does nothing", async () => {
    const edit = deferred();
    const ctx = await mount({ editSet: vi.fn(() => edit.promise) });
    await typeAndClick();
    ctx.view.rerender(<ListView ctx={{ ...ctx, loggedSets: [] }} />);
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(ctx.deleteSet).not.toHaveBeenCalled();
    expect(ctx.recordSet).not.toHaveBeenCalled();
  });

  it("keepRow: an above-plan row unchecked mid-edit keeps the edited 62.5 kg", async () => {
    const four = [0, 1, 2, 3].map((s) => logged(0, s, "back-squat", 6, 100));
    const row5 = { ...logged(0, 4, "back-squat", 5, 60), clientId: "c-5" };
    const edit = deferred();
    const ctx = await mount({ loggedSets: [...four, row5], editSet: vi.fn(() => edit.promise) });
    const field5 = screen.getByRole<HTMLInputElement>("textbox", { name: "Set 5 weight in kg" });
    field5.focus();
    fireEvent.change(field5, { target: { value: "62.5" } });
    fireEvent.blur(field5);
    fireEvent.click(box("Mark set 5 not done"));
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(ctx.deleteSet).toHaveBeenCalledWith("c-5");
    ctx.view.rerender(<ListView ctx={{ ...ctx, loggedSets: four }} />);
    expect(box("Mark set 5 done").checked).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Set 5 weight in kg" }).value,
    ).toBe("62.5");
  });

  it("AC-3 tap, tap: nothing is deleted and the row stays checked", async () => {
    const edit = deferred();
    const ctx = await mount({ editSet: vi.fn(() => edit.promise) });
    await typeAndClick(2);
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(ctx.deleteSet).not.toHaveBeenCalled();
    expect(box("Mark set 1 not done").checked).toBe(true);
    expect(box("Mark set 1 not done").getAttribute("aria-busy")).toBeNull();
  });

  it("AC-4 a toggle during a toggle is still dropped", async () => {
    const rec = deferred();
    const ctx = await mount({
      loggedSets: [],
      recordSet: vi.fn(() => rec.promise.then(() => ({}))),
    });
    const check = box("Mark set 1 done");
    fireEvent.click(check);
    fireEvent.click(check);
    await settle();
    await act(async () => {
      rec.resolve();
      await waitReal(20);
    });
    expect(ctx.recordSet).toHaveBeenCalledTimes(1);
    expect(ctx.deleteSet).not.toHaveBeenCalled();
  });

  it("AC-5 aria-busy holds from the click until deleteSet settles", async () => {
    const edit = deferred();
    const del = deferred();
    const ctx = await mount({
      editSet: vi.fn(() => edit.promise),
      deleteSet: vi.fn(() => del.promise),
    });
    const check = await typeAndClick();
    expect(check.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      edit.resolve();
      await waitReal(20);
    });
    expect(ctx.deleteSet).toHaveBeenCalledTimes(1);
    expect(box("Mark set 1 not done").getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      del.resolve();
      await waitReal(20);
    });
    expect(box("Mark set 1 not done").getAttribute("aria-busy")).toBeNull();
  });

  it("AC-6 no edit typed: deleteSet is called at once", async () => {
    const ctx = await mount();
    fireEvent.click(box("Mark set 1 not done"));
    expect(ctx.deleteSet).toHaveBeenCalledTimes(1);
    expect(ctx.deleteSet).toHaveBeenCalledWith("c-row");
    expect(ctx.editSet).not.toHaveBeenCalled();
  });
});
