// T-0301d AC-1..AC-6, AC-8 (UF-01.4 Schedule & plan): the rhythm steppers (D-0064 §4), the plan
// card from `deriveTargets` (principle 3, D-0064 §5), the record (D-0064 §6, D-0098), the timing
// (D-0064 §7), offline, and the hand-off (D-0064 §8). `Date.now` is faked throughout.
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "@workoutlab/engine";

const supabaseFrom = vi.fn();
vi.mock("../../../lib/auth/client.js", async () =>
  (await import("./client-mock.js")).clientMock(supabaseFrom),
);
// A pass-through spy on the real `deriveTargets`, so a test can change what the engine returns
// and see whether the card follows (AC-1's main guard).
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, deriveTargets: vi.fn(actual.deriveTargets) };
});

const {
  KEY,
  findScreen,
  mountAt,
  seedValidSession,
  setOnline,
  settle,
  stepperValue,
  stored,
  targetRows,
  where,
} = await import("./harness.js");

const deriveTargets = vi.mocked(engine.deriveTargets);
const realDerive = (
  await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine")
).deriveTargets;

let now = 0;
const setNow = (ms: number) => {
  now = ms;
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  setNow(0);
  deriveTargets.mockImplementation(realDerive);
  deriveTargets.mockClear();
  supabaseFrom.mockClear();
});
afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const R4_E1: Array<[string, number]> = [
  ["chest", 20],
  ["back", 20],
  ["shoulders", 16],
  ["arms", 12],
  ["core", 12],
  ["glutes", 20],
  ["quads", 20],
  ["hamstrings", 16],
  ["calves", 12],
];

const RECORD_AC5 = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 3,
  rhythmMax: 4,
  startedAtMs: null,
  timingMs: null,
  planShown: false,
  savedAtMs: 5_000_000,
};

const btn = (name: string) => screen.getByRole("button", { name });
const MIN_UP = "One more session per week, minimum";
const MIN_DOWN = "One fewer session per week, minimum";
const MAX_UP = "One more session per week, maximum";
const MAX_DOWN = "One fewer session per week, maximum";

function rows(): Record<string, number> {
  return Object.fromEntries(targetRows());
}

function rhythm(): [number, number] {
  return [stepperValue("rhythm-min"), stepperValue("rhythm-max")];
}

function rhythmLine(): string {
  return document.querySelector('[data-field="rhythm"]')!.textContent!;
}

async function openSchedule(): Promise<HTMLElement> {
  mountAt("/welcome/schedule");
  return findScreen("UF-01.4");
}

describe("AC-1 the plan card comes from the engine (principle 3, D-0064 §5)", () => {
  it("no stored record: steppers 3 and 4, R4-E1 in AREAS order, the rhythm line", async () => {
    const root = await openSchedule();
    expect(root).toHaveAttribute("data-screen-id", "UF-01.4");
    expect(rhythm()).toEqual([3, 4]);
    expect(targetRows()).toEqual(R4_E1);
    expect(rhythmLine()).toBe("3–4 per week · 6–8 per 14 days");
    expect(deriveTargets).toHaveBeenCalledWith({ rhythmMin: 3, rhythmMax: 4, priorityAreas: [] });
  });

  it("the card shows the goal, level and equipment-profile labels", async () => {
    setNow(5_000_000);
    window.localStorage.setItem(KEY, JSON.stringify(RECORD_AC5));
    const root = await openSchedule();
    const card = within(root).getByRole("region", { name: "Get stronger" });
    expect(card.textContent).toContain("Advanced · Dumbbells");
    expect(within(card).getAllByRole("listitem")).toHaveLength(9);
  });

  it("stepping to 1–1 shows R4-E4 (back 10, shoulders 8, arms 6)", async () => {
    await openSchedule();
    fireEvent.click(btn(MAX_DOWN)); // 3–3
    fireEvent.click(btn(MAX_DOWN)); // 2–2
    fireEvent.click(btn(MAX_DOWN)); // 1–1
    expect(rhythm()).toEqual([1, 1]);
    expect(rows()).toMatchObject({ back: 10, shoulders: 8, arms: 6 });
    expect(rhythmLine()).toBe("1 per week · 2 per 14 days");
  });

  it("stepping to 7–7 shows R4-E5 (back 30, arms 18)", async () => {
    await openSchedule();
    for (let i = 0; i < 4; i++) fireEvent.click(btn(MIN_UP));
    expect(rhythm()).toEqual([7, 7]);
    expect(rows()).toMatchObject({ back: 30, arms: 18 });
  });

  it("with deriveTargets spied to add 1 to every area, every rendered number is 1 higher", async () => {
    deriveTargets.mockImplementation((input) => {
      const out = realDerive(input);
      return Object.fromEntries(Object.entries(out).map(([a, n]) => [a, n + 1])) as ReturnType<
        typeof realDerive
      >;
    });
    await openSchedule();
    expect(targetRows()).toEqual(R4_E1.map(([a, n]) => [a, n + 1]));
    fireEvent.click(btn(MAX_DOWN));
    fireEvent.click(btn(MAX_DOWN));
    fireEvent.click(btn(MAX_DOWN));
    expect(rows()).toMatchObject({ back: 11, shoulders: 9, arms: 7 });
    expect(deriveTargets).toHaveBeenLastCalledWith({
      rhythmMin: 1,
      rhythmMax: 1,
      priorityAreas: [],
    });
  });
});

