// T-0418 UF-03.2 rest bar and rest view on the host's wall-clock rest (D-0142 §3, D-0172 §3 §5),
// through the real `SessionHost` with the real seams and the real `lib/offline` over
// fake-indexeddb. `Date` is faked; timers stay real so the host's own 1 s re-render, IndexedDB and
// the lazy List-view chunk settle. Each title starts with "T-0418 AC-n" (ticket Test rules).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REST_COMPOUND_S, REST_ISOLATION_S } from "@workoutlab/engine";
import { offlineDb } from "../../../lib/offline/db.js";
import { ListView } from "../index.js";
import { L1, NOW, S1 } from "./fixtures.js";
import {
  freshDb,
  seedLibraryAndTargets,
  seedSession,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import {
  LIST_PLAN,
  axeViolations,
  findEl,
  logged,
  makeCtx,
  pausedState,
  renderHost,
  screenIds,
  settle,
  storedFocus,
  withItem,
  writeFocus,
} from "./list-helpers.js";

/** LIST_PLAN with leg-curl given a prefill weight (otherwise null, D-0066, and its check is
 *  blocked: the list never records a load-bearing lift with no weight, T-0417). */
const PLAN_WITH_CURL_PREFILL = withItem(LIST_PLAN, 2, {
  prefill: { weightKg: 40, reps: 10, durationS: null, kind: "hold" },
});

vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);

const nowMs = Date.parse("2026-09-27T10:00:00.000Z");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  const db = freshDb();
  signIn();
  await seedLibraryAndTargets(db, L1);
  window.localStorage.removeItem(`wl-focus:${S1}`);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

/** Mounts the host paused at `over`'s position (`pausedState`'s own back-squat set 0 logged,
 *  unless `over.loggedSets` replaces it), and opens the List view. */
async function openList(over: Parameters<typeof pausedState>[1] = {}, plan = LIST_PLAN) {
  await seedSession(offlineDb(), { endedAt: null, plan });
  writeFocus(pausedState(nowMs, over));
  renderHost();
  await findEl(() => document.querySelector('[data-screen-id="UF-09.9"]'));
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await screen.findByRole("checkbox", { name: /Mark set 1/ });
}

async function check(name: string, done: string) {
  fireEvent.click(await screen.findByRole("checkbox", { name }));
  await screen.findByRole("checkbox", { name: done });
}

const restBarText = () => document.querySelector('[data-part="rest-bar"]')?.textContent ?? null;

describe("T-0418 AC-1 rest bar (NFR-TIME-1)", () => {
  it("checking back-squat row 2 (a compound) starts the rest at REST_COMPOUND_S, bar reads 2:00", async () => {
    expect(REST_COMPOUND_S).toBe(120);
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    expect(restBarText()).toBe("Rest · 2:00 left");
    expect(storedFocus()).toMatchObject({ phase: "rest" });
  });

  it("the pair: checking leg-curl row 1 (an isolation) starts the rest at REST_ISOLATION_S, 1:00", async () => {
    expect(REST_ISOLATION_S).toBe(60);
    await openList({ itemIndex: 2, setIndex: 0, loggedSets: [] }, PLAN_WITH_CURL_PREFILL);
    await check("Mark set 1 done", "Mark set 1 not done");
    expect(restBarText()).toBe("Rest · 1:00 left");
  });

  it("the wall clock: Date advanced 90 s with no timer tick shows 0:30, same offline", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.setSystemTime(nowMs + 90_000);
    // The host's own real 1 s re-render interval (not a UF-03 timer, AC-1) is what picks this up.
    await settle(1100);
    expect(restBarText()).toBe("Rest · 0:30 left");
  });

  it("expiry: at 0 the bar is gone", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    vi.setSystemTime(nowMs + 120_000);
    await settle(1100);
    expect(document.querySelector('[data-part="rest-bar"]')).toBeNull();
  });

  // The ticket's "Edits" row (spy): a test-built `ctx` with spied `startRest`, unit side.
  it("an edit starts no rest (spy)", async () => {
    const ctx = makeCtx({ loggedSets: [logged(0, 0, "back-squat", 6, 100)] });
    render(<ListView ctx={ctx} />);
    const field = await screen.findByRole<HTMLInputElement>("textbox", { name: "Set 1 reps" });
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.blur(field);
    await settle();
    expect(ctx.startRest).not.toHaveBeenCalled();
  });

  it("the pair: an uncheck starts no rest (spy)", async () => {
    const ctx = makeCtx({ loggedSets: [logged(0, 0, "back-squat", 6, 100)] });
    render(<ListView ctx={ctx} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark set 1 not done" }));
    await settle();
    expect(ctx.startRest).not.toHaveBeenCalled();
  });
});

