// T-0605 (D-0208, D-0210, D-0211, D-0213; UF-01.1–UF-01.4): the Cobalt plan-state markup of the
// four onboarding steps. The computed look (colours, sizes, contrast, motion) is proven in a real
// browser in `tests/e2e/uf-01-onboarding.spec.ts`; this file proves the DOM contract and the
// stylesheet rules that jsdom can read.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth/client.js", async () => (await import("./client-mock.js")).clientMock());

const { KEY, findScreen, mountAt } = await import("./harness.js");

const CSS = readFileSync(resolve(__dirname, "../uf-01.css"), "utf8");

const RETURNING = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 2,
  rhythmMax: 5,
  startedAtMs: null,
  timingMs: null,
  planShown: false,
  savedAtMs: Date.now(),
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const STEPS = [
  ["/welcome", "UF-01.1"],
  ["/welcome/goal", "UF-01.2"],
  ["/welcome/level", "UF-01.3"],
  ["/welcome/schedule", "UF-01.4"],
] as const;

describe.each([
  ["a first launch", false],
  ["a returning, signed-out user", true],
])("AC1 state, %s", (_label, returning) => {
  it.each(STEPS)("%s is a plan-state page root (%s)", async (path, id) => {
    if (returning) window.localStorage.setItem(KEY, JSON.stringify(RETURNING));
    mountAt(path);
    const root = await findScreen(id);
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });
});

describe("Welcome (UF-01.1)", () => {
  it("the primary is a pill link with an aria-hidden arrow and the text button keeps its name", async () => {
    mountAt("/welcome");
    const root = await findScreen("UF-01.1");
    const primary = within(root).getByRole("link", { name: "Get started" });
    expect(primary).toHaveClass("wl-button--primary");
    expect(primary.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(root).getByRole("link", { name: "I already have an account" })).toHaveClass(
      "wl-button--text",
    );
    expect(within(root).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Train with a plan. Log in seconds.",
    );
  });
});

describe("AC2 goal options (UF-01.2)", () => {
  it("each goal is a .wl-option row on a native radio with its hint as the caption and an aria-hidden tick", async () => {
    mountAt("/welcome/goal");
    const root = await findScreen("UF-01.2");
    const group = within(root).getByRole("radiogroup", { name: "What's your main goal?" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    for (const name of ["Build muscle", "Get stronger", "General fitness"]) {
      const radio = within(group).getByRole("radio", { name }) as HTMLInputElement;
      expect(radio.type).toBe("radio");
      const label = radio.closest("label")!;
      expect(label).toHaveClass("wl-option");
      expect(label.querySelector(".wl-type-label")).not.toBeNull();
      const tick = label.querySelector(".wl-option__tick");
      expect(tick).toHaveAttribute("aria-hidden", "true");
    }
    expect(within(group).getByRole("radio", { name: "Build muscle" })).toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "Get stronger" }));
    expect(within(group).getByRole("radio", { name: "Get stronger" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Build muscle" })).not.toBeChecked();
  });

  it("Continue keeps its rule: a plain submit button that is never disabled", async () => {
    mountAt("/welcome/goal");
    const root = await findScreen("UF-01.2");
    const go = within(root).getByRole("button", { name: "Continue" });
    expect(go).toHaveClass("wl-button--primary");
    expect(go).not.toHaveAttribute("disabled");
    expect(go).toHaveAttribute("type", "submit");
  });
});

describe("Level (UF-01.3): segmented control and chips", () => {
  it("the level is a .wl-segmented on native radios", async () => {
    mountAt("/welcome/level");
    const root = await findScreen("UF-01.3");
    const group = within(root).getByRole("radiogroup", { name: "Training experience" });
    expect(group).toHaveClass("wl-segmented");
    for (const name of ["Beginner", "Intermediate", "Advanced"]) {
      const radio = within(group).getByRole("radio", { name });
      expect(radio.closest("label")!.parentElement).toBe(group);
    }
  });

  it("AC3 equipment chips keep their names; the tick is aria-hidden and the checked state is the radio", async () => {
    mountAt("/welcome/level");
    const root = await findScreen("UF-01.3");
    const group = within(root).getByRole("radiogroup", { name: "Where do you train?" });
    const names = within(group)
      .getAllByRole("radio")
      .map((r) => r.closest("label")!.textContent);
    expect(names).toEqual(["Bodyweight", "Dumbbells", "Full gym"]);
    for (const name of names) {
      const radio = within(group).getByRole("radio", { name: name! }) as HTMLInputElement;
      const chip = radio.closest("label")!;
      expect(chip).toHaveClass("wl-chip");
      expect(chip.querySelector(".wl-chip__tick")).toHaveAttribute("aria-hidden", "true");
    }
    expect(within(group).getByRole("radio", { name: "Full gym" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Dumbbells" })).not.toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "Dumbbells" }));
    expect(within(group).getByRole("radio", { name: "Dumbbells" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Full gym" })).not.toBeChecked();
  });
});

describe("Schedule (UF-01.4)", () => {
  it("the steppers and the plan rows: aria-disabled never the attribute, the plan is unboxed .wl-row", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ ...RETURNING, rhythmMin: 1, rhythmMax: 7 }));
    mountAt("/welcome/schedule");
    const root = await findScreen("UF-01.4");
    const buttons = within(root).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    for (const b of buttons) expect(b).not.toHaveAttribute("disabled");
    expect(
      within(root).getByRole("button", { name: "One fewer session per week, minimum" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(root).getByRole("button", { name: "One more session per week, maximum" }),
    ).toHaveAttribute("aria-disabled", "true");
    const rows = root.querySelectorAll("[data-area]");
    expect(rows).toHaveLength(9);
    for (const row of rows) expect(row).toHaveClass("wl-row");
    const save = within(root).getByRole("link", { name: "Save my plan" });
    expect(save).toHaveClass("wl-button--primary");
    expect(root.lastElementChild).toBe(save);
  });
});

describe("AC6 stylesheet guards (uf-01.css)", () => {
  const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)].map(
    (m) => ({ selector: m[1]!.trim(), body: m[2]! }),
  );

  it("has no px font size and no raw colour", () => {
    expect(CSS).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(CSS).not.toMatch(/font:\s*[^;]*\d+px/);
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/\b(rgba?|hsla?|oklch|color-mix)\(/);
  });

  it("does not restyle the shared unboxed rows, options, chips, segments or buttons", () => {
    // main.css owns these; this file loads later and would win an equal-specificity tie. The
    // only properties it may set on them are ones the shared rules leave alone.
    const shared = /\.(wl-option|wl-chip|wl-segmented|wl-row|wl-card|wl-button--[a-z-]+)\b/;
    const allowed = new Set([
      "inline-size",
      "flex",
      "margin-block-start",
      "align-self",
      "position",
      "inset-block-end",
      "z-index",
    ]);
    for (const { selector, body } of rules) {
      if (!shared.test(selector)) continue;
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]!);
      for (const p of props) expect(allowed.has(p), `${selector} sets ${p}`).toBe(true);
    }
  });

  it("uses no transition or animation", () => {
    expect(CSS).not.toMatch(/\b(transition|animation)\s*:/);
  });
});

it("every plan-state control is reachable by role with no name change (spot check)", async () => {
  mountAt("/welcome/goal");
  await findScreen("UF-01.2");
  expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/welcome");
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
});
