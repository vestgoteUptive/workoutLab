// T-0634 AC4-AC9 (UF-09.3 plate line, D-0217).
import { fireEvent } from "@testing-library/react";
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { BENCH, ROW, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import { advance, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import {
  doneSet,
  findCue,
  findScreen,
  loadText,
  press,
  seedFocus,
  typeWeight,
} from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const libSpy = vi.mocked(offline.loadLibrary);

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  libSpy.mockReset();
  libSpy.mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const at = (kg: number | null, extra: Partial<typeof BENCH> = {}) =>
  planWith({
    warmup: [],
    items: [{ ...BENCH, ...extra, prefill: { ...BENCH.prefill, weightKg: kg } }, ROW],
  });

async function show(plan: SessionPlan, patch: Parameters<typeof seedFocus>[1] = {}) {
  await seedSession({ plan });
  seedFocus(NOW, { phase: "set", ...patch }, plan);
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.3");
}

const line = () => document.querySelector('[data-part="plates"]');

describe("AC4 the line sits between the load and the cue", () => {
  it("100 kg: 'Each side 25 + 15 kg' directly after the load line, before the cue", async () => {
    await show(at(100));
    const cue = await findCue();
    const el = line()!;
    expect(el).toHaveTextContent(/^Each side 25 \+ 15 kg$/);
    expect(el.previousElementSibling).toBe(document.querySelector(".wl-uf09__load"));
    expect(el.nextElementSibling).toBe(cue);
  });
});

describe("AC5 bar only and none", () => {
  it("20 kg reads 'Bar only' with no 'Each side'", async () => {
    await show(at(20));
    expect(line()).toHaveTextContent(/^Bar only$/);
    expect(document.body.textContent).not.toContain("Each side");
  });
  it("101 kg has no line and the load and cue stay", async () => {
    await show(at(101));
    expect(line()).toBeNull();
    expect(loadText()).toContain("101");
    expect(await findCue()).toBeInTheDocument();
  });
});

describe("AC6 not a barbell lift", () => {
  const variant = (patch: Partial<LibraryExercise>) => {
    libSpy.mockImplementation(async () =>
      L2.map((e) => (e.id === "bench-press" ? { ...e, ...patch } : e)),
    );
  };
  it("a dumbbell lift", async () => {
    variant({ equipment: ["dumbbell", "bench"] });
    await show(at(100));
    expect(line()).toBeNull();
  });
  it("a bodyweight lift", async () => {
    variant({ externalLoad: false });
    await show(at(100));
    expect(line()).toBeNull();
  });
  it("a timed hold", async () => {
    variant({ timed: true });
    await show(at(100));
    expect(line()).toBeNull();
  });
  it("a barbell lift with a null weight", async () => {
    await show(at(null));
    expect(document.body.textContent).toContain("Set weight");
    expect(line()).toBeNull();
  });
});

describe("AC7 the line follows the weight", () => {
  it("set 1 saved at 105 kg: set 2 shows 25 + 15 + 2.5", async () => {
    await show(at(100));
    await doneSet();
    typeWeight("105");
    press("Save · start rest");
    await findScreen("UF-09.5");
    await advance(120_000);
    expect(screenId()).toBe("UF-09.3");
    expect(line()).toHaveTextContent(/^Each side 25 \+ 15 \+ 2\.5 kg$/);
  });
  it("a back-off set at 85 kg shows 25 + 5 + 2.5", async () => {
    const plan = at(100, { backoff: { weightKg: 85, reps: 6 } });
    await show(plan, { setIndex: 4 });
    expect(line()).toHaveTextContent(/^Each side 25 \+ 5 \+ 2\.5 kg$/);
  });
});

describe("AC8 the cached bar and plates", () => {
  it("bar 15 and plates 20, 10: 75 kg shows 'Each side 20 + 10 kg'", async () => {
    await offline.offlineDb().profileCache.put({
      userId: USER_A,
      profile: {} as never,
      barbell: { barKg: 15, platesKg: [20, 10] },
    });
    await show(at(75));
    expect(line()).toHaveTextContent(/^Each side 20 \+ 10 kg$/);
  });
});

describe("AC9 and AC11 only UF-09.3, and not a control", () => {
  it("UF-09.4 has no plate line", async () => {
    await show(at(100));
    await doneSet();
    expect(screenId()).toBe("UF-09.4");
    expect(line()).toBeNull();
  });
  it("the line is not focusable and not a live region", async () => {
    await show(at(100));
    const el = line() as HTMLElement;
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.closest("[aria-live],[role=status],[role=alert]")).toBeNull();
    expect(el.querySelector("a,button,input,[tabindex]")).toBeNull();
    fireEvent.click(el);
    expect(screenId()).toBe("UF-09.3");
  });
});
