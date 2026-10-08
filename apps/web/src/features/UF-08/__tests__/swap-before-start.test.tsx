// T-0303c UF-08.3 Swap before starting: the shared UF-05.1 SwapSheet mounted on UF-08.2.
// AC-1 mount, AC-2 apply, AC-3 keep, AC-4 over budget, AC-5 start, AC-6 history and bad URLs,
// AC-7 offline. Real engine and real sheet except where an AC says "mocked sheet".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import {
  WARMUP_COST_S,
  availableS,
  generateWarmup,
  itemCostS,
  rankSwaps,
  suggest,
  type Area,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import { parseSessionPlan } from "@workoutlab/shared";
import { offlineDb, resetOfflineDbForTest, userScopedKey } from "../../../lib/offline/db.js";
import { upsertSession } from "../../../lib/offline/queue.js";
import { itemReasonLine } from "../../../lib/i18n/workout.js";
import { SwapSheet } from "../../UF-05/index.js";
import { SessionSetup } from "../SessionSetup.js";
import { fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";
import { AREAS, fLibrary } from "./fixtures.js";

const auth = vi.hoisted(() => ({
  status: "signed-in" as "signed-in" | "stale" | "signed-out",
  userId: null as string | null,
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, userId: auth.userId }),
}));
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest), rankSwaps: vi.fn(actual.rankSwaps) };
});
vi.mock("../../UF-05/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../UF-05/index.js")>();
  return { SwapSheet: vi.fn(actual.SwapSheet) };
});

const suggestSpy = vi.mocked(suggest);
const sheet = vi.mocked(SwapSheet);
const upsert = vi.mocked(upsertSession);

const NOW = "2026-09-27T10:00:00Z";
const props = { now: NOW, locale: "en-GB", timeZone: "UTC" };

/** W5: bench-press x 4 (main), barbell-row x 3, leg-extension x 2, budget 30, warm-up in. */
function w5(): Workout {
  const library = fLibrary();
  const items = (
    [
      ["bench-press", 4, true],
      ["barbell-row", 3, false],
      ["leg-extension", 2, false],
    ] as const
  ).map(([id, sets, isMain]) => ({
    exerciseId: id as string,
    isMain,
    sets,
    repsMin: null,
    repsMax: null,
    durationS: null,
    costS: itemCostS(
      library.find((e) => e.id === id)!,
      sets,
    ),
    backoff: null,
    prefill: { weightKg: null, reps: null, durationS: null, kind: "first_time" as const },
    reasons: [],
  }));
  const itemsTotalS = items.reduce((sum, i) => sum + i.costS, 0);
  const zero = {} as Record<Area, number>;
  for (const a of AREAS) zero[a] = 0;
  return {
    plan: {
      version: 1,
      mainLiftId: "bench-press",
      warmup: generateWarmup(
        items.map((i) => i.exerciseId),
        library,
      ),
      items,
      startDeficits: zero,
    },
    budgetMin: 30,
    warmupInBudget: true,
    energy: "normal",
    itemsTotalS,
    totalS: itemsTotalS + WARMUP_COST_S,
    unusedS: Math.max(0, availableS(30, true) - itemsTotalS),
    sessionReasons: [],
  };
}

let applied: Workout | null = null;
let storedSeeded = false;
let planItems: "w5" | "empty" = "w5";
let navigateRef: ReturnType<typeof useNavigate>;
let trail: string[] = [];

function w5Handed(): Workout {
  const w = w5();
  return planItems === "empty" ? { ...w, plan: { ...w.plan, items: [] } } : w;
}

/** The plain 30-min UF-08.1 call returns W5; every other call is the real engine. */
async function serveW5(): Promise<void> {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  suggestSpy.mockImplementation((...args: Parameters<typeof suggest>) => {
    const input: SessionInput = args[4];
    const plain =
      input.budgetMin === 30 &&
      input.energy === "normal" &&
      input.warmupInBudget &&
      input.shuffle === 0 &&
      (storedSeeded || input.excludeIds.length === 0);
    return plain ? w5Handed() : actual.suggest(...args);
  });
}

