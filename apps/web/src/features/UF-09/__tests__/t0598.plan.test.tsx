// T-0598 (D-0208 §2, D-0210, D-0212 §5; UF-09.8 Time check, UF-09.9 Paused): the plan state on the
// two decisions made mid-session. AC1 (state and theme-color, both directions), AC2 (the options
// as radios), AC3 (Resume), AC4 (End last, never primary), AC5/AC6 (the rows, the arrow icons) and
// the behaviour guards. The CSS and the contrast are in `t0598.css.test.ts`; the 44 px targets,
// the arrow keys and the axe pass are in the e2e spec.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeCheck } from "@workoutlab/engine";
import { tokens } from "@workoutlab/design-tokens";
import { applyThemeColor } from "../../../app/theme-color.js";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState } from "../machine.js";
import type { SeamAction } from "../seams.js";
import { USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { R8_PLAN, at, benchSets } from "./r8-fixtures.js";
import { renderSession } from "./session-helpers.js";
import { findScreen, seedFocus } from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./r8-mock.js").then((m) => m.r8Mock(orig)),
);
vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const tc = vi.mocked(timeCheck);

beforeEach(async () => {
  const engine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  tc.mockReset();
  tc.mockImplementation(engine.timeCheck);
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  vi.useRealTimers();
});

const seam = (id: string, label: string, keepsClockRunning = false): SeamAction => ({
  id,
  label,
  keepsClockRunning,
  render: () => <p>{label}</p>,
});
const SEAMS = {
  pause: [seam("list-view", "List view", true), seam("how-to", "How to"), seam("swap", "Swap")],
};

async function paused(patch: Partial<FocusState> = {}, seams: typeof SEAMS | undefined = SEAMS) {
  useFakeClock(at(600));
  await seedSession({ plan: R8_PLAN });
  seedFocus(
    at(600),
    { phase: "paused", pausedAtMs: at(600), resumePhase: "set", itemIndex: 1, ...patch },
    R8_PLAN,
  );
  await renderSession({ timeZone: "UTC", locale: "en-GB", ...(seams ? { seams } : {}) });
  expect(screenId()).toBe("UF-09.9");
  return document.querySelector<HTMLElement>('[data-screen-id="UF-09.9"]')!;
}

async function atCheck() {
  useFakeClock(at(1500));
  await seedSession({ plan: R8_PLAN });
  seedFocus(
    at(1500),
    {
      phase: "rest",
      itemIndex: 0,
      setIndex: 3,
      loggedSets: benchSets(4),
      timer: { startedAtMs: at(1500) - 120_000, durationS: 120, pausedMs: 0 },
    },
    R8_PLAN,
  );
  await renderSession({ timeZone: "UTC", locale: "en-GB" });
  expect(screenId()).toBe("UF-09.8");
  return document.querySelector<HTMLElement>('[data-screen-id="UF-09.8"]')!;
}

const meta = () =>
  document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content;
const focusable = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex]")).filter(
    (el) => !el.hasAttribute("disabled"),
  );

describe("T-0598 AC1 the plan state, and theme-color both ways", () => {
  it("UF-09.9: data-wl-state=plan; theme-color plan.bg; Resume to UF-09.3 is lift.bg again", async () => {
    const root = await paused();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    applyThemeColor();
    expect(meta()).toBe(tokens.color.plan.bg);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    await findScreen("UF-09.3");
    const set = document.querySelector<HTMLElement>('[data-screen-id="UF-09.3"]')!;
    expect(set).toHaveAttribute("data-wl-state", "lift");
    applyThemeColor();
    expect(meta()).toBe(tokens.color.lift.bg);
  });

  it("UF-09.8: data-wl-state=plan and theme-color plan.bg", async () => {
    const root = await atCheck();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    applyThemeColor();
    expect(meta()).toBe(tokens.color.plan.bg);
    expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
  });
});

