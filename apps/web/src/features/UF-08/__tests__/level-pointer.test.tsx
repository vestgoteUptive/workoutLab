// T-0684 UF-08.5 Add exercise: the above-level line points to Plan › Edit plan in text only
// (D-0231 §1; docs/specs/editable-level.md AC10, AC11). No link leaves setup: that would discard
// the visit (D-0109). A saved level change reaches UF-08.5 through the cached profile alone.
// Loaders mocked; the real engine runs behind a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { fProfile } from "./fixtures.js";
import {
  fCache,
  fitLine,
  location,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
} from "./harness.js";

const net = vi.hoisted(() => ({ online: false }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: [], loaded: true }),
  useOnline: () => net.online,
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const LINE = "Above your level. Change it in Plan › Edit plan.";
const spy = vi.mocked(suggest);
const fetchSpy = vi.fn(async () => new Response("{}"));

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  net.online = false;
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog");
const lastWorkout = () => spy.mock.results.at(-1)!.value as Workout;

async function openPullUp(online: boolean, level?: "intermediate" | "advanced"): Promise<void> {
  net.online = online;
  setOnline(online);
  if (level !== undefined) serveCache(() => fCache({ profile: fProfile({ level }) }));
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
  fireEvent.click(button("30 minutes"));
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  expect(lastWorkout().plan.items.map((i) => i.exerciseId)).not.toContain("pull-up");
  spy.mockClear();
  fireEvent.click(button("Add exercise"));
  fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
    target: { value: "Pull up" },
  });
}

function pullUpRow(): HTMLElement {
  const row = dialog().querySelector<HTMLElement>('[data-part="pick-row"][data-id="pull-up"]');
  if (row === null) throw new Error("no Pull up row");
  return row;
}

/** AC1: the exact line, both actions aria-disabled and described by it, a tap does nothing. */
function expectLine(): void {
  const row = pullUpRow();
  const reason = row.querySelector<HTMLElement>('[data-part="pick-reason"]');
  expect(reason?.textContent).toBe(LINE);
  expect(reason!.id).not.toBe("");
  const actions = [
    within(row).getByRole("button", { name: "Add Pull up" }),
    within(row).getByRole("button", { name: "Start with Pull up" }),
  ];
  for (const action of actions) {
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveAttribute("aria-describedby", reason!.id);
    expect(document.getElementById(action.getAttribute("aria-describedby")!)).toBe(reason);
    fireEvent.click(action);
    expect(spy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  }
}

/** AC2: no link out, no Plan/level button but the disabled actions, the line is inert. */
function expectNoWayOut(): void {
  const d = dialog();
  const row = pullUpRow();
  expect(within(row).queryAllByRole("link")).toHaveLength(0);
  expect(row.querySelector("a")).toBeNull();
  const planLinks = within(d)
    .queryAllByRole("link")
    .filter((a) => (a.getAttribute("href") ?? "").includes("/plan"));
  expect(planLinks).toHaveLength(0);
  expect(d.querySelector('a[href*="/plan"]')).toBeNull();
  const disabled = new Set(
    within(row)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-disabled") === "true"),
  );
  const offenders = within(d)
    .getAllByRole("button")
    .filter((b) => /plan|level/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""))
    .filter((b) => !disabled.has(b));
  expect(offenders).toHaveLength(0);
  const before = location();
  fireEvent.click(within(row).getByText(LINE));
  expect(location()).toEqual(before);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}

describe("T-0684 UF-08.5 above-level pointer", () => {
  it("T-0684 AC1 offline, beginner: Pull up reads the pointer line; Add and Start with this are aria-disabled and described by it; a tap calls nothing", async () => {
    await openPullUp(false);
    expectLine();
  });

  it("T-0684 AC2 offline: no link or anchor in the row, no /plan link, no Plan/level button, the line is inert", async () => {
    await openPullUp(false);
    expectNoWayOut();
  });

  it("T-0684 AC3 online: the same line and the same no-way-out", async () => {
    await openPullUp(true);
    expectLine();
    expectNoWayOut();
  });

  it("T-0684 AC4 cached profile at intermediate, offline: no line, Add enabled, the re-suggested plan includes pull-up", async () => {
    await openPullUp(false, "intermediate");
    const row = pullUpRow();
    expect(within(row).queryByText(/Above your level/)).toBeNull();
    expect(row.querySelector('[data-part="pick-reason"]')).toBeNull();
    const add = within(row).getByRole("button", { name: "Add Pull up" });
    expect(add).not.toHaveAttribute("aria-disabled");
    expect(add).not.toHaveAttribute("aria-describedby");
    fireEvent.click(add);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalled();
    expect(lastWorkout().plan.items.map((i) => i.exerciseId)).toContain("pull-up");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("T-0684 AC5 advanced: Pull up has no line", async () => {
    await openPullUp(false, "advanced");
    const row = pullUpRow();
    expect(within(row).queryByText(/Above your level/)).toBeNull();
    expect(row.querySelector('[data-part="pick-reason"]')).toBeNull();
    expect(within(row).getByRole("button", { name: "Add Pull up" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });
});