describe("AC-2 stepper rules (D-0064 §4)", () => {
  it("from 3–4: min + twice → 5–5, then min + → 6–6", async () => {
    await openSchedule();
    fireEvent.click(btn(MIN_UP));
    expect(rhythm()).toEqual([4, 4]);
    fireEvent.click(btn(MIN_UP));
    expect(rhythm()).toEqual([5, 5]);
    fireEvent.click(btn(MIN_UP));
    expect(rhythm()).toEqual([6, 6]);
  });

  it("from 3–4: max − → 3–3, then max − → 2–2", async () => {
    await openSchedule();
    fireEvent.click(btn(MAX_DOWN));
    expect(rhythm()).toEqual([3, 3]);
    fireEvent.click(btn(MAX_DOWN));
    expect(rhythm()).toEqual([2, 2]);
  });

  it("min − at 1 is aria-disabled and does nothing; it is enabled above 1", async () => {
    await openSchedule();
    expect(btn(MIN_DOWN)).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(btn(MIN_DOWN));
    fireEvent.click(btn(MIN_DOWN));
    expect(rhythm()).toEqual([1, 4]);
    expect(btn(MIN_DOWN)).toHaveAttribute("aria-disabled", "true");
    setNow(123);
    const before = window.localStorage.getItem(KEY);
    fireEvent.click(btn(MIN_DOWN));
    expect(rhythm()).toEqual([1, 4]);
    expect(window.localStorage.getItem(KEY)).toBe(before);
  });

  it("max + at 7 is aria-disabled and does nothing; it is enabled below 7", async () => {
    await openSchedule();
    expect(btn(MAX_UP)).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(btn(MAX_UP));
    fireEvent.click(btn(MAX_UP));
    fireEvent.click(btn(MAX_UP));
    expect(rhythm()).toEqual([3, 7]);
    expect(btn(MAX_UP)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(btn(MAX_UP));
    expect(rhythm()).toEqual([3, 7]);
  });

  it("the four buttons have exactly the four names, and stay focusable when disabled", async () => {
    const root = await openSchedule();
    const names = within(root)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names.sort()).toEqual([MAX_DOWN, MAX_UP, MIN_DOWN, MIN_UP].sort());
    for (const b of within(root).getAllByRole("button")) expect(b).not.toHaveAttribute("disabled");
  });

  it("each value is in an aria-live=polite region that names it", async () => {
    await openSchedule();
    const min = document.querySelector('[data-field="rhythm-min"]')!;
    const max = document.querySelector('[data-field="rhythm-max"]')!;
    expect(min).toHaveAttribute("aria-live", "polite");
    expect(max).toHaveAttribute("aria-live", "polite");
    expect(min.textContent).toContain("At least 3 sessions per week");
    fireEvent.click(btn(MAX_UP));
    expect(max.textContent).toContain("At most 5 sessions per week");
  });
});

describe("AC-3 the record (D-0064 §6, D-0098)", () => {
  it("the AC-5 record stepped to 2–3 deep-equals the literal; a remount restores it", async () => {
    setNow(5_000_000);
    window.localStorage.setItem(KEY, JSON.stringify(RECORD_AC5));
    const view = mountAt("/welcome/schedule");
    await findScreen("UF-01.4");
    fireEvent.click(btn(MIN_DOWN)); // 2–4
    fireEvent.click(btn(MAX_DOWN)); // 2–3
    expect(rhythm()).toEqual([2, 3]);
    expect(stored()).toEqual({
      version: 1,
      goal: "get_stronger",
      level: "advanced",
      equipmentProfile: "dumbbells",
      rhythmMin: 2,
      rhythmMax: 3,
      startedAtMs: null,
      timingMs: null,
      planShown: true,
      savedAtMs: 5_000_000,
    });
    view.unmount();

    await openSchedule();
    expect(rhythm()).toEqual([2, 3]);
    expect(rows()).toMatchObject({ back: 14, shoulders: 11, arms: 9 });
  });

  it("each stepper change rewrites the key and savedAtMs", async () => {
    setNow(1_000);
    await openSchedule();
    setNow(2_000);
    fireEvent.click(btn(MAX_UP));
    expect(stored()).toMatchObject({ rhythmMin: 3, rhythmMax: 5, savedAtMs: 2_000 });
    setNow(3_000);
    fireEvent.click(btn(MIN_UP));
    expect(stored()).toMatchObject({ rhythmMin: 4, rhythmMax: 5, savedAtMs: 3_000 });
  });
});