function Probe() {
  const loc = useLocation();
  navigateRef = useNavigate();
  useEffect(() => {
    trail.push(loc.pathname + loc.search);
  }, [loc]);
  return <span data-testid="loc" data-at={loc.pathname + loc.search} />;
}

const at = () => screen.getByTestId("loc").getAttribute("data-at");
const button = (name: string) => screen.getByRole("button", { name });
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (e) => e.textContent,
  );

function mount(start = "/session/setup") {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Probe />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/session/:id" element={<span data-testid="focus" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** UF-08.1 → chip 30 → Suggest → UF-08.2. */
async function toSuggested(start?: string): Promise<void> {
  mount(start);
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("30 minutes"));
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits: |Nothing fits)/));
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

const shown = () => rowNames();

async function openSwap(name = "Swap Barbell row"): Promise<void> {
  fireEvent.click(button(name));
  await screen.findByRole("radiogroup", { name: "Replacement" });
}

/** Short on time chip, db-row, Use. */
async function applyDbRow(): Promise<void> {
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "Reason" })).getByRole("radio", {
      name: "Short on time",
    }),
  );
  const row = await waitFor(() => {
    const el = screen
      .getByRole("radiogroup", { name: "Replacement" })
      .querySelector<HTMLElement>('[data-id="db-row"]');
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.click(within(row).getByRole("radio"));
  fireEvent.click(await screen.findByRole("button", { name: "Use Db row" }));
  await waitFor(() => expect(at()).toBe("/session/setup?step=suggested"));
}

beforeEach(async () => {
  auth.status = "signed-in";
  auth.userId = null;
  storedSeeded = false;
  planItems = "w5";
  trail = [];
  vi.clearAllMocks();
  applied = null;
  const actualSheet = (
    await vi.importActual<typeof import("../../UF-05/index.js")>("../../UF-05/index.js")
  ).SwapSheet;
  sheet.mockImplementation((p) =>
    actualSheet({
      ...p,
      onApply: (r) => {
        applied = r;
        return p.onApply(r);
      },
    }),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  setOnline(false);
  serveCache();
  await serveW5();
  upsert.mockImplementation(async (row) => ({
    id: row.id as string,
    userId: "u",
    row,
    finished: false,
    pending: true,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-1 mount (D-0071 §7)", () => {
  it("T-0303c AC-1 Swap Barbell row opens UF-05.1 at ?step=swap&item=1 with the right props", async () => {
    await toSuggested();
    const rendered = sheet.mock.calls.length;
    expect(rendered).toBe(0);
    fireEvent.click(button("Swap Barbell row"));
    expect(at()).toBe("/session/setup?step=swap&item=1");
    expect(screenIds()).toEqual(["UF-05.1"]);
    const p = sheet.mock.lastCall![0];
    expect(p.workout).toEqual(w5());
    expect(p.itemIndex).toBe(1);
    expect(p.timeZone).toBe("UTC");
  });

  it("T-0303c AC-1 the workout prop is the rendered Workout (reference-equal after a keep)", async () => {
    await toSuggested();
    await openSwap();
    const handed = sheet.mock.lastCall![0].workout;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(button("Swap Barbell row"));
    expect(sheet.mock.lastCall![0].workout).toBe(handed);
  });

  it("T-0303c AC-1 every item row has a visible 'Swap' button >= 44px; the warm-up row has none", async () => {
    await toSuggested();
    const rows = document.querySelectorAll('[data-part="item-row"]');
    expect(rows).toHaveLength(3);
    rows.forEach((r) => {
      const b = r.querySelector<HTMLElement>('[data-part="swap"]')!;
      expect(b.textContent).toBe("Swap");
    });
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    expect(/\.wl-uf08__icon\s*\{[^}]*block-size:\s*44px/.test(css)).toBe(true);
    expect(/\.wl-uf08__icon--text\s*\{[^}]*min-inline-size:\s*44px/.test(css)).toBe(true);
    expect(document.querySelector('[data-part="warmup-row"] [data-part="swap"]')).toBeNull();
  });

  it("T-0303c AC-1 an empty plan has no Swap button", async () => {
    planItems = "empty";
    await toSuggested();
    expect(screen.queryAllByRole("button", { name: /^Swap/ })).toEqual([]);
  });
});

describe("AC-2 apply renders the engine result", () => {
  it("T-0303c AC-2 Short on time + db-row replaces row 2 with the engine's reason; chip 20 drops it", async () => {
    await toSuggested();
    const before = suggestSpy.mock.calls.length;
    const [row1, , row3] = shown();
    await openSwap();
    await applyDbRow();
    expect(screenIds()).toEqual(["UF-08.2"]);
    const names = shown();
    expect(names[0]).toBe(row1);
    expect(names[1]).toBe("Db row");
    expect(names[2]).toBe(row3);
    const reason = document
      .querySelectorAll('[data-part="item-row"]')[1]!
      .querySelector('[data-part="row-reason"]')!.textContent!;
    expect(applied!.plan.items[1]!.reasons).toContainEqual({
      code: "swap",
      reason: "short_on_time",
    });
    expect(reason).toBe(itemReasonLine(applied!.plan.items[1]!.reasons));
    expect(reason).toContain("Swapped to save time");
    expect(suggestSpy.mock.calls.length).toBe(before);

    fireEvent.click(button("20 minutes"));
    await settle();
    expect(suggestSpy.mock.calls.length).toBe(before + 1);
    const input = suggestSpy.mock.lastCall![4];
    expect(input).toMatchObject({ budgetMin: 20, shuffle: 0, excludeIds: [] });
    expect(shown()).not.toContain("Db row");
  });
});

describe("AC-3 keep", () => {
  it.each([
    ["Close", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", () => fireEvent.keyDown(document.body, { key: "Escape" })],
  ])("T-0303c AC-3 %s returns to ?step=suggested, unchanged, focus on Swap", async (_n, leave) => {
    await toSuggested();
    const calls = suggestSpy.mock.calls.length;
    const names = shown();
    await openSwap();
    const handed = sheet.mock.lastCall![0].workout;
    leave();
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(at()).toBe("/session/setup?step=suggested");
    expect(shown()).toEqual(names);
    expect(suggestSpy.mock.calls.length).toBe(calls);
    fireEvent.click(button("Swap Barbell row"));
    expect(sheet.mock.lastCall![0].workout).toBe(handed);
    leave();
    await waitFor(() => expect(button("Swap Barbell row")).toHaveFocus());
  });
});

describe("AC-4 over budget after a swap (mocked sheet)", () => {
  it("T-0303c AC-4 shows the over-budget text and the warn colour", async () => {
    await toSuggested();
    const over: Workout = {
      ...w5(),
      itemsTotalS: availableS(30, true) + 300,
      totalS: availableS(30, true) + 300 + 180,
      unusedS: 0,
    };
    sheet.mockImplementationOnce((p) => (
      <button type="button" onClick={() => void p.onApply(over)}>
        apply over
      </button>
    ));
    fireEvent.click(button("Swap Barbell row"));
    fireEvent.click(button("apply over"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(document.querySelector('[data-part="budget-text"]')!.textContent).toMatch(
      /^\d+ min, \d+ over$/,
    );
    const seg = document.querySelector<HTMLElement>(".wl-uf08__seg--warn");
    expect(seg).not.toBeNull();
  });
});

describe("AC-5 start after a swap", () => {
  it("T-0303c AC-5 Start writes the swapped plan, which parses", async () => {
    await toSuggested();
    await openSwap();
    await applyDbRow();
    const swapped = applied!.plan;
    expect(swapped.items[1]!.exerciseId).toBe("db-row");
    fireEvent.click(button("Looks good"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]));
    fireEvent.click(button("Start"));
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    const plan = upsert.mock.calls[0]![0].plan;
    expect(plan).toEqual(swapped);
    expect(parseSessionPlan(plan)).toMatchObject({ ok: true });
  });
});

describe("AC-6 history and bad URLs", () => {
  it("T-0303c AC-6 Keep then one back lands on UF-08.1; the same after Apply", async () => {
    await toSuggested();
    await openSwap();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    await act(async () => void navigateRef(-1));
    await waitFor(() => expect(at()).toBe("/session/setup"));
    expect(screenIds()).toEqual(["UF-08.1"]);
    cleanup();
    trail = [];

    await toSuggested();
    await openSwap();
    await applyDbRow();
    await act(async () => void navigateRef(-1));
    await waitFor(() => expect(at()).toBe("/session/setup"));
    expect(screenIds()).toEqual(["UF-08.1"]);
  });

  it("T-0303c AC-6 browser Back while the sheet is open is Keep", async () => {
    await toSuggested();
    const names = shown();
    await openSwap();
    await act(async () => void navigateRef(-1));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(at()).toBe("/session/setup?step=suggested");
    expect(shown()).toEqual(names);
  });

  it("T-0303c AC-6 cold ?step=swap&item=1 renders UF-08.1 and replaces to /session/setup", async () => {
    mount("/session/setup?step=swap&item=1");
    expect(screenIds()).toEqual(["UF-08.1"]);
    await waitFor(() => expect(at()).toBe("/session/setup"));
    expect(screenIds()).toEqual(["UF-08.1"]);
  });

  it.each(["&item=x", "&item=-1", "&item=3", "", "&item=1.5"])(
    "T-0303c AC-6 with a Workout, '%s' replaces the URL with ?step=suggested",
    async (q) => {
      await toSuggested();
      await act(async () => void navigateRef(`/session/setup?step=swap${q}`));
      await waitFor(() => expect(at()).toBe("/session/setup?step=suggested"));
      expect(screenIds()).toEqual(["UF-08.2"]);
    },
  );

  it("T-0303c AC-6 item=2 opens the sheet", async () => {
    await toSuggested();
    await act(async () => void navigateRef("/session/setup?step=swap&item=2"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-05.1"]));
    expect(sheet.mock.lastCall![0].itemIndex).toBe(2);
  });
});

describe("AC-7 offline", () => {
  it("T-0303c AC-7 the swap works with navigator.onLine false and no fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setOnline(false);
    await toSuggested();
    await openSwap();
    await applyDbRow();
    expect(shown()[1]).toBe("Db row");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("T-0539 AC3 the stored excluded list filters the UF-08.3 swap sheet", () => {
  async function withStored(ids: string[]): Promise<void> {
    auth.userId = "A";
    storedSeeded = true; // UF-08.1 passes the stored list to `suggest`; the test still wants W5.
    resetOfflineDbForTest(`wl-offline-uf08-swap-excl-${Math.random()}`);
    for (const exerciseId of ids) {
      await offlineDb().excludedCache.put({
        key: userScopedKey("A", exerciseId),
        userId: "A",
        exerciseId,
        createdAt: "2026-10-01T00:00:00Z",
      });
    }
  }

  it("T-0539 AC3 stored [db-row]: the 9th argument is [db-row] and db-row is not a row", async () => {
    await withStored(["db-row"]);
    vi.mocked(rankSwaps).mockClear();
    await toSuggested();
    await openSwap();
    expect(vi.mocked(rankSwaps).mock.lastCall![8]).toEqual(["db-row"]);
    const group = screen.getByRole("radiogroup", { name: "Replacement" });
    expect(group.querySelector('[data-id="db-row"]')).toBeNull();
  });

  it("T-0539 AC3 an empty stored list: the 9th argument is []", async () => {
    await withStored([]);
    vi.mocked(rankSwaps).mockClear();
    await toSuggested();
    await openSwap();
    expect(vi.mocked(rankSwaps).mock.lastCall![8]).toEqual([]);
  });
});
