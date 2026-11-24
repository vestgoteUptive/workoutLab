// T-0573 UF-08.5 Add exercise (part 1): the sheet's open, search and close behaviour, reached from
// UF-08.6 since T-0998. AC3-AC7 and AC9 (pins, re-suggest around an Add, Shuffle) are retired by
// D-0274 §5; the local Add is tested in area-detail.test.tsx (T-0997 AC5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router";
import { SessionSetup } from "../SessionSetup.js";
import {
  AREA_PLAN_PROPS,
  fitLine,
  openAddSheetFromArea,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);

beforeEach(async () => {
  auth.status = "signed-in";
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog");

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

/** UF-08.1 → `minutes` (30 by default) → Suggest: R7-E4 at 30 min. */
async function toPlan(minutes = 30): Promise<void> {
  renderSetup();
  await loaded();
  if (minutes === 30) fireEvent.click(button("30 minutes"));
  else for (let m = 45; m > minutes; m -= 5) fireEvent.click(button("5 minutes less"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

// T-0998: the sheet opens from UF-08.6 (Chest first, so the areas read Chest, Back, Quads).
function openSheet(): void {
  openAddSheetFromArea("chest");
}

describe("AC1 open, empty query", () => {
  it("focus in search; Today's areas Chest, Back, Quads; In this workout rows; Escape returns focus", async () => {
    await toPlan();
    fireEvent.click(
      document.querySelector<HTMLElement>(
        '[data-part="area-row"][data-area="chest"] [data-part="area-open"]',
      )!,
    );
    const opener = button("Add exercise");
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(opener);
    expect(screenIds()).toEqual(["UF-08.6", "UF-08.5"]);
    const sheet = within(dialog());
    expect(sheet.getByLabelText("Search exercises")).toHaveFocus();
    expect(sheet.getByText(/^\d+ of 30 min left\.$/)).toBeInTheDocument();
    const areas = sheet
      .getAllByRole("region")
      .map((r) => within(r).getByRole("heading", { level: 2 }).textContent);
    expect(areas).toEqual(["Chest", "Back", "Quads"]);
    const quads = within(sheet.getByRole("region", { name: "Quads" }));
    expect(quads.getByRole("button", { name: "Add Back squat" })).toBeInTheDocument();
    const leg = quads.getByText("Leg extension").closest("li")!;
    expect(within(leg).getByText("In this workout")).toBeInTheDocument();
    expect(within(leg).queryByRole("button")).toBeNull();
    const bench = sheet.getByRole("region", { name: "Chest" });
    const benchRow = within(bench).getByText("Bench press").closest("li")!;
    expect(within(benchRow).getByText("In this workout")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("Close closes it and returns focus to Add exercise", async () => {
    await toPlan();
    openSheet();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button("Add exercise")).toHaveFocus();
  });
});

describe("AC2 search", () => {
  it("SQU lists exercise rows by name, no warm-up; zzz says nothing matches", async () => {
    await toPlan();
    openSheet();
    const search = within(dialog()).getByLabelText("Search exercises");
    fireEvent.change(search, { target: { value: "SQU" } });
    const names = Array.from(dialog().querySelectorAll(".wl-uf08__pick-name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Back squat"]);
    expect(within(dialog()).queryByText(/Wu bodyweight squat/)).toBeNull();
    fireEvent.change(search, { target: { value: "p" } });
    const many = Array.from(dialog().querySelectorAll(".wl-uf08__pick-name")).map(
      (n) => n.textContent!,
    );
    expect(many.length).toBeGreaterThan(3);
    expect(many).toEqual([...many].sort((a, b) => a.localeCompare(b, "en")));
    expect(many.every((n) => n.toLowerCase().includes("p"))).toBe(true);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(dialog()).getByText("No exercises match “zzz”.")).toBeInTheDocument();
  });
});

// ---- Review fixes ----
let nav: NavigateFunction | null = null;
function NavProbe() {
  nav = useNavigate();
  return null;
}
function renderWithNav(): void {
  render(
    <MemoryRouter initialEntries={["/session/setup"]}>
      <NavProbe />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...AREA_PLAN_PROPS} />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function toPlanWithNav(): Promise<void> {
  renderWithNav();
  await loaded();
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  spy.mockClear();
}

describe("browser Back closes the sheet", () => {
  it("a history pop closes UF-08.5, returns focus to Add exercise and stays on UF-08.6", async () => {
    await toPlanWithNav();
    openSheet();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      void nav!(-1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button("Add exercise")).toHaveFocus();
    expect(screenIds()).toEqual(["UF-08.6"]);
  });
});

describe("closing is once", () => {
  it("a second Escape (or an Add after Escape) cannot pop past UF-08.6", async () => {
    await toPlanWithNav();
    openSheet();
    const search = within(dialog()).getByLabelText("Search exercises");
    const closeButton = within(dialog()).getByRole("button", { name: "Close" });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      closeButton.click();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(search).not.toBeInTheDocument();
    expect(screenIds()).toEqual(["UF-08.6"]);
    expect(button("Add exercise")).toHaveFocus();
  });
});
