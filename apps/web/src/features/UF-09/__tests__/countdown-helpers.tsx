// T-0304f test helpers: seeding a rest or a set-up countdown after logged sets, reading the
// announcer and the ring, and the texts a MutationObserver saw (so a frame that the next
// transition replaces within the same act can still be asserted).
import { act, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import type { FocusState, LoggedSet } from "../machine.js";
import { P1 } from "./fixtures.js";
import { seedFocus } from "./set-loop-helpers.js";

/** Sets 0…n−1 of item `itemIndex`, as saved (`weightKg` 80 unless given). */
export function loggedSets(
  itemIndex: number,
  n: number,
  plan: SessionPlan = P1,
  patch: Partial<LoggedSet> = {},
): LoggedSet[] {
  return Array.from({ length: n }, (_, setIndex) => ({
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: plan.items[itemIndex]!.exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: setIndex >= plan.items[itemIndex]!.sets,
    ...patch,
  }));
}

/** A rest of `durationS` started at `startedAtMs`, after set `setIndex` of `itemIndex`. */
export function seedRest(
  startedAtMs: number,
  opts: {
    itemIndex?: number;
    setIndex?: number;
    durationS?: number;
    plan?: SessionPlan;
    logged?: LoggedSet[];
  } = {},
): void {
  const plan = opts.plan ?? P1;
  const itemIndex = opts.itemIndex ?? 0;
  const setIndex = opts.setIndex ?? 0;
  const state: Partial<FocusState> = {
    phase: "rest",
    itemIndex,
    setIndex,
    timer: { startedAtMs, durationS: opts.durationS ?? 120, pausedMs: 0 },
    loggedSets: opts.logged ?? loggedSets(itemIndex, setIndex + 1, plan),
  };
  seedFocus(startedAtMs, state, plan);
}

export const announcer = () => document.querySelectorAll('[data-field="announcer"]');
export const announced = () => announcer()[0]?.textContent ?? null;
export const ring = () => document.querySelector('[data-field="ring"]');
export const nextText = () =>
  Array.from(document.querySelectorAll('[data-field="next"] p')).map((p) => p.textContent);

/** Clicks `name` `times` times inside one act (the store takes each dispatch at once). */
export function pressInOneAct(name: string, times: number): void {
  const button = screen.getByRole("button", { name });
  act(() => {
    for (let i = 0; i < times; i += 1) fireEvent.click(button);
  });
}

/** Every text a MutationObserver saw land in the DOM while `run` ran. */
export function textsSeenDuring(run: () => void): string[] {
  const observer = new MutationObserver(() => undefined);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  run();
  const out: string[] = [];
  for (const record of observer.takeRecords()) {
    if (record.type === "characterData") out.push((record.target as Text).data);
    for (const node of Array.from(record.addedNodes)) {
      if (node.nodeType === Node.TEXT_NODE) out.push((node as Text).data);
      else if (node instanceof Element) {
        for (const el of [node, ...Array.from(node.querySelectorAll("*"))]) {
          if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
            out.push(el.textContent ?? "");
          }
        }
      }
    }
  }
  observer.disconnect();
  return out;
}
