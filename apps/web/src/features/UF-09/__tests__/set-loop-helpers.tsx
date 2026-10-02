// T-0304b test helpers: the fixtures this ticket adds (PU, plans), seeding a focus state, the
// UF-09.3/.4 controls, and a positive wait on real macrotasks for the next screen (D-0103 §1:
// RTL's `findBy` would drive the fake clock, so this polls with the real `setTimeout`).
import { fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { expect } from "vitest";
import { initialFocusState, type FocusState } from "../machine.js";
import { P1, S1 } from "./fixtures.js";
import { KEY } from "./set-loop-fixtures.js";
import { flushReal, screenIds } from "./helpers.js";
import { currentLocation } from "./session-helpers.js";

/** Writes a focus state for `S1` at `phase`, timer `null` unless given. */
export function seedFocus(nowMs: number, state: Partial<FocusState>, plan: SessionPlan = P1) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, plan, nowMs), timer: null, ...state }),
  );
}

/** Polls on real macrotasks until `id` is the screen on the page (a positive wait). */
export async function findScreen(id: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (screenIds().includes(id)) return;
    await flushReal(10);
  }
  expect(screenIds()).toEqual([id]);
}

/** Polls on real macrotasks until `find()` returns an element (a positive wait on lazy content). */
export async function findEl(find: () => Element | null, tries = 60): Promise<Element> {
  for (let i = 0; i < tries; i += 1) {
    const el = find();
    if (el) return el;
    await flushReal(10);
  }
  const el = find();
  expect(el).not.toBeNull();
  return el!;
}

/** The cue element, once the cached detail has been read. */
export const findCue = () => findEl(() => document.querySelector('[data-field="cue"]'));

/** Polls on real macrotasks until the location is `pathname`. */
export async function findPath(pathname: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (currentLocation.pathname === pathname) return;
    await flushReal(10);
  }
  expect(currentLocation.pathname).toBe(pathname);
}

export const doneButton = () => screen.getByRole("button", { name: "Done set" });
export const saveButton = () => screen.getByRole("button", { name: "Save" });
export const weightInput = () =>
  screen.getByRole<HTMLInputElement>("textbox", { name: "Weight (kg)" });
export const repsValue = () => document.querySelector('[data-field="reps"]')?.textContent ?? null;
export const autosaveText = () =>
  document.querySelector('[data-field="autosave"]')?.textContent ?? null;
export const loadText = () => document.querySelector(".wl-uf09__load")?.textContent ?? null;
export const setLineText = () => document.querySelector(".wl-uf09__set-line")?.textContent ?? null;

/** Clicks a control and lets IndexedDB settle. */
export async function tap(el: HTMLElement): Promise<void> {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
  await flushReal();
}

/** Done set, then UF-09.4. */
export async function doneSet(): Promise<void> {
  fireEvent.click(doneButton());
  await findScreen("UF-09.4");
}

/** Types into the weight field (a touch first, as a real tap would be). */
export function typeWeight(text: string): void {
  const input = weightInput();
  fireEvent.pointerDown(input);
  fireEvent.change(input, { target: { value: text } });
}

export function press(name: string, times = 1): void {
  const button = screen.getByRole("button", { name });
  for (let i = 0; i < times; i += 1) {
    fireEvent.pointerDown(button);
    fireEvent.click(button);
  }
}

export function storedState(): FocusState {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) throw new Error("no stored focus state");
  return JSON.parse(raw) as FocusState;
}
