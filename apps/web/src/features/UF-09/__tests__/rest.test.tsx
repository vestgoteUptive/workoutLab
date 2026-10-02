// T-0304f AC-3 (UF-09.5 Rest, parent AC-B7, D-0066 §7, D-0118 §7 §10): the rest starts by
// itself at the engine's constants, −15 s / +15 s / Skip rest, the warn state at ≤ 10 s, "GO"
// at 0, and the "Next" line from `nextSetPrefill`, through the real views, hook and store.
import { render, screen } from "@testing-library/react";
import { REST_COMPOUND_S, REST_ISOLATION_S } from "@workoutlab/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { Rest } from "../rest.js";
import { FocusSessionContext, type FocusSession } from "../session.js";
import { remainingS } from "../timer.js";
import { BENCH, CURL, L1, P1, ROW, S1, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { KEY, L2, NBSP, defaultDetail } from "./set-loop-fixtures.js";
import {
  doneSet,
  findScreen,
  press,
  seedFocus,
  setLineText,
  storedState,
} from "./set-loop-helpers.js";
import {
  loggedSets,
  nextText,
  pressInOneAct,
  ring,
  seedRest,
  textsSeenDuring,
} from "./countdown-helpers.js";
import { countOf, dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showRest(opts: Parameters<typeof seedRest>[1] = {}) {
  await seedSession({ plan: opts.plan ?? P1 });
  seedRest(NOW, opts);
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.5");
}

describe("AC-3 lengths come from the engine (D-0066 §7)", () => {
  it("after saving a bench-press set the rest starts by itself at REST_COMPOUND_S (120)", async () => {
    expect(REST_COMPOUND_S).toBe(120);
    await seedSession();
    seedFocus(NOW, { phase: "set" });
    await renderSession({ locale: "en-GB" });
    await doneSet();
    await advance(5000); // the untouched auto-save
    expect(screenId()).toBe("UF-09.5");
    expect(storedState().timer).toMatchObject({ durationS: REST_COMPOUND_S });
    expect(timerText()).toBe("2:00");
  });

  it("the pair: after a leg-curl set it is REST_ISOLATION_S (60)", async () => {
    expect(REST_ISOLATION_S).toBe(60);
    await seedSession();
    seedFocus(NOW, { phase: "set", itemIndex: 2 });
    await renderSession({ locale: "en-GB" });
    await doneSet();
    press("Save");
    await findScreen("UF-09.5");
    expect(storedState().timer).toMatchObject({ durationS: REST_ISOLATION_S });
    expect(timerText()).toBe("1:00");
  });
});

describe("AC-3 adjust", () => {
  it("−15 s ×9 from 120 reads 0:00 (floored, never below), then moves on", async () => {
    await showRest();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const seen = textsSeenDuring(() => pressInOneAct("−15 s", 9));
    await flushReal();
    expect(countOf("REST_ADJUST")).toBe(9);
    const rests = setItem.mock.calls
      .filter(([k]) => k === KEY)
      .map(([, v]) => JSON.parse(v) as FocusState)
      .filter((s) => s.phase === "rest");
    // Eight steps reach 0; the ninth is floored at 0 (the same state, so no write).
    expect(rests.map((s) => remainingS(s.timer!, NOW))).toEqual([105, 90, 75, 60, 45, 30, 15, 0]);
    expect(seen).toContain("0:00");
    expect(seen).toContain("GO");
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("REST_END")).toBe(1);
    expect(setLineText()).toBe("Set 2 of 4");
  });

  it("+15 s from 120 reads 2:15, with no cap", async () => {
    await showRest();
    press("+15 s");
    await flushReal();
    expect(timerText()).toBe("2:15");
    press("+15 s", 10);
    await flushReal();
    expect(timerText()).toBe("4:45");
    expect(screenId()).toBe("UF-09.5");
  });

  it("the pair: −15 s from 120 reads 1:45 and stays on the rest", async () => {
    await showRest();
    press("−15 s");
    await flushReal();
    expect(timerText()).toBe("1:45");
    expect(screenId()).toBe("UF-09.5");
  });
});

describe("AC-3 skip", () => {
  it("Skip rest moves to the next set at once", async () => {
    await showRest();
    press("Skip rest");
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(setLineText()).toBe("Set 2 of 4");
    expect(countOf("REST_END")).toBe(1);
  });
});

describe("AC-3 warn at 10 s", () => {
  it("at remainingS 11 the ring has data-warn=false; at 10 it is true", async () => {
    await showRest();
    expect(ring()).toHaveAttribute("data-warn", "false");
    await advance(109_000);
    expect(timerText()).toBe("0:11");
    expect(ring()).toHaveAttribute("data-warn", "false");
    await advance(1000);
    expect(timerText()).toBe("0:10");
    expect(ring()).toHaveAttribute("data-warn", "true");
  });
});

describe("AC-3 GO at 0", () => {
  const session = {
    adjustRest: vi.fn(),
    skipRest: vi.fn(),
  } as unknown as FocusSession;

  function renderRest(nowMs: number) {
    const state: FocusState = {
      ...initialFocusState(S1, P1, NOW),
      phase: "rest",
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      loggedSets: loggedSets(0, 1),
    };
    return render(
      <FocusSessionContext.Provider value={session}>
        <Rest
          state={state}
          ctx={{ plan: P1, library: L1 }}
          locale="en-GB"
          nowMs={nowMs}
          seams={[]}
          send={() => undefined}
          onResume={() => undefined}
          onCancelAutosave={() => undefined}
          onSaved={() => undefined}
        />
      </FocusSessionContext.Provider>,
    );
  }

  it("with remainingS 0 the label reads GO", () => {
    renderRest(NOW + 120_000);
    expect(timerText()).toBe("0:00");
    expect(document.querySelector('[data-field="go"]')).toHaveTextContent(/^GO$/);
    expect(ring()).toHaveAttribute("data-warn", "true");
  });

  it("the pair: with remainingS 1 there is no GO", () => {
    renderRest(NOW + 119_000);
    expect(timerText()).toBe("0:01");
    expect(document.querySelector('[data-field="go"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/GO/);
  });
});

describe("AC-3 the Next line (D-0118 §7)", () => {
  it("after bench-press set 1 (80 × 6): 'Next · set 2 of 4' and '80 kg × 6'", async () => {
    await showRest();
    expect(nextText()).toEqual(["Next · set 2 of 4", `80${NBSP}kg × 6`]);
  });

  it("after a set saved as 77.5 × 5, the next set pre-fills it", async () => {
    await showRest({ logged: loggedSets(0, 1, P1, { weightKg: 77.5, reps: 5 }) });
    expect(nextText()).toEqual(["Next · set 2 of 4", `77.5${NBSP}kg × 5`]);
  });

  it("after bench-press set 4: 'Next · Barbell row'", async () => {
    await showRest({ setIndex: 3 });
    expect(nextText()).toEqual(["Next · Barbell row"]);
  });

  it("before the back-off set: 'Next · back-off set' and '70 kg × 6'", async () => {
    const plan = planWith({ items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ROW] });
    await showRest({ plan, setIndex: 3 });
    expect(nextText()).toEqual(["Next · back-off set", `70${NBSP}kg × 6`]);
  });

  it("before leg-curl set 2 with a null weight: 'Set weight'", async () => {
    await showRest({
      itemIndex: 2,
      durationS: 60,
      logged: loggedSets(2, 1, P1, { weightKg: null, reps: 10 }),
    });
    expect(nextText()).toEqual(["Next · set 2 of 3", "Set weight", "10 reps"]);
    expect(document.querySelector('[data-field="next"]')!.textContent).not.toMatch(/kg/);
  });

  it("the pair: before leg-curl set 2 after a set saved at 40 kg, the kg line", async () => {
    await showRest({
      itemIndex: 2,
      durationS: 60,
      logged: loggedSets(2, 1, P1, { weightKg: 40, reps: 10 }),
    });
    expect(nextText()).toEqual(["Next · set 2 of 3", `40${NBSP}kg × 10`]);
    expect(CURL.prefill.weightKg).toBeNull();
  });
});

describe("AC-3 focus", () => {
  it("focus lands on Skip rest", async () => {
    await showRest();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Skip rest" }));
  });
});

describe("AC-3 reload (T-0304a AC-4 with the real view)", () => {
  it("a rest restored 90 s in shows 0:30", async () => {
    await seedSession();
    seedRest(NOW - 90_000);
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe("0:30");
  });
});
