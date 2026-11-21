// T-0948 UF-09.10 Add exercise in a workout, AC1-AC14 (docs/tickets/T-0948). The sheet is
// rendered on its own (no SessionSetup in the tree) with a fake `onAdd`; the device cache is
// mocked at the loaders, as the other UF-08 tests do. Fixture P as in the spec.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { HistorySet, WorkoutItem } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import { AddExerciseInWorkout, type AddInWorkoutResult } from "../index.js";
import { fProfile } from "./fixtures.js";
import { fCache, serveCache, setOnline, settle } from "./harness.js";

const lists = vi.hoisted(() => ({ excluded: [] as string[], favorites: [] as string[] }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: lists.excluded, loaded: true }),
  useOnline: () => false,
}));
vi.mock("../../../lib/offline/favorites-hooks.js", () => ({
  useFavoriteList: () => ({ ids: lists.favorites, loaded: true }),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return { ...actual, loadLibrary: vi.fn(), loadTargets: vi.fn(), loadProfile: vi.fn() };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

const STARTED = "2026-09-27T12:00:00+02:00";
const HOUR = 3_600_000;

function item(exerciseId: string, sets: number, isMain = false): WorkoutItem {
  return {
    exerciseId,
    isMain,
    sets,
    repsMin: 8,
    repsMax: 12,
    durationS: null,
    costS: 100,
    backoff: null,
    prefill: { weightKg: null, reps: 8, durationS: null, kind: "first_time" },
    reasons: [],
  };
}

function planOf(...ids: string[]): SessionPlan {
  return {
    version: 1,
    mainLiftId: ids[0] ?? null,
    warmup: [],
    items: ids.map((id, i) => item(id, 3, i === 0)),
    startDeficits: {},
  } as unknown as SessionPlan;
}
const P = () => planOf("bench-press", "inverted-row", "leg-extension");

function sets(exerciseId: string, n: number, atMs: number): HistorySet[] {
  return Array.from({ length: n }, (_, i) => ({
    clientId: `${exerciseId}-${atMs}-${i}`,
    sessionId: "old",
    exerciseId,
    isWarmup: false,
    completedAt: new Date(atMs + i * 1000).toISOString(),
    editedAt: new Date(atMs + i * 1000).toISOString(),
    deletedAt: null,
    reps: 10,
    weightKg: 50,
    durationS: null,
    rir: 2,
  }));
}

interface Over {
  plan?: SessionPlan;
  loggedSets?: { exerciseId: string }[];
  skippedItems?: number[];
  leftS?: number;
  onAdd?: (id: string) => Promise<AddInWorkoutResult>;
  onClose?: (a?: unknown) => void;
}
function renderSheet(o: Over = {}) {
  const onAdd = o.onAdd ?? vi.fn(async () => ({ status: "blocked" }) as AddInWorkoutResult);
  const onClose = o.onClose ?? vi.fn();
  const view = render(
    <AddExerciseInWorkout
      plan={o.plan ?? P()}
      loggedSets={o.loggedSets ?? []}
      skippedItems={o.skippedItems ?? []}
      startedAt={STARTED}
      leftS={o.leftS ?? 945}
      onAdd={onAdd}
      onClose={onClose}
    />,
  );
  return { ...view, onAdd, onClose };
}
const ready = () =>
  waitFor(() => expect(document.querySelector('[data-part="pick-row"]')).not.toBeNull());
const row = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-part="pick-row"]')).find((r) =>
    r.querySelector(".wl-uf08__pick-name")?.textContent?.startsWith(name),
  )!;
const addIn = (r: HTMLElement) => r.querySelector<HTMLButtonElement>('[data-part="pick-add"]');
const reason = (r: HTMLElement) => r.querySelector('[data-part="pick-reason"]')?.textContent;
const lead = () => document.querySelector(".wl-uf08__sheet-lead")!.textContent;
const statusLine = () => document.querySelector('[data-part="sheet-status"]')!.textContent;
const sections = () => Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);

const search = (q: string) =>
  fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value: q } });

beforeEach(() => {
  lists.excluded = [];
  lists.favorites = [];
  setOnline(false);
  serveCache();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AC1 lead line", () => {
  it.each([
    [945, "15 min left"],
    [165, "2 min left"],
    [975, "16 min left"],
    [45, "No time left"],
  ])("leftS %i reads %s", async (leftS, text) => {
    renderSheet({ leftS });
    await ready();
    expect(lead()).toBe(text);
  });
});

