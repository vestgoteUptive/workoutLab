// T-0304a AC-7 (principle 1, D-0111 §9 §10): the chrome is a pause button, a 1 + N progress bar
// and an index; one button per placeholder state; nothing leads out of the workout.
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusState, type Phase } from "../machine.js";
import { P1, S1, STARTED_AT_MS, USER_A, behindStartedAt, planWith } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  renderLoaded,
  screenId,
  screenIds,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);

const NOW = STARTED_AT_MS + 15 * 60_000;
const KEY = `wl-focus:${S1}`;
// T-0304c (D-0119 §1): `timed` has its position + hold timer, shown as a `role="timer"`.
const TIMED_PHASES: Phase[] = ["getReady", "warmup", "rest", "next", "timed"];
/** T-0304a AC-7's "exactly 1 button" per placeholder state, updated (not dropped) as each
 *  child builds a view (D-0118 §12). T-0304b: `set` is Pause + Done set; `confirm` (barbell-row,
 *  a loaded lift) is Pause, 2 reps steppers, 2 weight steppers and Save. T-0304f: `getReady`
 *  (P1, with a warm-up) is Pause, Start now and Skip warm-up; `rest` is Pause, −15 s, +15 s and
 *  Skip rest; `next` (the module's empty seams) is Pause and I'm ready. T-0304c: `warmup` is
 *  Pause, Restart and Next move; `timed` is Pause and Pause timer. T-0304d: `timeCheck` (P1
 *  60 s behind at item 1) is Pause, Continue, Trim and Skip next. */
const BUTTONS: Partial<Record<Phase, string[]>> = {
  getReady: ["Pause workout", "Start now", "Skip warm-up"],
  rest: ["Pause workout", "−15 s", "+15 s", "Skip rest"],
  next: ["Pause workout", "I'm ready"],
  warmup: ["Pause workout", "Restart", "Next move"],
  timed: ["Pause workout", "Pause timer"],
  set: ["Pause workout", "Done set"],
  confirm: ["Pause workout", "Fewer reps", "More reps", "Less weight", "More weight", "Save"],
  timeCheck: ["Pause workout", "Continue", "Trim", "Skip next"],
};
const NON_PAUSED: Phase[] = [
  "getReady",
  "warmup",
  "set",
  "confirm",
  "rest",
  "next",
  "timed",
  "timeCheck",
];

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function seeded(phase: Phase, patch: Partial<FocusState> = {}): FocusState {
  return {
    ...initialFocusState(S1, P1, NOW),
    phase,
    timer:
      TIMED_PHASES.includes(phase) || phase === "paused"
        ? { startedAtMs: NOW, durationS: 40, pausedMs: 0 }
        : null,
    itemIndex: phase === "timed" ? 3 : phase === "getReady" || phase === "warmup" ? 0 : 1,
    pausedAtMs: phase === "paused" ? NOW : null,
    resumePhase: phase === "paused" ? "rest" : null,
    ...patch,
  };
}

async function show(state: FocusState, plan = P1) {
  // T-0304d (D-0120 §4): a restored time check re-runs rule 8, so its session is behind.
  await seedSession(
    state.phase === "timeCheck" ? { plan, started_at: behindStartedAt(NOW) } : { plan },
  );
  window.localStorage.setItem(KEY, JSON.stringify(state));
  return renderLoaded();
}

function segments(): string[] {
  return Array.from(document.querySelectorAll(".wl-uf09__segment")).map((s) =>
    s.getAttribute("data-state")!,
  );
}

function expectNoWayOut(): void {
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(document.querySelector('[data-component="C-01"]')).toBeNull();
  expect(document.querySelectorAll("a[href]")).toHaveLength(0);
  expect(screenIds()).toHaveLength(1);
}

