// T-1009 UF-08.2 "Start workout" on the plan screen (D-0280, UF-08.2.md): AC1-AC10 through the host.
// Loaders mocked; the real engine runs. `upsertSession` is a spy. UF-08.4 Ready is gone: the tests
// that pinned it (ready-view, ready-start, ready-back-pending, ready-real-queue) are moved here.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { upsertSession, type SessionInsert } from "../../../lib/offline/queue.js";
import { parseSessionPlan } from "@workoutlab/shared";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
import { LOCALE, NOW, TZ } from "./fixtures.js";
import { fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));

const upsert = vi.mocked(upsertSession);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY = "wl-focus-prefs";

/** A clock the test moves (10:00 UTC is 12:00 in Stockholm). */
function movableClock() {
  const state = { at: new Date("2026-09-27T10:00:00Z") };
  return { state, clock: vi.fn(() => state.at) };
}

let navLog: { pathname: string; search: string; type: string }[] = [];
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

function NavLog() {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    navLog.push({ pathname: location.pathname, search: location.search, type });
  }, [location, type]);
  return null;
}

function mount(at: string, props: SessionSetupProps) {
  return render(
    <MemoryRouter initialEntries={["/", at]} initialIndex={1}>
      <NavLog />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/session/:id" element={<span data-testid="focus-mode" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const okEntry = (row: SessionInsert) => ({
  id: row.id as string,
  userId: "u",
  row,
  finished: false,
  pending: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  navLog = [];
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  upsert.mockImplementation(async (row) => okEntry(row));
  setOnline(false);
  serveCache();
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const startBtn = () => button("Start workout");
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-part="area-row"]'));
const row = (area: string) =>
  document.querySelector<HTMLElement>(`[data-part="area-row"][data-area="${area}"]`)!;
const minus = (area: string) => row(area).querySelector<HTMLElement>('[data-part="minus"]')!;
const plus = (area: string) => row(area).querySelector<HTMLElement>('[data-part="plus"]')!;
const setsOf = (area: string) => row(area).querySelector('[data-part="sets-value"]')!.textContent;
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const doneBy = () => document.querySelector('[data-part="done-by"]')!.textContent;
const focusDetails = () => document.querySelector<HTMLDetailsElement>('[data-part="focus-mode"]')!;
const last = () => navLog.at(-1)!;

async function toPlan(
  o: { budget?: number; empty?: boolean; props?: Partial<SessionSetupProps> } = {},
) {
  mount(`/session/setup?budget=${o.budget ?? 45}`, {
    now: NOW,
    locale: LOCALE,
    timeZone: TZ,
    ...o.props,
  });
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
  fireEvent.click(button(o.empty === true ? "Start empty" : "Suggest my workout"));
  await settle();
  expect(screenIds()).toEqual(["UF-08.2"]);
}

/** Taps on the way: every `fireEvent.click` below is one, counted by `tap`. */
let taps = 0;
const tap = (el: Element) => {
  taps += 1;
  fireEvent.click(el);
};
beforeEach(() => {
  taps = 0;
});

describe("T-1009 AC1 taps from UF-08.2 to UF-09.1", () => {
  it("T-1009 AC1 the default plan: 1 tap, nothing is written before it", async () => {
    await toPlan();
    expect(upsert).not.toHaveBeenCalled();
    tap(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(taps).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("T-1009 AC1 two edits (one + and one -): 3 taps, and the written plan carries both", async () => {
    await toPlan({ budget: 60 });
    const areas = rows().map((r) => r.getAttribute("data-area")!);
    const minusArea = areas.find((a) => Number(/\d+/.exec(setsOf(a))![0]) > 2)!;
    const beforeMinus = setsOf(minusArea);
    tap(minus(minusArea));
    // The set it freed makes room for one + in an area that is not at its cap.
    const plusArea = areas.find(
      (a) => a !== minusArea && plus(a).getAttribute("aria-disabled") !== "true",
    )!;
    const beforePlus = setsOf(plusArea);
    tap(plus(plusArea));
    expect(setsOf(plusArea)).not.toBe(beforePlus);
    expect(setsOf(minusArea)).not.toBe(beforeMinus);
    expect(upsert).not.toHaveBeenCalled();
    const shown = rows().reduce(
      (n, r) => n + Number(/\d+/.exec(setsOf(r.getAttribute("data-area")!))![0]),
      0,
    );
    tap(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(taps).toBe(3);
    const plan = upsert.mock.calls[0]![0].plan as {
      items: { exerciseId: string; sets: number }[];
    };
    const written = plan.items.reduce((n, i) => n + i.sets, 0);
    expect(written).toBe(shown);
  });

  it("T-1009 AC1 Start empty with one area added: 2 taps", async () => {
    await toPlan({ empty: true });
    tap(button("Add Chest"));
    tap(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(taps).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("T-1009 AC2 what Start writes", () => {
  it("T-1009 AC2 the row: started_at is the clock at the tap, not at mount; budget, energy, warm-up as set; plan parses; REPLACE", async () => {
    const { state, clock } = movableClock();
    await toPlan({ props: { clock } });
    state.at = new Date("2026-09-27T12:04:00+02:00");
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    const row0 = upsert.mock.calls[0]![0];
    expect(row0.started_at).toBe("2026-09-27T10:04:00.000Z");
    expect(row0).toMatchObject({
      ended_at: null,
      time_budget_min: 45,
      energy: "normal",
      warmup_in_budget: true,
    });
    expect(row0.id).toMatch(UUID_V4);
    expect(parseSessionPlan(row0.plan)).toMatchObject({ ok: true });
    expect(last()).toEqual({ pathname: `/session/${row0.id}`, search: "", type: "REPLACE" });
  });

  it("T-1009 AC2 the pair: the clock unmoved gives the same instant as mount", async () => {
    const { clock } = movableClock();
    await toPlan({ props: { clock } });
    fireEvent.click(startBtn());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0]![0].started_at).toBe("2026-09-27T10:00:00.000Z");
  });

  it("T-1009 AC2 the plan written is the shown one, in orderItems order (compound first), edits included", async () => {
    await toPlan({ empty: true });
    fireEvent.click(button("Add Arms"));
    fireEvent.click(button("Add Chest"));
    fireEvent.click(startBtn());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const plan = upsert.mock.calls[0]![0].plan as { items: { exerciseId: string }[] };
    expect(plan.items.map((i) => i.exerciseId)).toEqual(["bench-press", "biceps-curl"]);
  });

  it("T-1009 AC2 Back from the workout never lands on a Start button: the navigation is REPLACE, and the write comes first", async () => {
    const write = deferred();
    upsert.mockImplementation(async (row) => {
      await write.promise;
      return okEntry(row);
    });
    await toPlan();
    const before = navLog.length;
    fireEvent.click(startBtn());
    await settle();
    expect(navLog).toHaveLength(before);
    expect(screen.queryByTestId("focus-mode")).toBeNull();
    write.resolve();
    await waitFor(() => expect(last().pathname).toMatch(/^\/session\/[0-9a-f-]{36}$/));
    expect(last().type).toBe("REPLACE");
    expect(navLog).toHaveLength(before + 1);
  });
});

describe("T-1009 AC3 disabled at no areas", () => {
  it("T-1009 AC3 Start empty: aria-disabled, focusable, the reason in aria-describedby, a tap writes nothing; one area enables it", async () => {
    await toPlan({ empty: true });
    expect(startBtn()).toHaveAttribute("aria-disabled", "true");
    expect(startBtn()).not.toBeDisabled();
    const reason = screen.getByText("Add at least one area.");
    expect(startBtn().getAttribute("aria-describedby")).toBe(reason.id);
    fireEvent.click(startBtn());
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(screenIds()).toEqual(["UF-08.2"]);
    fireEvent.click(button("Add Chest"));
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    expect(startBtn()).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Add at least one area.")).toBeNull();
  });

  it("T-1009 AC3 nothing fits: the same disabled form on the Suggest entry", async () => {
    await toPlan({ budget: 20 });
    // Removing every area leaves the plan with none.
    for (const r of rows()) {
      const area = r.getAttribute("data-area")!;
      while (minus(area)?.getAttribute("data-remove") !== "true") fireEvent.click(minus(area));
      fireEvent.click(minus(area));
    }
    expect(rows()).toHaveLength(0);
    expect(startBtn()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(startBtn());
    await settle();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("T-1009 AC4 pending, failure, retry", () => {
  it("T-1009 AC4 pending: the button, plan controls, Back and Close are inert; a second tap writes nothing; the status says so", async () => {
    const write = deferred();
    upsert.mockImplementation(async (r) => {
      await write.promise;
      return okEntry(r);
    });
    await toPlan({ budget: 60 });
    // One - first, so that a + is open (not refused) while Start is pending.
    const all = rows().map((r) => r.getAttribute("data-area")!);
    fireEvent.click(minus(all.find((a) => Number(/\d+/.exec(setsOf(a))![0]) > 2)!));
    const area = all.find((a) => plus(a).getAttribute("aria-disabled") !== "true")!;
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    const setsBefore = setsOf(area);
    const nRows = rows().length;
    fireEvent.click(startBtn());
    await waitFor(() => expect(startBtn()).toHaveAttribute("aria-disabled", "true"));
    expect(startBtn()).toHaveAttribute("aria-busy", "true");
    expect(status()).toHaveTextContent("Starting your workout.");
    fireEvent.click(startBtn());
    fireEvent.click(minus(area));
    fireEvent.click(plus(area));
    fireEvent.click(button("30 minutes"));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    fireEvent.click(screen.getByRole("link", { name: "Close" }));
    await settle();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(setsOf(area)).toBe(setsBefore);
    expect(rows()).toHaveLength(nRows);
    expect(last().pathname).toBe("/session/setup");
    expect(last().search).toBe("?step=suggested");
    for (const el of [
      minus(area),
      plus(area),
      button("30 minutes"),
      screen.getByRole("link", { name: "Back" }),
      screen.getByRole("link", { name: "Close" }),
      document.querySelector('[data-part="add-area-summary"]')!,
      document.querySelector('[data-part="focus-mode-summary"]')!,
      row(area).querySelector('[data-part="area-open"]')!,
    ]) {
      expect(el).toHaveAttribute("aria-disabled", "true");
    }
    write.resolve();
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("T-1009 AC4 the pair: idle, Back and the controls are live", async () => {
    await toPlan({ budget: 60 });
    const area = rows()[0]!.getAttribute("data-area")!;
    expect(screen.getByRole("link", { name: "Back" })).not.toHaveAttribute("aria-disabled");
    expect(minus(area)).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
  });

  it("T-1009 AC4 rejected: the alert, controls enabled, focus on Start, no navigation; success shows no alert", async () => {
    upsert.mockRejectedValueOnce(new Error("QuotaExceededError"));
    await toPlan();
    expect(screen.queryByRole("alert")).toBeNull();
    const before = navLog.length;
    fireEvent.click(startBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't start the workout. Try again.",
    );
    await settle();
    expect(navLog).toHaveLength(before);
    expect(unhandled).toEqual([]);
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    expect(document.activeElement).toBe(startBtn());
    expect(screen.getByRole("link", { name: "Back" })).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Starting your workout.")).toBeNull();
    // Retry succeeds with no alert.
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("T-1009 AC4 retry reuses the same session id and navigates once", async () => {
    upsert.mockRejectedValueOnce(new Error("AbortError"));
    await toPlan();
    const before = navLog.length;
    fireEvent.click(startBtn());
    await screen.findByRole("alert");
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(2);
    const [first, second] = upsert.mock.calls.map((c) => c[0].id);
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
    await waitFor(() => expect(navLog).toHaveLength(before + 1));
  });

  it("T-1009 AC4 leaving the plan drops the id: Back, then a new visit makes a different id", async () => {
    upsert.mockRejectedValueOnce(new Error("AbortError"));
    await toPlan();
    fireEvent.click(startBtn());
    await screen.findByRole("alert");
    const first = upsert.mock.calls[0]![0].id;
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    fireEvent.click(button("Suggest my workout"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(upsert.mock.calls[1]![0].id).not.toBe(first);
  });

  it("T-1009 AC4 unmounting while pending: no navigate, no state update, no unhandled rejection", async () => {
    const write = deferred();
    upsert.mockImplementation(async () => {
      await write.promise;
      throw new Error("late");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await toPlan();
    fireEvent.click(startBtn());
    await settle();
    cleanup();
    write.resolve();
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });
});

describe("T-1009 AC5 offline and online", () => {
  it.each([false, true])(
    "T-1009 AC5 onLine=%s: Start writes the queue row and makes no network call",
    async (online) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      await toPlan();
      setOnline(online);
      fireEvent.click(startBtn());
      await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("T-1009 AC6 Done by", () => {
  const minutesShown = () =>
    Number(
      /About (\d+) of/.exec(document.querySelector('[data-part="budget-text"]')!.textContent!)![1],
    );
  const hhmm = (m: number) => `Done by 12:${String(m).padStart(2, "0")}`;

  it("T-1009 AC6 Done by is 12:00 plus the plan's minutes, re-derived after a - and a +, with the clock read once", async () => {
    const { clock } = movableClock();
    await toPlan({ budget: 60, props: { clock } });
    const calls = clock.mock.calls.length;
    const area = rows()
      .map((r) => r.getAttribute("data-area")!)
      .find((a) => minus(a).getAttribute("data-remove") !== "true")!;
    expect(doneBy()).toBe(hhmm(minutesShown()));
    const m0 = minutesShown();
    fireEvent.click(minus(area));
    const m1 = minutesShown();
    expect(m1).toBeLessThan(m0);
    expect(doneBy()).toBe(hhmm(m1));
    fireEvent.click(plus(area));
    expect(minutesShown()).toBe(m0);
    expect(doneBy()).toBe(hhmm(m0));
    expect(clock.mock.calls.length).toBe(calls);
  });

  it("T-1009 AC6 the line follows the mount clock: 12:10 at mount reads 10 min later", async () => {
    const { clock } = movableClock();
    clock.mockReturnValue(new Date("2026-09-27T12:10:00+02:00"));
    await toPlan({ props: { clock } });
    expect(doneBy()).toBe(`Done by 12:${String(10 + minutesShown()).padStart(2, "0")}`);
  });

  it("T-1009 AC6 no areas reads '{n} min to fill'", async () => {
    await toPlan({ empty: true });
    expect(doneBy()).toBe("45 min to fill");
  });
});

describe("T-1009 AC7 Focus mode disclosure", () => {
  const sw = (name: string) => screen.getByRole("checkbox", { name });
  const open = () => fireEvent.click(document.querySelector('[data-part="focus-mode-summary"]')!);
  const NAMES = ["Sound cues", "Voice countdown 3-2-1", "Keep screen awake"] as const;

  it("T-1009 AC7 collapsed on every visit, even after an earlier visit left it open", async () => {
    await toPlan();
    expect(focusDetails().open).toBe(false);
    focusDetails().open = true;
    focusDetails().dispatchEvent(new Event("toggle"));
    await waitFor(() => expect(focusDetails().open).toBe(true));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    fireEvent.click(button("Suggest my workout"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(focusDetails().open).toBe(false);
  });

  it("T-1009 AC7 open: the four steps and three switches, all on by default", async () => {
    await toPlan();
    open();
    await waitFor(() => expect(focusDetails().open).toBe(true));
    const list = document.querySelector('ol[data-part="explainer"]')!;
    expect(
      Array.from(list.querySelectorAll('[data-part="explainer-title"]')).map((e) => e.textContent),
    ).toEqual([
      "One thing on screen",
      "Tap Done after each set",
      "Rest counts down by itself",
      "Everything else is behind pause",
    ]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    for (const n of NAMES) expect(sw(n)).toBeChecked();
  });

  it("T-1009 AC7 stored values show; a change is written at once and survives a new visit", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, sound: false, voice: true, keepAwake: false }),
    );
    await toPlan();
    expect(sw("Sound cues")).not.toBeChecked();
    expect(sw("Voice countdown 3-2-1")).toBeChecked();
    fireEvent.click(sw("Voice countdown 3-2-1"));
    expect(window.localStorage.getItem(KEY)).toBe(
      '{"version":1,"sound":false,"voice":false,"keepAwake":false}',
    );
  });

  it("T-1009 AC7 storage failure falls back to the defaults (on) and a throwing write does not throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await toPlan();
    for (const n of NAMES) expect(sw(n)).toBeChecked();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    expect(() => fireEvent.click(sw("Keep screen awake"))).not.toThrow();
    expect(sw("Keep screen awake")).not.toBeChecked();
  });

  it("T-1009 AC7 Start's tap count is the same open or closed: 1 tap", async () => {
    await toPlan();
    open();
    await waitFor(() => expect(focusDetails().open).toBe(true));
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("T-1009 AC8 UF-08.4 is gone", () => {
  it("T-1009 AC8 ?step=ready lands on UF-08.1 and no UF-08.4 screen exists in the DOM", async () => {
    mount("/session/setup?step=ready", { now: NOW, locale: LOCALE, timeZone: TZ });
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    expect(last()).toMatchObject({ pathname: "/session/setup", search: "", type: "REPLACE" });
    expect(document.querySelector('[data-screen-id="UF-08.4"]')).toBeNull();
  });

  it("T-1009 AC8 no Ready component or UF-08.4 screen id in the sources; the prefs module is still there", () => {
    const dir = resolve(__dirname, "..");
    expect(existsSync(resolve(dir, "Ready.tsx"))).toBe(false);
    for (const f of readdirSync(dir).filter((n) => /\.(tsx?|css)$/.test(n))) {
      const text = readFileSync(resolve(dir, f), "utf8");
      expect(text, f).not.toMatch(/data-screen-id="UF-08\.4"/);
      expect(text, f).not.toMatch(/from "\.\/Ready\.js"/);
    }
    expect(existsSync(resolve(dir, "focus-prefs.ts"))).toBe(true);
    expect(existsSync(resolve(dir, "index.prefs.ts"))).toBe(true);
  });
});

describe("T-1009 AC9 principles", () => {
  it("T-1009 AC9 the time question comes first; UF-08.2 has no UF-09 control and one action fill", async () => {
    mount("/session/setup", { now: NOW, locale: LOCALE, timeZone: TZ });
    await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(document.querySelector('[data-part="minutes"]')!.textContent).toBe("45");
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    fireEvent.click(button("Suggest my workout"));
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(document.querySelector('[data-screen-id^="UF-09"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Pause|Done|Skip|End workout)/ })).toBeNull();
    const primary = document.querySelectorAll(".wl-button--primary");
    expect(primary).toHaveLength(1);
    expect(primary[0]).toBe(startBtn());
  });
});

describe("T-1009 AC10 accessibility", () => {
  interface AxeViolation {
    id: string;
    nodes: { html: string }[];
  }
  type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: AxeViolation[] }> };
  let axe: Axe;
  beforeAll(async () => {
    const req = createRequire(resolve(process.cwd(), "package.json"));
    const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
    const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
    axe = mod.default ?? mod;
  });

  it("T-1009 AC10 axe finds nothing with the disclosure open and after a failed Start; focus is never on body", async () => {
    upsert.mockRejectedValueOnce(new Error("idb"));
    await toPlan();
    fireEvent.click(document.querySelector('[data-part="focus-mode-summary"]')!);
    await waitFor(() => expect(focusDetails().open).toBe(true));
    const run = async () =>
      (
        await axe.run(document.body, {
          rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
        })
      ).violations;
    expect(await run()).toEqual([]);
    fireEvent.click(startBtn());
    await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement).toBe(startBtn());
    expect(await run()).toEqual([]);
  });
});
