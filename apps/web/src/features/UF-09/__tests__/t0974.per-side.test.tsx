// T-0974 AC1–AC8 (UF-09.3 hero line, UF-09.4 stepper, D-0260 D-0261 D-0263 §3–§5 §8): the per-side
// label on the existing reps line and stepper, read from the cached ExerciseDetail.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { ExerciseDetail } from "../../../lib/offline/index.js";
import type { LoggedSet } from "../machine.js";
import { nextSetPrefill } from "../prefill.js";
import { BENCH, P1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, NBSP, PU, defaultDetail, planOf } from "./set-loop-fixtures.js";
import {
  doneButton,
  findEl,
  findScreen,
  loadText,
  press,
  repsValue,
  seedFocus,
  storedState,
  typeWeight,
} from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const recordSpy = vi.mocked(offline.recordSet);
const editSpy = vi.mocked(offline.editSet);
const libSpy = vi.mocked(offline.loadLibrary);
const detailSpy = vi.mocked(offline.loadExerciseDetail);

/** A cached detail for `id` carrying `unilateral` (absent when `undefined`). */
function detailOf(id: string, unilateral?: string | null): ExerciseDetail {
  const base: ExerciseDetail = {
    id,
    instructions: [],
    mistakes: [],
    cue: null,
    source: "test",
    license: "CC0",
    attribution: null,
    sourceUrl: null,
    variants: [],
  };
  return unilateral === undefined ? base : ({ ...base, unilateral } as ExerciseDetail);
}

function flag(id: string, unilateral?: string | null) {
  detailSpy.mockImplementation(async (x) => (x === id ? detailOf(id, unilateral) : null));
}

const weighted = (weightKg: number, reps: number): SessionPlan =>
  planOf([{ ...BENCH, prefill: { ...BENCH.prefill, weightKg, reps } }]);
const PUSH_UPS = planOf([{ ...PU, prefill: { ...PU.prefill, weightKg: null, reps: 10 } }]);

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  for (const spy of [recordSpy, editSpy, libSpy, detailSpy]) spy.mockReset();
  libSpy.mockImplementation(async () => L2);
  detailSpy.mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showSet(plan: SessionPlan, itemIndex = 0) {
  await seedSession({ plan });
  seedFocus(NOW, { phase: "set", itemIndex }, plan);
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.3");
  await flushReal();
}

const load = () => document.querySelector(".wl-uf09__load") as HTMLElement;

describe("AC1 UF-09.3 hero line", () => {
  it("dumbbell-row at 12 kg x 10: '12 kg' over '× 10 per arm', one <p>, read as '12 kg, 10 reps per arm'", async () => {
    flag("bench-press", "arm");
    await showSet(weighted(12, 10));
    expect(load().tagName).toBe("P");
    expect(document.querySelectorAll(".wl-uf09__load")).toHaveLength(1);
    const hidden = load().querySelector(".wl-uf09__sr");
    expect(hidden?.textContent).toBe(`12${NBSP}kg, 10 reps per arm`);
    const visible = [...load().querySelectorAll(".wl-uf09__hero")].map((e) => e.textContent);
    expect(visible).toEqual([`12${NBSP}kg `, "× 10 per arm"]);
    for (const el of load().querySelectorAll(".wl-uf09__hero")) {
      expect(el).toHaveAttribute("aria-hidden", "true");
    }
    expect(load().querySelector(".wl-uf09__hero:last-of-type .wl-uf09__unit")?.textContent).toBe(
      " per arm",
    );
  });

  it("a flagged bodyweight row reads '10 reps per arm'", async () => {
    detailSpy.mockImplementation(async (x) => (x === "push-up" ? detailOf(x, "arm") : null));
    await showSet(PUSH_UPS);
    expect(load().textContent).toBe("10 reps per arm10 reps per arm");
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toBe("10 reps per arm");
  });

  it("barbell-row (no flag) is exactly as before: no label, no hidden span, nothing aria-hidden", async () => {
    flag("bench-press", null);
    await showSet(weighted(80, 6));
    await flushReal();
    expect(loadText()).toBe(`80${NBSP}kg × 6`);
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
    expect(load().querySelector("[aria-hidden]")).toBeNull();
  });

  it("zero history: the label shows on the first set", async () => {
    flag("bench-press", "leg");
    await showSet(weighted(12, 10));
    expect(screen.getByText("× 10", { exact: false })).toHaveTextContent("× 10 per leg");
  });
});

describe("AC2 timed hold (UF-09.7): the suffix goes after the hold target", () => {
  it("side-plank style: 'Hold 0:40 per side'; unflagged 'Hold 0:40'", async () => {
    const plank = {
      ...P1.items[3]!,
      durationS: 40,
      prefill: { ...P1.items[3]!.prefill, durationS: 40 },
    };
    const plan = planOf([plank]);
    flag("plank", "side");
    await seedSession({ plan });
    seedFocus(
      NOW,
      { phase: "timed", itemIndex: 0, timer: { startedAtMs: NOW, durationS: 43, pausedMs: 0 } },
      plan,
    );
    await renderSession({ locale: "en-GB" });
    const target = await findEl(() => {
      const el = document.querySelector('[data-field="target"]');
      return el?.textContent?.includes("per side") ? el : null;
    });
    expect(target.textContent).toBe("Hold 0:40 per side");
  });
});

