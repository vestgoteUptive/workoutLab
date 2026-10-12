// T-0599 UF-08.1, UF-08.4 Cobalt plan restyle (D-0208, D-0210, D-0211). Structure and guard
// checks; the computed colours, sizes and the canvas compare are in tests/e2e/uf-08-setup.spec.ts.
// Loaders mocked; the real engine runs. Ready is rendered on its own with `upsertSession` mocked.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { upsertSession } from "../../../lib/offline/queue.js";
import { Ready } from "../Ready.js";
import { LOCALE, NOW, TZ } from "./fixtures.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";
import { wR7E4 } from "./workouts.js";

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
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));

const upsert = vi.mocked(upsertSession);
const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");

beforeEach(() => {
  auth.status = "signed-in";
  setOnline(false);
  serveCache();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const button = (name: string) => screen.getByRole("button", { name });
const screenRoot = () => document.querySelector<HTMLElement>("[data-screen-id]")!;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

function showReady() {
  return render(
    <MemoryRouter initialEntries={["/session/setup?step=ready"]}>
      <Ready workout={wR7E4()} clock={() => new Date(NOW)} locale={LOCALE} timeZone={TZ} />
    </MemoryRouter>,
  );
}

describe("AC1 the roots are plan", () => {
  it("UF-08.1 carries data-wl-state=plan and .wl-page", async () => {
    renderSetup();
    await loaded();
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(screenRoot().getAttribute("data-wl-state")).toBe("plan");
    expect(screenRoot().classList.contains("wl-page")).toBe(true);
  });

  it("UF-08.4 carries data-wl-state=plan and .wl-page", () => {
    showReady();
    expect(screenRoot().getAttribute("data-screen-id")).toBe("UF-08.4");
    expect(screenRoot().getAttribute("data-wl-state")).toBe("plan");
    expect(screenRoot().classList.contains("wl-page")).toBe(true);
  });

  it("T-0600: the legacy no-state base is gone, so no UF-08 rule is gated to a screen without a state", () => {
    expect(css).not.toMatch(/:not\(\[data-wl-state\]\)/);
    expect(css).not.toMatch(/\.wl-uf08\s*\{[^}]*padding/);
  });
});

describe("AC2 time first (principle 2)", () => {
  it("the time stepper is the first control after Close, ahead of the chips, finish time, toggle, energy and Skip", async () => {
    renderSetup();
    await loaded();
    const tabbables = Array.from(
      document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
    );
    const names = tabbables.map(
      (el) => el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? "",
    );
    expect(names.slice(0, 3)).toEqual(["Close", "5 minutes less", "5 minutes more"]);
    expect(names.indexOf("30 minutes")).toBeLessThan(names.indexOf("Set a finish time"));
    expect(names.indexOf("Set a finish time")).toBeLessThan(names.indexOf("Quads"));
  });

  it("the quick picks still set the minutes and mark one pressed", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    expect(button("30 minutes")).toHaveAttribute("aria-pressed", "true");
    expect(button("45 minutes")).toHaveAttribute("aria-pressed", "false");
    expect(button("30 minutes").classList.contains("wl-chip")).toBe(true);
  });
});

describe("AC3 Skip today chips", () => {
  it("pressed: the name is the area alone, aria-pressed true, an aria-hidden tick; unpressed: same name", async () => {
    renderSetup();
    await loaded();
    const group = screen.getByRole("group", { name: "Skip today" });
    const quads = within(group).getByRole("button", { name: "Quads" });
    expect(quads.classList.contains("wl-chip")).toBe(true);
    expect(quads).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(quads);
    const pressed = within(group).getByRole("button", { name: "Quads", pressed: true });
    expect(pressed).toBe(quads);
    expect(pressed.textContent).toBe("Quads");
    const tick = pressed.querySelector(".wl-chip__tick");
    expect(tick).not.toBeNull();
    expect(tick!.getAttribute("aria-hidden")).toBe("true");
    // The unpressed chips carry the same tick node, hidden by the shared chip rule.
    const calves = within(group).getByRole("button", { name: "Calves" });
    expect(calves.querySelector(".wl-chip__tick")).not.toBeNull();
    expect(calves).toHaveAttribute("aria-pressed", "false");
  });
});

describe("AC4 toggles keep role and name", () => {
  it("UF-08.1: the warm-up toggle is a checkbox in a .wl-toggle label and still flips", async () => {
    renderSetup();
    await loaded();
    const box = screen.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" });
    expect(box.closest("label")!.classList.contains("wl-toggle")).toBe(true);
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("UF-08.4: the three settings are checkboxes in .wl-toggle labels", () => {
    showReady();
    for (const name of ["Sound cues", "Voice countdown 3-2-1", "Keep screen awake"]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box.closest("label")!.classList.contains("wl-toggle")).toBe(true);
    }
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("energy is a radiogroup of three radios in a .wl-segmented", async () => {
    renderSetup();
    await loaded();
    const group = screen.getByRole("radiogroup");
    expect(group.querySelector(".wl-segmented")).not.toBeNull();
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(["low", "normal", "high"]);
  });
});

describe("AC5 one primary, error forms", () => {
  it("UF-08.1 has exactly one .wl-button--primary, the Suggest button", async () => {
    renderSetup();
    await loaded();
    const primaries = document.querySelectorAll(".wl-button--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(button("Suggest my workout"));
  });

  it("UF-08.4 has exactly one .wl-button--primary, Start", () => {
    showReady();
    const primaries = document.querySelectorAll(".wl-button--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(button("Start"));
  });

  it("the finish-time field is a .wl-input; the rejection line is the plan error form, shown then gone", async () => {
    renderSetup();
    await loaded();
    expect(screen.queryByText("Pick a time later today")).toBeNull();
    fireEvent.click(button("Set a finish time"));
    const input = screen.getByLabelText("Finish by");
    expect(input.classList.contains("wl-input")).toBe(true);
    fireEvent.change(input, { target: { value: "11:30" } });
    const error = screen.getByText("Pick a time later today");
    expect(error.classList.contains("wl-input__error")).toBe(true);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    fireEvent.change(input, { target: { value: "13:07" } });
    expect(screen.queryByText("Pick a time later today")).toBeNull();
  });

  it("UF-08.4 start error: hidden at first, then the alert in the same error form", async () => {
    upsert.mockRejectedValue(new Error("idb"));
    showReady();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(button("Start"));
    const alert = await screen.findByRole("alert");
    expect(alert.classList.contains("wl-input__error")).toBe(true);
    expect(alert).toHaveTextContent("Couldn't start the workout. Try again.");
  });

  it("a disabled Suggest stays focusable, names its reason, and is not an error", () => {
    renderSetup();
    // Before the data is read the fit line says it is checking, and Suggest is aria-disabled.
    const suggest = button("Suggest my workout");
    expect(suggest).toHaveAttribute("aria-disabled", "true");
    expect(suggest).not.toBeDisabled();
    const line = document.querySelector('[data-part="fit-line"]')!;
    expect(suggest.getAttribute("aria-describedby")).toBe(line.id);
    expect(line).toHaveTextContent("Checking what fits…");
  });
});

describe("AC6 guards on uf-08.css", () => {
  it("no px font size and no raw colour anywhere in the file", () => {
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/);
  });

  it("the plan block has no transition, and the file's only one is Reorder's, off under reduced motion", () => {
    const start = css.indexOf("t-0599-plan-start");
    const end = css.indexOf("t-0599-plan-end");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(start, end)).not.toMatch(/transition|animation/);
    const transitions = css.match(/^\s*transition:[^;]*;/gm) ?? [];
    expect(transitions.map((t) => t.trim())).toEqual([
      "transition: background-color 150ms;",
      "transition: none;",
    ]);
  });

  it("the plan rules sit under .wl-uf08[data-wl-state], so load order cannot beat the shared ones", () => {
    const start = css.indexOf("t-0599-plan-start");
    const end = css.indexOf("t-0599-plan-end");
    const block = css.slice(start, end);
    const overrides = block.match(/^\.wl-uf08\[data-wl-state\][^{]*\{/gm) ?? [];
    expect(overrides.length).toBeGreaterThanOrEqual(6);
    // The unboxed card: UF-08 adds no box to .wl-card under a state.
    expect(css).not.toMatch(/\.wl-uf08__card\s*\{[^}]*(background|border|padding)/);
  });
});

describe("AC7 behaviour unchanged", () => {
  it("'Nothing fits' is a plain line, not an alert", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    const group = screen.getByRole("group", { name: "Skip today" });
    for (const b of within(group).getAllByRole("button")) fireEvent.click(b);
    await settle();
    const line = fitLine();
    expect(line).toHaveTextContent("Nothing fits in 30 min");
    expect(line.getAttribute("role")).toBeNull();
    expect(line.classList.contains("wl-input__error")).toBe(false);
    expect(line.classList.contains("wl-uf08__error")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