describe("AC2 empty query", () => {
  it("Favorites first, then Today's areas in the fixed order, no Suggested, no Start with this", async () => {
    lists.favorites = ["lat-pulldown"];
    renderSheet({ skippedItems: [2] });
    await ready();
    const h = sections();
    expect(h.slice(0, 3)).toEqual(["Add exercise", "Favorites", "Today's areas"]);
    // The plan's primary areas: chest, back, quads. The skipped item's area counts.
    expect(h.slice(3)).toEqual(["Chest", "Back", "Quads"]);
    expect(h).not.toContain("Suggested");
    expect(screen.queryByText(/start with this/i)).toBeNull();
    expect(document.querySelector('[data-part="pick-start"]')).toBeNull();
  });

  it("zero favorites: no Favorites section", async () => {
    renderSheet();
    await ready();
    expect(sections()).not.toContain("Favorites");
    expect(sections()).toContain("Today's areas");
    expect(screen.queryByText(/start with this/i)).toBeNull();
  });
});

describe("AC3 search", () => {
  it("raise matches case-insensitively, by name then id", async () => {
    renderSheet();
    await ready();
    fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value: "RAISE" } });
    const names = Array.from(document.querySelectorAll(".wl-uf08__pick-name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!, "en")));
    expect(names).toEqual(["Calf raise", "Hanging knee raise", "Lateral raise"]);
  });
  it("zzz has the no-match line", async () => {
    renderSheet();
    await ready();
    fireEvent.change(screen.getByLabelText("Search exercises"), { target: { value: "zzz" } });
    expect(screen.getByText("No exercises match “zzz”.")).toBeTruthy();
  });
});