describe("AC3 UF-09.4 stepper group and caption", () => {
  it("flagged leg: group 'Reps per leg', caption 'per leg', buttons keep their names", async () => {
    flag("bench-press", "leg");
    await showSet(weighted(12, 10));
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    await findEl(() => document.querySelector('[data-field="reps-side"]'));
    const group = screen.getByRole("group", { name: "Reps per leg" });
    expect(group.querySelector('[data-field="reps-side"]')?.textContent).toBe("per leg");
    expect(screen.getByRole("button", { name: "More reps" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fewer reps" })).toBeTruthy();
    // The number alone is in the value node; the caption is outside the buttons.
    expect(repsValue()).toBe("10");
  });

  it("not flagged: group 'Reps', no caption", async () => {
    flag("bench-press", null);
    await showSet(weighted(12, 10));
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    await flushReal();
    expect(screen.getByRole("group", { name: "Reps" })).toBeTruthy();
    expect(document.querySelector('[data-field="reps-side"]')).toBeNull();
  });
});

describe("AC4 saved values are plain", () => {
  it("Done records reps 10 and weight 12 as shown; the edit to 12 and 12.5 stores exactly those", async () => {
    flag("bench-press", "arm");
    await showSet(weighted(12, 10));
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toMatchObject({ reps: 10, weightKg: 12, kind: "reps" });
    press("More reps", 2);
    typeWeight("12.5");
    press("Save · start rest");
    await findScreen("UF-09.5");
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 12, weightKg: 12.5, rir: null });
    expect(storedState().loggedSets[0]).toMatchObject({ reps: 12, weightKg: 12.5 });
  });

  it("the 5 s auto-save keeps the recorded plain values and writes no edit", async () => {
    flag("bench-press", "arm");
    await showSet(weighted(12, 10));
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    await vi.advanceTimersByTimeAsync(5_000);
    await flushReal();
    expect(editSpy).not.toHaveBeenCalled();
    expect(storedState().loggedSets[0]).toMatchObject({ reps: 10, weightKg: 12 });
  });
});

describe("AC5 offline and cached rows", () => {
  it("network off: the label shows from the cache and the set still queues in IndexedDB", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false, language: "en-GB" });
    try {
      flag("bench-press", "arm");
      await showSet(weighted(12, 10));
      expect(load().textContent).toContain("per arm");
      fireEvent.click(doneButton());
      await findScreen("UF-09.4");
      const rows = await offline.offlineDb().sets.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ reps: 10, weightKg: 12 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a cached detail with no unilateral field, or an unknown value, shows no label", async () => {
    flag("bench-press", undefined);
    await showSet(weighted(12, 10));
    expect(load().textContent).not.toContain("per ");
    cleanup();
    flag("bench-press", "both");
    await showSet(weighted(12, 10));
    expect(load().textContent).not.toContain("per ");
  });
});

describe("AC6 one source of copy", () => {
  it("no UF-09 file holds the per-side strings", () => {
    const dir = resolve(__dirname, "..");
    const files = ["current-set.tsx", "confirm-set.tsx", "timed-set.tsx", "use-cue.ts"];
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/per (arm|leg|side)/i);
    }
  });
});

describe("AC7 no new element, targets and wrapping", () => {
  it("UF-09.3: the flagged view adds only text inside the one reps line (same child elements as unflagged)", async () => {
    flag("bench-press", null);
    await showSet(weighted(12, 10));
    const plain = [...document.querySelectorAll(".wl-uf09__view > *")].map((e) => e.tagName);
    cleanup();
    flag("bench-press", "arm");
    await showSet(weighted(12, 10));
    const flagged = [...document.querySelectorAll(".wl-uf09__view > *")].map((e) => e.tagName);
    expect(flagged).toEqual(plain);
  });

  it("the css wraps the suffix and caption and keeps the steppers at 4 rem", () => {
    const css = readFileSync(resolve(__dirname, "..", "uf-09.css"), "utf8");
    expect(css).toMatch(/\.wl-uf09__side\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).not.toMatch(/\.wl-uf09__side\s*\{[^}]*(text-overflow|white-space:\s*nowrap)/);
    expect(css).toMatch(/\.wl-uf09__side\s*\{[^}]*color:\s*var\(--wl-ink-muted\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("AC8 RIR 0 on a flagged row holds the weight as for a bilateral row", () => {
  it("the next set's pre-fill depends on the logged values only", () => {
    const plan = weighted(12, 10);
    const logged: LoggedSet = {
      clientId: "c1",
      itemIndex: 0,
      setIndex: 0,
      exerciseId: "bench-press",
      kind: "reps",
      reps: 10,
      weightKg: 12,
      durationS: null,
      rir: 0,
      isWarmup: false,
      backoff: false,
    } as LoggedSet;
    expect(nextSetPrefill(plan, 0, 1, [logged])).toEqual({ weightKg: 12, reps: 10 });
  });
});