describe("T-0418 AC-2 no rest after the session's last planned set (D-0142 §3)", () => {
  it("with every set of S1 logged except leg-curl row 3, checking row 3 starts no rest", async () => {
    const loggedSets = [
      ...[0, 1, 2, 3].map((setIndex) => ({
        clientId: `bs-${setIndex}`,
        itemIndex: 0,
        setIndex,
        exerciseId: "back-squat",
        reps: 6,
        weightKg: 100,
        durationS: null,
        rir: null,
        backoff: false,
      })),
      ...[0, 1, 2].map((setIndex) => ({
        clientId: `rdl-${setIndex}`,
        itemIndex: 1,
        setIndex,
        exerciseId: "romanian-deadlift",
        reps: 8,
        weightKg: 80,
        durationS: null,
        rir: null,
        backoff: false,
      })),
      ...[0, 1].map((setIndex) => ({
        clientId: `curl-${setIndex}`,
        itemIndex: 2,
        setIndex,
        exerciseId: "leg-curl",
        reps: 10,
        weightKg: 40,
        durationS: null,
        rir: null,
        backoff: false,
      })),
    ];
    await openList({ itemIndex: 2, setIndex: 2, loggedSets }, PLAN_WITH_CURL_PREFILL);
    await check("Mark set 3 done", "Mark set 3 not done");
    // D-0142 §2: the log itself never moves the machine; T-0418 AC-2 starts no rest either.
    expect(restBarText()).toBeNull();
    expect(storedFocus()).toMatchObject({ phase: "set" });
  });

  it("the pair: with leg-curl rows 2-3 unlogged, checking row 2 starts a rest", async () => {
    const loggedSets = [
      ...[0, 1, 2, 3].map((setIndex) => ({
        clientId: `bs-${setIndex}`,
        itemIndex: 0,
        setIndex,
        exerciseId: "back-squat",
        reps: 6,
        weightKg: 100,
        durationS: null,
        rir: null,
        backoff: false,
      })),
      ...[0, 1, 2].map((setIndex) => ({
        clientId: `rdl-${setIndex}`,
        itemIndex: 1,
        setIndex,
        exerciseId: "romanian-deadlift",
        reps: 8,
        weightKg: 80,
        durationS: null,
        rir: null,
        backoff: false,
      })),
      {
        clientId: "curl-0",
        itemIndex: 2,
        setIndex: 0,
        exerciseId: "leg-curl",
        reps: 10,
        weightKg: 40,
        durationS: null,
        rir: null,
        backoff: false,
      },
    ];
    await openList({ itemIndex: 2, setIndex: 1, loggedSets }, PLAN_WITH_CURL_PREFILL);
    await check("Mark set 2 done", "Mark set 2 not done");
    expect(restBarText()).toBe("Rest · 1:00 left");
  });
});

describe("T-0418 AC-3 rest view (UF-03.2)", () => {
  it("tapping the bar shows exactly one UF-03.2 with the time, −15 s, +15 s, Skip and Back to list", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    fireEvent.click(screen.getByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    expect(screenIds()).toEqual(["UF-03.2"]);
    expect(document.querySelector('[data-part="rest-clock"]')).toHaveTextContent(
      "Rest · 2:00 left",
    );
    expect(screen.getByRole("button", { name: "−15 s" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+15 s" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeTruthy();
  });

  it("at 0:30, +15 s reads 0:45 and −15 s reads 0:30", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    vi.setSystemTime(nowMs + 90_000);
    await settle(1100);
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    expect(document.querySelector('[data-part="rest-clock"]')).toHaveTextContent("0:30");
    fireEvent.click(screen.getByRole("button", { name: "+15 s" }));
    await settle();
    expect(document.querySelector('[data-part="rest-clock"]')).toHaveTextContent("0:45");
    fireEvent.click(screen.getByRole("button", { name: "−15 s" }));
    await settle();
    expect(document.querySelector('[data-part="rest-clock"]')).toHaveTextContent("0:30");
  });

  it("Skip returns to UF-03.1 with no bar", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    expect(screenIds()).toEqual(["UF-03.1"]);
    expect(document.querySelector('[data-part="rest-bar"]')).toBeNull();
  });

  it("Back to list returns to UF-03.1 with the bar still running", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    expect(screenIds()).toEqual(["UF-03.1"]);
    expect(restBarText()).toBe("Rest · 2:00 left");
  });

  it("the chrome announcer speaks '10 seconds' at <= 10 s and 'Go' at expiry, with no own aria-live", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    const announcer = () => document.querySelector('[data-field="announcer"]')?.textContent ?? "";
    vi.setSystemTime(nowMs + 111_000);
    await waitFor(() => expect(restBarText()).toBe("Rest · 0:09 left"));
    await waitFor(() => expect(announcer()).toBe("10 seconds"));
    vi.setSystemTime(nowMs + 120_000);
    await waitFor(() => expect(announcer()).toBe("Go"));
    // UF-03 renders no aria-live region of its own: the only one is the host's.
    expect(document.querySelectorAll("[aria-live]").length).toBeGreaterThanOrEqual(1);
    for (const el of document.querySelectorAll("[aria-live]")) {
      if (el !== document.querySelector('[data-field="announcer"]')) {
        expect(el.closest('[data-screen-id="UF-03.1"], [data-screen-id="UF-03.2"]')).toBeTruthy();
      }
    }
  });
});