describe("AC4/AC5 plan rows", () => {
  it("Inverted row is In this workout with an inert Add; skipped reads Skipped", async () => {
    const a = renderSheet();
    await ready();
    expect(reason(row("Inverted row"))).toBe("In this workout");
    const btn = addIn(row("Inverted row"))!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    a.unmount();
    renderSheet({ skippedItems: [1] });
    await ready();
    expect(reason(row("Inverted row"))).toBe("Skipped in this workout");
  });

  it("an exercise with logged sets that is no longer an item is In this workout", async () => {
    renderSheet({
      plan: planOf("db-bench-press", "inverted-row"),
      loggedSets: [{ exerciseId: "bench-press" }, { exerciseId: "bench-press" }],
    });
    await ready();
    search("bench");
    expect(reason(row("Bench press"))).toBe("In this workout");
    expect(addIn(row("Bench press"))!.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("AC6 reasons", () => {
  it("Excluded, equipment and level, with no Plan pointer", async () => {
    lists.excluded = ["barbell-row"];
    serveCache(() =>
      fCache({
        profile: fProfile({
          equipment: ["barbell", "bench", "rack", "dumbbell", "machine", "pullup-bar"],
        }),
      }),
    );
    renderSheet();
    await ready();
    expect(reason(row("Barbell row"))).toBe("Excluded");
    expect(reason(row("Lat pulldown"))).toBe("Not available with your equipment");
    expect(reason(row("Pull up"))).toBe("Above your level");
    expect(document.body.textContent).not.toMatch(/Plan ›|Edit plan|Include it again/);
  });
});

describe("AC7 recovery at started_at", () => {
  const T0 = Date.parse(STARTED);
  it("sets in this workout never block; 24 h before does", async () => {
    serveCache(() =>
      fCache({
        history: [
          ...sets("bench-press", 4, T0 - 24 * HOUR),
          ...sets("bench-press", 2, T0 + 600_000),
          ...sets("back-squat", 6, T0 - 24 * HOUR),
        ],
      }),
    );
    renderSheet({ plan: planOf("bench-press", "inverted-row") });
    await ready();
    search("e");
    expect(addIn(row("Db bench press"))!.getAttribute("aria-disabled")).toBeNull();
    expect(reason(row("Db bench press"))).toBeUndefined();
    expect(reason(row("Leg extension"))).toBe("Quads is recovering");
  });
});

describe("AC8 accessibility names", () => {
  it("disabled rows are aria-disabled with the reason; addable names are unique", async () => {
    lists.favorites = ["lat-pulldown"];
    renderSheet({ plan: planOf("bench-press", "hip-thrust", "leg-extension") });
    await ready();
    const r = row("Leg extension");
    const btn = addIn(r)!;
    expect(btn.hasAttribute("disabled")).toBe(false);
    const why = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(why.textContent).toBe("In this workout");
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    const adds = names.filter((n) => n!.startsWith("Add "));
    expect(new Set(adds).size).toBe(adds.length);
    expect(adds).toContain("Add Lat pulldown");
    // Back squat's primary areas are Glutes and Quads; the plan has glutes (hip-thrust) and, via
    // leg-extension, quads: it shows under both sections, so both names carry the area.
    expect(adds).toContain("Add Back squat, Glutes");
    expect(adds).not.toContain("Add Back squat");
  });
});

describe("AC9 added", () => {
  it("closes with the success and shows no success line", async () => {
    const added: AddInWorkoutResult = {
      status: "added",
      name: "Lateral raise",
      afterName: "Bench press",
    };
    const { onClose, onAdd } = renderSheet({ onAdd: vi.fn(async () => added) });
    await ready();
    search("lateral");
    fireEvent.click(screen.getByRole("button", { name: "Add Lateral raise" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(added));
    expect(onAdd).toHaveBeenCalledWith("lateral-raise");
    expect(statusLine()).toBe("");
  });
});

describe("AC10 refusals", () => {
  it.each([
    [
      { status: "refused", reason: "time", leftS: 165 },
      "Lateral raise doesn't fit in the 2 min left.",
      "2 min left",
    ],
    [
      { status: "refused", reason: "time", leftS: 45 },
      "Lateral raise doesn't fit. No time left.",
      "No time left",
    ],
    [
      { status: "refused", reason: "items_cap", leftS: 900 },
      "This workout has 8 exercises, the most it can hold.",
      "15 min left",
    ],
  ] as const)("%j", async (result, text, leadText) => {
    const { onClose } = renderSheet({ onAdd: vi.fn(async () => result as AddInWorkoutResult) });
    await ready();
    search("lateral");
    fireEvent.click(screen.getByRole("button", { name: "Add Lateral raise" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(text));
    expect(onClose).not.toHaveBeenCalled();
    expect(lead()).toBe(leadText);
  });
});

describe("AC11 failed", () => {
  it("stays open with a role=alert line", async () => {
    const { onClose } = renderSheet({
      onAdd: vi.fn(async () => ({ status: "failed" }) as AddInWorkoutResult),
    });
    await ready();
    search("lateral");
    fireEvent.click(screen.getByRole("button", { name: "Add Lateral raise" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't add Lateral raise. Try again.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("AC12 self-contained (no SessionSetup in the tree)", () => {
  it("root, CSS import, 44 px buttons and axe", async () => {
    lists.favorites = ["lat-pulldown"];
    const { container } = renderSheet();
    await ready();
    const root = container.firstElementChild as HTMLElement;
    expect(root.matches('.wl-uf08[data-wl-state="plan"]')).toBe(true);
    expect(root.classList.contains("wl-uf08__add-sheet")).toBe(true);
    expect(document.querySelector("[data-screen-id='UF-09.10']")).not.toBeNull();
    const src = readFileSync(resolve(__dirname, "../AddExerciseInWorkout.tsx"), "utf8");
    expect(src).toMatch(/^import "\.\/uf-08\.css";$/m);

    // The shipped CSS gives 44 px to every button: the Add rule is scoped under `.wl-uf08`, so it
    // only applies because the root carries that class.
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    expect(css).toMatch(
      /\.wl-uf08\[data-wl-state\] \.wl-uf08__pick-add \{[^}]*min-block-size: 44px;[^}]*min-inline-size: 96px/,
    );
    expect(css).toMatch(
      /\.wl-uf08__icon[^{]*\{[^}]*(min-width|min-block-size|min-inline-size): 44px/,
    );
    const addButtons = document.querySelectorAll('[data-part="pick-add"]');
    expect(addButtons.length).toBeGreaterThan(5);
    for (const b of addButtons) expect(b.closest('.wl-uf08[data-wl-state="plan"]')).not.toBeNull();
    for (const b of document.querySelectorAll(".wl-uf08__icon"))
      expect(b.closest('.wl-uf08[data-wl-state="plan"]')).not.toBeNull();

    expect(
      (
        await axe.run(container, { rules: { "color-contrast": { enabled: false } } })
      ).violations.map((v) => v.id),
    ).toEqual([]);
  });
});

describe("AC14 offline", () => {
  it("renders the same rows offline as online", async () => {
    lists.favorites = ["lat-pulldown"];
    setOnline(true);
    const norm = (html: string) => html.replace(/_r_[0-9a-z]+_/g, "ID");
    const a = renderSheet();
    await ready();
    const online = norm(a.container.innerHTML);
    a.unmount();
    setOnline(false);
    const b = renderSheet();
    await ready();
    await settle(10);
    expect(norm(b.container.innerHTML)).toBe(online);
    expect(within(row("Lat pulldown")).getByRole("button")).toBeTruthy();
  });
});