describe("AC-4 planShown (D-0098)", () => {
  it("planShown false → true at UF-01.4's commit, and it survives Back and a level change", async () => {
    setNow(5_000_000);
    window.localStorage.setItem(KEY, JSON.stringify(RECORD_AC5));
    await openSchedule();
    expect(stored()).toMatchObject({ planShown: true });

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.3");
    expect(where.current).toBe("/welcome/level");
    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(stored()).toMatchObject({ level: "beginner", planShown: true });
  });

  it("contrast: before UF-01.4 renders, the record is still planShown false", async () => {
    setNow(5_000_000);
    window.localStorage.setItem(KEY, JSON.stringify(RECORD_AC5));
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(stored()).toMatchObject({ planShown: false });
  });
});

describe("AC-5 timing (D-0064 §7, NFR-AN-2)", () => {
  async function runToPlan() {
    setNow(1_000_000);
    const view = mountAt("/welcome");
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    setNow(1_042_000);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    return view;
  }

  it("1 000 000 at UF-01.1, 1 042 000 at UF-01.4 → timingMs 42 000", async () => {
    await runToPlan();
    expect(stored()).toMatchObject({ startedAtMs: 1_000_000, timingMs: 42_000, planShown: true });
  });

  it("a stepper change and a re-render at 1 050 000 leave it at 42 000", async () => {
    await runToPlan();
    setNow(1_050_000);
    fireEvent.click(btn(MAX_UP));
    expect(stored()).toMatchObject({ timingMs: 42_000, rhythmMax: 5, savedAtMs: 1_050_000 });
    // A re-render: back to UF-01.3 and forward again (a fresh mount of UF-01.4).
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    await settle();
    expect(stored()).toMatchObject({ timingMs: 42_000 });
  });

  it("a remount of UF-01.4 at 1 050 000 leaves it at 42 000", async () => {
    const view = await runToPlan();
    view.unmount();
    setNow(1_050_000);
    await openSchedule();
    expect(stored()).toMatchObject({ timingMs: 42_000 });
  });

  it("Back to UF-01.1 and forward again leaves it at 42 000", async () => {
    await runToPlan();
    setNow(1_060_000);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.3");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await findScreen("UF-01.1");
    fireEvent.click(screen.getByRole("link", { name: "Get started" }));
    await findScreen("UF-01.2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.3");
    setNow(1_070_000);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await findScreen("UF-01.4");
    expect(stored()).toMatchObject({ startedAtMs: 1_000_000, timingMs: 42_000 });
  });

  it("startedAtMs null (the /welcome/goal path): timingMs stays null, planShown becomes true", async () => {
    setNow(2_000_000);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...RECORD_AC5, startedAtMs: null, savedAtMs: 2_000_000 }),
    );
    await openSchedule();
    expect(stored()).toMatchObject({ startedAtMs: null, timingMs: null, planShown: true });
  });
});

describe("AC-6 offline: the plan is computed on the device", () => {
  it.each([false, true])(
    "navigator.onLine=%s, fetch rejecting: R4-E1 renders with 0 fetch and supabase.from calls",
    async (online) => {
      setOnline(online);
      const fetchSpy = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
      vi.stubGlobal("fetch", fetchSpy);
      await openSchedule();
      expect(targetRows()).toEqual(R4_E1);
      fireEvent.click(btn(MAX_UP));
      await settle();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(supabaseFrom).not.toHaveBeenCalled();
    },
  );
});

describe("AC-8 the hand-off (D-0064 §8)", () => {
  it("signed out: Save my plan goes to /account", async () => {
    await openSchedule();
    const save = screen.getByRole("link", { name: "Save my plan" });
    expect(save).toHaveAttribute("href", "/account");
    fireEvent.click(save);
    await findScreen("UF-01.5");
    expect(where.current).toBe("/account");
  });

  it("signed in (a stored valid session): Save my plan goes to /welcome/save", async () => {
    seedValidSession();
    await openSchedule();
    const save = screen.getByRole("link", { name: "Save my plan" });
    expect(save).toHaveAttribute("href", "/welcome/save");
    fireEvent.click(save);
    await settle();
    expect(where.current).toBe("/welcome/save");
  });

  it("stale (an expired stored session) counts as signed in: /welcome/save", async () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "tok", expires_at: 1, user: { id: "u1" } }),
    );
    setNow(5_000); // expires_at 1 s < now: "stale"
    setOnline(false); // no refresh attempt
    await openSchedule();
    expect(screen.getByRole("link", { name: "Save my plan" })).toHaveAttribute(
      "href",
      "/welcome/save",
    );
  });

  it("Back goes to /welcome/level", async () => {
    await openSchedule();
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toHaveAttribute("href", "/welcome/level");
  });
});