describe("T-0418 AC-5 focus (D-0172 §3)", () => {
  it("after Back to list, focus is on the rest bar", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    await waitFor(() =>
      expect(document.activeElement).toBe(document.querySelector('[data-part="rest-bar"]')),
    );
  });

  it("after Skip with rows 2-3 unchecked on the current card, focus is row 2's checkbox", async () => {
    await openList({ itemIndex: 2, setIndex: 0, loggedSets: [] }, PLAN_WITH_CURL_PREFILL);
    await check("Mark set 1 done", "Mark set 1 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("checkbox", { name: "Mark set 2 done" }),
      ),
    );
  });

  it("with every row of the current card checked, Skip moves focus to Finish", async () => {
    // leg-curl is the plan's last item; checking its last row starts a rest (back-squat and RDL
    // still have open sets, so AC-2's "no rest" doesn't apply here). On Skip, `REST_END` finds no
    // unlogged set left in leg-curl, and it's the last item, so the machine reaches `done` — the
    // current card (still leg-curl) is now fully checked, and Finish is the next step.
    const loggedSets = [
      ...[0, 1].map((setIndex) => ({
        clientId: `curl-${setIndex}`,
        itemIndex: 2,
        setIndex,
        exerciseId: "leg-curl",
        reps: 10,
        weightKg: 40,
        durationS: null,
        rir: null,
        backoff: false,
      })),
    ];
    await openList({ itemIndex: 2, setIndex: 2, loggedSets }, PLAN_WITH_CURL_PREFILL);
    await check("Mark set 3 done", "Mark set 3 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'));
    expect(storedFocus()).toMatchObject({ phase: "done" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Finish" })),
    );
  });

  it("with the rest view open and Date advanced past the end, it closes and focus lands on the first unchecked checkbox", async () => {
    await openList();
    await check("Mark set 2 done", "Mark set 2 not done");
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await findEl(() => document.querySelector('[data-screen-id="UF-03.2"]'));
    vi.setSystemTime(nowMs + 120_000);
    // The host's own real 1 s re-render interval surfaces REST_END; give it more than one tick.
    await findEl(() => document.querySelector('[data-screen-id="UF-03.1"]'), 200);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("checkbox", { name: "Mark set 3 done" }),
      ),
    );
  });
});

describe("T-0418 AC-4 a11y", () => {
  afterEach(() => {
    document.querySelectorAll("main[data-test-wrapper]").forEach((el) => el.remove());
  });

  function wrapInMain(container: HTMLElement) {
    const main = document.createElement("main");
    main.setAttribute("data-test-wrapper", "");
    container.replaceWith(main);
    main.append(container);
  }

  it("the rest bar is a button named 'Rest, {m:ss} left, show rest'", async () => {
    const ctx = makeCtx({ rest: { remainingS: 120 } });
    const { container } = render(<ListView ctx={ctx} />);
    wrapInMain(container);
    const bar = await screen.findByRole("button", { name: "Rest, 2:00 left, show rest" });
    expect(bar).toHaveTextContent("Rest · 2:00 left");
    expect(await axeViolations()).toEqual([]);
  });

  it("the rest view's buttons are named, and axe finds 0 violations on UF-03.2", async () => {
    const ctx = makeCtx({ rest: { remainingS: 90 } });
    const { container } = render(<ListView ctx={ctx} />);
    wrapInMain(container);
    fireEvent.click(await screen.findByRole("button", { name: /^Rest,/ }));
    await screen.findByRole("button", { name: "Skip" });
    expect(screen.getByRole("button", { name: "−15 s" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+15 s" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });
});