describe("AC-7 chrome on every machine state except paused", () => {
  it.each(NON_PAUSED)(
    "%s: Pause workout, 1 + N aria-hidden segments, an index, the exact buttons",
    async (phase) => {
      await show(seeded(phase));
      const host = document.querySelector<HTMLElement>("[data-screen-id]")!;
      expect(host.getAttribute("data-screen-id")).toMatch(/^UF-09\.[1-8]$/);
      const buttons = within(host).getAllByRole("button");
      const names = BUTTONS[phase] ?? ["Pause workout"];
      expect(buttons).toHaveLength(names.length);
      expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(names);
      expect(buttons[0]).toHaveAccessibleName("Pause workout");
      const bar = document.querySelector(".wl-uf09__progress")!;
      expect(bar).toHaveAttribute("aria-hidden", "true");
      expect(segments()).toHaveLength(1 + P1.items.length);
      expect(segments()).toHaveLength(5);
      expect(document.querySelector(".wl-uf09__index")!.textContent).not.toBe("");
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      // A timer only for the phases that have one.
      if (TIMED_PHASES.includes(phase)) expect(screen.getByRole("timer")).toBeInTheDocument();
      else expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expectNoWayOut();
    },
  );

  it("getReady without a warm-up: exactly 2 buttons (Pause workout, Start now)", async () => {
    await show(seeded("getReady"), planWith({ warmup: [] }));
    expect(screenId()).toBe("UF-09.1");
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Pause workout",
      "Start now",
    ]);
    expectNoWayOut();
  });

  // T-0304d (D-0118 §12): the built UF-09.9 is Resume, Skip to next exercise and End workout.
  it("paused: exactly 3 buttons (Resume, Skip to next exercise, End workout) and no chrome", async () => {
    await show(seeded("paused"));
    expect(screenId()).toBe("UF-09.9");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Resume",
      "Skip to next exercise",
      "End workout",
    ]);
    expect(buttons[0]).toHaveAccessibleName("Resume");
    expect(document.querySelector(".wl-uf09__chrome")).toBeNull();
    expect(document.querySelector(".wl-uf09__progress")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause workout" })).not.toBeInTheDocument();
    expectNoWayOut();
  });
});

describe("T-0304d AC-6 the paused button pin with Skip hidden", () => {
  it("paused on the last item: exactly 2 buttons (Resume, End workout)", async () => {
    await show(seeded("paused", { itemIndex: 3 }));
    expect(screenId()).toBe("UF-09.9");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Resume",
      "End workout",
    ]);
    expectNoWayOut();
  });
});

describe("AC-7 the index and the segments", () => {
  it.each(["getReady", "warmup"] as Phase[])(
    "reads 'Warm-up' in %s; the warm-up segment is current",
    async (phase) => {
      await show(seeded(phase));
      expect(document.querySelector(".wl-uf09__index")).toHaveTextContent(/^Warm-up$/);
      expect(segments()).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    },
  );

  it("reads '1 / 4' on bench-press", async () => {
    await show(seeded("set", { itemIndex: 0 }));
    expect(document.querySelector(".wl-uf09__index")).toHaveTextContent(/^1 \/ 4$/);
    expect(segments()).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("on barbell-row: segment 0 done, 1 done, 2 current, the rest upcoming", async () => {
    await show(seeded("set", { itemIndex: 1 }));
    expect(document.querySelector(".wl-uf09__index")).toHaveTextContent(/^2 \/ 4$/);
    expect(segments()).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
  });

  it("with an empty plan.warmup the warm-up segment is still drawn, and done", async () => {
    const plan = planWith({ warmup: [] });
    await show(seeded("getReady"), plan);
    expect(segments()).toEqual(["done", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
});

describe("AC-7 host-level states have only the link to /", () => {
  it("not on this device: one a[href='/'] and no button", async () => {
    await seedSession();
    await renderLoaded({ path: "/session/nope" });
    expect(screenId()).toBe("UF-09");
    const links = document.querySelectorAll("a[href]");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("AC-7 Pause and Resume", () => {
  it("Pause workout in rest shows UF-09.9; after 60 s, Resume shows UF-09.5 with the same remaining time", async () => {
    await show(
      seeded("rest", { itemIndex: 0, timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 } }),
    );
    await advance(20_000);
    expect(screenId()).toBe("UF-09.5");
    const atPause = timerText();
    expect(atPause).toBe("1:40");
    screen.getByRole("button", { name: "Pause workout" }).click();
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    await advance(60_000);
    expect(screenId()).toBe("UF-09.9");
    screen.getByRole("button", { name: "Resume" }).click();
    await flushReal();
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe(atPause);
    // The pair: the timer runs again after Resume.
    await advance(10_000);
    expect(timerText()).toBe("1:30");
  });
});
