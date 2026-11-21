// T-0974 AC7 (UF-09.3, UF-09.4): axe finds no violation on a flagged row. Runs axe-core directly
// (no vitest-axe); color-contrast is off (no layout in jsdom); region is off (the test mounts the view without the app shell).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fireEvent } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { ExerciseDetail } from "../../../lib/offline/index.js";
import { BENCH, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, PU, defaultDetail, planOf } from "./set-loop-fixtures.js";
import { doneButton, findEl, findScreen, seedFocus } from "./set-loop-helpers.js";
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

type Axe = {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
};

async function loadAxe(): Promise<Axe> {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  return mod.default ?? mod;
}

async function violations(): Promise<string[]> {
  vi.useRealTimers(); // axe schedules with setTimeout; the fake clock would stall it
  const axe = await loadAxe();
  const res = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return res.violations.map((v) => v.id);
}

describe("AC7 axe on a flagged row", () => {
  it("UF-09.3 weighted row, flagged: no violations", async () => {
    flag("bench-press", "arm");
    await showSet(weighted(12, 10));
    expect(document.querySelector(".wl-uf09__sr")).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it("UF-09.3 bodyweight row, flagged: no violations", async () => {
    detailSpy.mockImplementation(async (x) => (x === "push-up" ? detailOf(x, "arm") : null));
    await showSet(PUSH_UPS);
    expect(await violations()).toEqual([]);
  });

  it("UF-09.4 flagged stepper group: no violations", async () => {
    flag("bench-press", "leg");
    await showSet(weighted(12, 10));
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    await findEl(() => document.querySelector('[data-field="reps-side"]'));
    expect(await violations()).toEqual([]);
  });
});
