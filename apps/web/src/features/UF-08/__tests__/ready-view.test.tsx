// T-0303d UF-08.4 rendered on its own: AC-1 (summary, D-0110 §1-§2), AC-2 (explainer), AC-3 (the
// switches, D-0110 §6) and AC-7 (empty plans). `Ready` sits inside a router on `?step=ready`;
// `upsertSession` is a spy (the real queue is ready-real-queue.test.tsx). The host flow (W-R7E4
// handed over by UF-08.2, Start, retry, Back) is ready-start.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { suggest, type SessionInput, type Workout } from "@workoutlab/engine";
import { parseSessionPlan } from "@workoutlab/shared";
import { formatTime } from "../../../lib/format/intl.js";
import { upsertSession } from "../../../lib/offline/queue.js";
import { Ready, type ReadyProps } from "../Ready.js";
import { LOCALE, NOW, TZ, fLibrary, fProfile, fTargets } from "./fixtures.js";
import { wR7E4 } from "./workouts.js";

vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));

const upsert = vi.mocked(upsertSession);
const KEY = "wl-focus-prefs";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  upsert.mockImplementation(async (row) => ({
    id: row.id as string,
    userId: "u",
    row,
    finished: false,
    pending: true,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function Probe() {
  const loc = useLocation();
  return <span data-testid="loc" data-path={loc.pathname} data-search={loc.search} />;
}

function show(workout: Workout, overrides: Partial<ReadyProps> = {}) {
  const props: ReadyProps = {
    workout,
    clock: () => new Date(NOW),
    locale: LOCALE,
    timeZone: TZ,
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={["/session/setup?step=ready"]}>
      <Probe />
      <Routes>
        <Route path="/session/setup" element={<Ready {...props} />} />
        <Route path="/session/:id" element={<span data-testid="focus" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const summary = () => document.querySelector('[data-part="summary"]')!.textContent;

/** A direct engine call with the zero-history F-web inputs. */
function direct(input: Partial<SessionInput>): Workout {
  return suggest(
    [],
    fTargets(),
    fProfile(),
    fLibrary(),
    {
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      ...input,
    },
    new Date(NOW).toISOString(),
    TZ,
  );
}

describe("AC-1 summary (D-0110 §1-§2)", () => {
  it("W-R7E4 at F-tz: '29 min · warm-up + 3 exercises · 9 sets · done by 12:29'", () => {
    show(wR7E4());
    expect(summary()).toBe("29 min · warm-up + 3 exercises · 9 sets · done by 12:29");
  });

  it("the clock pair: clock() = 12:10 at mount gives 'done by 12:39'", () => {
    show(wR7E4(), { clock: () => new Date("2026-09-27T12:10:00+02:00") });
    expect(summary()).toBe("29 min · warm-up + 3 exercises · 9 sets · done by 12:39");
  });

  it("the clock is read once at mount: a re-render after it moves keeps done-by", () => {
    let at = new Date(NOW);
    const clock = vi.fn(() => at);
    show(wR7E4(), { clock });
    expect(clock).toHaveBeenCalledTimes(1);
    at = new Date("2026-09-27T12:30:00+02:00");
    fireEvent.click(screen.getByRole("checkbox", { name: "Sound cues" }));
    expect(clock).toHaveBeenCalledTimes(1);
    expect(summary()).toMatch(/done by 12:29$/);
  });

  it("singular: R7-E2 (15 min, zero history) reads '… warm-up + 1 exercise · 4 sets · …'", () => {
    const w = direct({ budgetMin: 15 });
    expect(w.plan.items).toHaveLength(1);
    show(w);
    expect(summary()).toBe("15 min · warm-up + 1 exercise · 4 sets · done by 12:15");
  });

  it("back-off counts: R7-E12 (15 min, warm-up off, High) reads '… 1 exercise · 5 sets · …'", () => {
    const w = direct({ budgetMin: 15, warmupInBudget: false, energy: "high" });
    expect(w.plan.items[0]!.backoff).not.toBeNull();
    show(w);
    expect(summary()).toMatch(/ 1 exercise · 5 sets · /);
    expect(summary()).toBe("18 min · warm-up + 1 exercise · 5 sets · done by 12:18");
  });

  it("no warm-up moves but items: the 'warm-up + ' part is left out", () => {
    const w = wR7E4();
    w.plan.warmup = [];
    w.totalS = w.itemsTotalS;
    show(w);
    expect(summary()).toBe("26 min · 3 exercises · 9 sets · done by 12:26");
  });

  it("en-US, America/New_York: the done-by is lib/format formatTime ('12:29 PM')", () => {
    const clock = () => new Date("2026-09-27T12:00:00-04:00");
    show(wR7E4(), { clock, locale: "en-US", timeZone: "America/New_York" });
    const expected = formatTime(new Date("2026-09-27T12:29:00-04:00").toISOString(), {
      locale: "en-US",
      timeZone: "America/New_York",
    });
    expect(expected).toBe("12:29 PM");
    expect(summary()).toBe(`29 min · warm-up + 3 exercises · 9 sets · done by ${expected}`);
  });
});

describe("AC-2 the 4-step explainer", () => {
  it("is an ordered list of exactly 4 items, in order", () => {
    show(wR7E4());
    const list = document.querySelector('ol[data-part="explainer"]')!;
    expect(list).not.toBeNull();
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      items.map((li) => li.querySelector('[data-part="explainer-title"]')!.textContent),
    ).toEqual([
      "One thing on screen",
      "Tap Done after each set",
      "Rest counts down by itself",
      "Everything else is behind pause",
    ]);
  });
});

const NAMES = ["Sound cues", "Voice countdown 3-2-1", "Keep screen awake"] as const;
const sw = (name: string) => screen.getByRole("checkbox", { name });

describe("AC-3 the focus-prefs switches (D-0110 §6)", () => {
  it("3 switches, all on when nothing is stored", () => {
    show(wR7E4());
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    for (const name of NAMES) expect(sw(name)).toBeChecked();
  });

  it("toggling Voice off stores it and a remount shows it off; toggling back stores voice: true", () => {
    const first = show(wR7E4());
    fireEvent.click(sw("Voice countdown 3-2-1"));
    expect(sw("Voice countdown 3-2-1")).not.toBeChecked();
    expect(window.localStorage.getItem(KEY)).toBe(
      '{"version":1,"sound":true,"voice":false,"keepAwake":true}',
    );
    first.unmount();

    show(wR7E4());
    expect(sw("Voice countdown 3-2-1")).not.toBeChecked();
    expect(sw("Sound cues")).toBeChecked();
    expect(sw("Keep screen awake")).toBeChecked();
    fireEvent.click(sw("Voice countdown 3-2-1"));
    expect(sw("Voice countdown 3-2-1")).toBeChecked();
    expect(window.localStorage.getItem(KEY)).toBe(
      '{"version":1,"sound":true,"voice":true,"keepAwake":true}',
    );
  });

  it("a stored value shows on mount (sound off, keep awake off)", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, sound: false, voice: true, keepAwake: false }),
    );
    show(wR7E4());
    expect(sw("Sound cues")).not.toBeChecked();
    expect(sw("Voice countdown 3-2-1")).toBeChecked();
    expect(sw("Keep screen awake")).not.toBeChecked();
  });

  it("a throwing setItem: no throw, and the switch still shows the new value", () => {
    show(wR7E4());
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => fireEvent.click(sw("Keep screen awake"))).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(sw("Keep screen awake")).not.toBeChecked();
  });
});

describe("AC-7 empty plan", () => {
  function warmupOnly(): Workout {
    const w = wR7E4();
    w.plan.items = [];
    w.plan.mainLiftId = null;
    w.itemsTotalS = 0;
    w.totalS = 180;
    return w;
  }

  it("warm-up only: '3 min · warm-up only · done by 12:03', and Start creates it with items []", async () => {
    const w = warmupOnly();
    show(w);
    expect(summary()).toBe("3 min · warm-up only · done by 12:03");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(1);
    const row = upsert.mock.calls[0]![0];
    expect(row.plan).toEqual(w.plan);
    expect((row.plan as Workout["plan"]).items).toEqual([]);
    expect(parseSessionPlan(row.plan).ok).toBe(true);
  });

  it("nothing planned: 'Nothing planned · done by 12:00', and Start still works", async () => {
    const w = warmupOnly();
    w.plan.warmup = [];
    w.totalS = 0;
    show(w);
    expect(summary()).toBe("Nothing planned · done by 12:00");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(1);
    const row = upsert.mock.calls[0]![0];
    expect(row.plan).toEqual(w.plan);
    expect(screen.getByTestId("loc").getAttribute("data-path")).toBe(`/session/${row.id}`);
  });
});