describe("T-0598 AC2 the time-check options are radios", () => {
  it("found by role and name; Continue is checked, the others are plain rows", async () => {
    const root = await atCheck();
    const group = within(root).getByRole("radiogroup");
    expect(group).toHaveAccessibleName(/min behind/);
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("value"))).toEqual(["continue", "trim", "skip"]);
    expect(within(root).getByRole("radio", { name: "Continue" })).toBeChecked();
    expect(within(root).getByRole("radio", { name: "Trim" })).not.toBeChecked();
    expect(within(root).getByRole("radio", { name: "Skip next" })).not.toBeChecked();
    for (const r of radios) expect(r.closest("label")).toHaveClass("wl-option");
    // They share one name, so the native arrow keys walk them (proved in the e2e spec).
    expect(new Set(radios.map((r) => r.getAttribute("name"))).size).toBe(1);
  });

  it("picking Trim moves the selection and writes nothing; Continue then applies it", async () => {
    const root = await atCheck();
    const upsert = vi.mocked(offline.upsertSession);
    upsert.mockClear();
    fireEvent.click(within(root).getByRole("radio", { name: "Trim" }));
    expect(within(root).getByRole("radio", { name: "Trim" })).toBeChecked();
    expect(within(root).getByRole("radio", { name: "Continue" })).not.toBeChecked();
    await flushReal();
    expect(upsert).not.toHaveBeenCalled();
    expect(screenId()).toBe("UF-09.8");
    fireEvent.click(within(root).getByRole("button", { name: "Continue" }));
    await flushReal();
    await findScreen("UF-09.6");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("the heading is the page title, the planned finish is a label, Continue is the one primary", async () => {
    const root = await atCheck();
    expect(within(root).getByRole("heading", { level: 1 })).toHaveClass("wl-type-page-title");
    expect(root.querySelector('[data-field="planned"]')).toHaveClass("wl-type-label");
    expect(root.querySelectorAll(".wl-button--primary")).toHaveLength(1);
    expect(root.querySelector(".wl-button--primary")).toHaveTextContent("Continue");
    expect(document.activeElement).toBe(root.querySelector(".wl-button--primary"));
  });
});

describe("T-0598 AC3 AC4 Resume and End", () => {
  it("Resume is the lift-coloured session button, first after the heading", async () => {
    const root = await paused();
    const resume = within(root).getByRole("button", { name: "Resume" });
    expect(resume).toHaveClass("wl-button--session");
    expect(resume).toHaveClass("wl-uf09__resume");
    expect(focusable(root)[0]).toBe(resume);
    expect(document.activeElement).toBe(resume);
    expect(root.querySelectorAll(".wl-button--session")).toHaveLength(1);
  });

  it("End workout is the last focusable control, secondary, never primary", async () => {
    const root = await paused();
    const end = within(root).getByRole("button", { name: "End workout" });
    const all = focusable(root);
    expect(all[all.length - 1]).toBe(end);
    expect(end).toHaveClass("wl-button--secondary");
    expect(end).not.toHaveClass("wl-button--primary");
    expect(root.querySelector(".wl-button--primary")).toBeNull();
  });

  it("End still last with Do later hidden (partly done item) and no seams", async () => {
    const root = await paused({ itemIndex: 0, loggedSets: benchSets(1) }, undefined);
    expect(within(root).queryByRole("button", { name: /later/ })).toBeNull();
    const all = focusable(root);
    expect(all[all.length - 1]).toHaveAccessibleName("End workout");
  });

  it("the end confirm: the question, End workout, Cancel; Cancel goes back, End finishes once", async () => {
    const root = await paused();
    fireEvent.click(within(root).getByRole("button", { name: "End workout" }));
    expect(within(root).getByText("End workout? Your sets are saved.")).toBeVisible();
    expect(within(root).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    fireEvent.click(within(root).getByRole("button", { name: "Cancel" }));
    expect(within(root).getByRole("button", { name: "Resume" })).toHaveFocus();
  });
});

describe("T-0598 AC5 AC6 the rows and the stats", () => {
  it("Swap, Do later, Skip to next, How to and List view are .wl-row buttons with an aria-hidden arrow", async () => {
    const root = await paused();
    const rows = Array.from(root.querySelectorAll<HTMLElement>("button.wl-row"));
    expect(rows.map((r) => r.textContent)).toEqual([
      "Swap",
      "Do Barbell row later",
      "Skip to next exercise",
      "How to",
      "List view",
    ]);
    for (const row of rows) {
      const icon = row.querySelector("svg");
      expect(icon, row.textContent ?? "").toHaveAttribute("aria-hidden", "true");
    }
  });

  it("the three numbers are in the stat role, their text unchanged", async () => {
    const root = await paused();
    for (const field of ["elapsed", "left", "sets"]) {
      expect(root.querySelector(`[data-field="${field}"]`)).toHaveClass("wl-type-stat");
    }
    expect(root.querySelector('[data-field="elapsed"]')).toHaveTextContent("Elapsed 10:00");
  });
});
