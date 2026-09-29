// T-0307a: the "stubbed" ACs — A5, A10, A11, A13, A14, A15, A19 and A20.
//
// "Stubbed" means a fixed `BalanceResult` handed straight to the component: no engine, no
// IndexedDB, no loader. These are the tests that prove the UI **computes nothing** (principle 3).
// Each one deliberately hands the screen a value it could have derived for itself, and asserts
// the screen prints what it was given rather than what it could have worked out.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { AreaBalance } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import {
  AREA_ORDER,
  EXERCISE_NAMES,
  LOCALE,
  NOW,
  TZ,
  areaBalance,
  balanceResult,
  zeroAreas,
} from "./fixtures.js";
import {
  BalanceTree,
  location,
  mapButton,
  mapButtonFill,
  mapButtonValue,
  outlinedRowAreas,
  renderBalance,
  row,
  rowAreas,
  rowBarWidth,
  rowFill,
  rowValue,
} from "./test-helpers.js";

const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };

/** Renders a stub, so nothing is awaited and nothing reads IndexedDB. */
function renderStub(areas: AreaBalance[], options: { at?: string } = {}) {
  return renderBalance({ ...at, result: balanceResult(areas), ...options });
}

describe("AC-A5 engine order — the UI does not sort", () => {
  // The ticket's fixture: NOT `AREAS` order, NOT alphabetical, and with two deficit ties
  // (chest/back at .5, then five areas at .2) so a stable sort by deficit would also reorder.
  const ORDERED: AreaBalance[] = [
    areaBalance("calves", { needsAttention: true, deficit: 0.9, load: 1, coverageStep: 1 }),
    areaBalance("hamstrings", { needsAttention: true, deficit: 0.8, load: 3, coverageStep: 1 }),
    areaBalance("chest", { deficit: 0.5, load: 10, coverageStep: 3 }),
    areaBalance("back", { deficit: 0.5, load: 10, coverageStep: 3 }),
    areaBalance("shoulders", { deficit: 0.2, load: 13, coverageStep: 3 }),
    areaBalance("arms", { deficit: 0.2, load: 10, coverageStep: 3 }),
    areaBalance("core", { deficit: 0.2, load: 10, coverageStep: 3 }),
    areaBalance("glutes", { deficit: 0.2, load: 16, coverageStep: 3 }),
    areaBalance("quads", { deficit: 0.2, load: 16, coverageStep: 3 }),
  ];

  const EXPECTED = [
    "calves",
    "hamstrings",
    "chest",
    "back",
    "shoulders",
    "arms",
    "core",
    "glutes",
    "quads",
  ];

  it("renders the nine rows in exactly the stub's order", () => {
    renderStub(ORDERED);
    expect(rowAreas()).toEqual(EXPECTED);
  });

  it("only calves and hamstrings carry the attention outline — asserted as the exact set", () => {
    renderStub(ORDERED);
    // The exact set, so a tenth outlined row fails rather than being absorbed.
    expect(outlinedRowAreas()).toEqual(["calves", "hamstrings"]);
    for (const area of EXPECTED) {
      const outlined = row(area)!.style.outline !== "";
      expect(outlined, area).toBe(area === "calves" || area === "hamstrings");
    }
  });

  it("the outline is the D-0003 2 px warn outline, and never a fill", () => {
    renderStub(ORDERED);
    expect(row("calves")!.style.outline).toBe("2px solid var(--wl-color-warn)");
    // `warn` never becomes a background: attention is an outline (D-0003).
    expect(row("calves")!.style.backgroundColor).not.toContain("warn");
    expect(rowFill("calves")).toBe("var(--wl-color-coverage-1)");
  });

  it("CONTRAST: the same stub REVERSED renders reversed", () => {
    // This is the half that kills every sorting implementation. A UI that sorted by deficit, by
    // area name or by the fixed `AREAS` order passes the first test above and fails this one.
    renderStub([...ORDERED].reverse());
    expect(rowAreas()).toEqual([...EXPECTED].reverse());
    // And the attention outline still follows the data, not the position.
    expect(outlinedRowAreas()).toEqual(["hamstrings", "calves"]);
  });

  it("CONTRAST: a stub in plain `AREAS` order renders in `AREAS` order", () => {
    // A third order, so "renders whatever it is given" is shown for three different inputs and
    // cannot be a coincidence of the first two agreeing with some hidden sort.
    renderStub(zeroAreas());
    expect(rowAreas()).toEqual([...AREA_ORDER]);
  });
});

describe("AC-A13 the UI computes nothing — principle 3", () => {
  it("quads {load 3, target 20, coverageStep 4, deficit .85, needsAttention false} renders as given", () => {
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", {
            load: 3,
            target: 20,
            coverageStep: 4,
            deficit: 0.85,
            needsAttention: false,
          })
        : a,
    );
    renderStub(areas);

    expect(rowValue("quads")).toBe("3 / 20");
    // A UI that derived the step from 3/20 would show coverage-1.
    expect(rowFill("quads")).toBe("var(--wl-color-coverage-4)");
    expect(rowFill("quads")).not.toBe("var(--wl-color-coverage-1)");
    // A UI that derived attention from deficit .85 (≥ .5) would outline this row.
    expect(row("quads")!.style.outline).toBe("");
    expect(outlinedRowAreas()).toEqual([]);
  });

  it("the same quads stub shows 85 % on /balance/quads", () => {
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", { load: 3, target: 20, coverageStep: 4, deficit: 0.85 })
        : a,
    );
    renderStub(areas, { at: "/balance/quads" });
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("85 %");
    expect(document.querySelector('[data-part="value"]')).toHaveTextContent("3 / 20");
  });

  it("the deficit is the engine's field even when it CONTRADICTS load / target", () => {
    // The ticket's own warning: `1 - 3/20` is also .85, so the case above cannot tell a read
    // from a recomputation. Measured — a `Math.max(0, target - load) / target` in the
    // component passed every other AC-A13 case. This stub makes the two answers differ:
    // `1 - 12/20` would be 40 %, and the engine says 15 %.
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", { load: 12, target: 20, coverageStep: 2, deficit: 0.15 })
        : a,
    );
    renderStub(areas, { at: "/balance/quads" });
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("15 %");
    expect(document.querySelector('[data-part="deficit"]')).not.toHaveTextContent("40 %");
    expect(document.querySelector('[data-part="value"]')).toHaveTextContent("12 / 20");
  });

  it("and the other way round: a deficit ABOVE what load / target implies", () => {
    // `1 - 18/20` is 10 %; the engine says 70 %. Both directions, so neither a floor nor a
    // ceiling in a recomputation can pass.
    const areas = zeroAreas().map((a) =>
      a.area === "back"
        ? areaBalance("back", { load: 18, target: 20, coverageStep: 3, deficit: 0.7 })
        : a,
    );
    renderStub(areas, { at: "/balance/back" });
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("70 %");
    expect(document.querySelector('[data-part="deficit"]')).not.toHaveTextContent("10 %");
  });

  it("the REVERSE pairing: {load 19, target 20, coverageStep 0, deficit .05} renders 19 / 20, coverage-0, 5 %", () => {
    // 85 % could be a coincidence of `1 - 3/20 = 0.85`. This pairing cannot: `1 - 19/20` is
    // 5 %, but the stub's `coverageStep` (0) contradicts what 19/20 would give (4), so the two
    // cases together pin both fields to the engine's values.
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", { load: 19, target: 20, coverageStep: 0, deficit: 0.05 })
        : a,
    );
    renderStub(areas);
    expect(rowValue("quads")).toBe("19 / 20");
    expect(rowFill("quads")).toBe("var(--wl-color-coverage-0)");
    // A derived step for 19/20 would be coverage-3 or -4, never -0.
    expect(rowFill("quads")).not.toBe("var(--wl-color-coverage-4)");
    expect(rowFill("quads")).not.toBe("var(--wl-color-coverage-3)");

    renderBalance({
      ...at,
      result: balanceResult(areas),
      at: "/balance/quads",
    });
    expect(document.querySelectorAll('[data-part="deficit"]')[0]).toHaveTextContent("5 %");
  });

  it("AC-A9's contrast: a stubbed `contributors` array in the opposite order renders in that order", () => {
    // The row list is not the only place the UI could sort. `contributors` arrives ranked by
    // the engine (weightedSets desc, then name); a UI that re-sorted would reorder this stub.
    const reversed = zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", {
            load: 6,
            target: 16,
            coverageStep: 2,
            contributors: [
              { exerciseId: "back-squat", weightedSets: 2, lastDate: "2026-09-25" },
              { exerciseId: "romanian-deadlift", weightedSets: 4, lastDate: "2026-09-20" },
            ],
          })
        : a,
    );
    renderBalance({
      ...at,
      result: balanceResult(reversed),
      at: "/balance/hamstrings",
      exerciseNames: EXERCISE_NAMES,
    });
    expect(
      Array.from(document.querySelectorAll('[data-part="contributor"]')).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Back squat 2 · 25 Sep", "Romanian deadlift 4 · 20 Sep"]);
  });

  it("the deficit is rounded half up from the engine's value, not recomputed", () => {
    // .625 → 63 (half up), and the load/target pair would give a different answer entirely.
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", { load: 6, target: 16, deficit: 0.625, coverageStep: 2 })
        : a,
    );
    renderStub(areas, { at: "/balance/quads" });
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent("63 %");
  });
});

describe("AC-A10 target source, all three", () => {
  const ALL = [en.uf10.targetFromPlan, en.uf10.targetAdapted("20 Sep"), en.uf10.targetManual];

  it.each([
    ["default" as const, undefined, en.uf10.targetFromPlan],
    ["adapted" as const, "2026-09-20T08:00:00Z", en.uf10.targetAdapted("20 Sep")],
    ["manual" as const, undefined, en.uf10.targetManual],
  ])("%s renders exactly `%s` and the other two are absent", (source, updatedAt, expected) => {
    const areas = zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", {
            targetSource: source,
            ...(updatedAt ? { targetUpdatedAt: updatedAt } : {}),
          })
        : a,
    );
    renderStub(areas, { at: "/balance/hamstrings" });

    const node = document.querySelector('[data-part="target-source"]')!;
    expect(node.textContent).toBe(expected);
    for (const other of ALL.filter((s) => s !== expected)) {
      expect(screen.queryByText(other)).toBeNull();
      expect(document.body.textContent).not.toContain(other);
    }
  });

  it("`adapted` reads the date from `targetUpdatedAt` in the screen's own time zone", () => {
    // 2026-09-20T23:30Z is already 21 Sep in Stockholm: a UTC-only formatter would say 20 Sep.
    const areas = zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", {
            targetSource: "adapted",
            targetUpdatedAt: "2026-09-20T23:30:00Z",
          })
        : a,
    );
    renderStub(areas, { at: "/balance/hamstrings" });
    expect(document.querySelector('[data-part="target-source"]')!.textContent).toBe(
      en.uf10.targetAdapted("21 Sep"),
    );
  });
});

describe("AC-A11 recovering", () => {
  function withQuadsRecovering(recovering: boolean): AreaBalance[] {
    return zeroAreas().map((a) =>
      a.area === "quads" ? areaBalance("quads", { recovering, load: 8, coverageStep: 2 }) : a,
    );
  }

  it("recovering: true shows the tag on the UF-10.1 quads row", () => {
    renderStub(withQuadsRecovering(true));
    expect(row("quads")!.querySelector('[data-part="recovering"]')).toHaveTextContent(
      en.uf10.recovering,
    );
  });

  it("recovering: true on quads only — NO other row shows the tag", () => {
    renderStub(withQuadsRecovering(true));
    const tagged = rowAreas().filter(
      (area) => row(area)!.querySelector('[data-part="recovering"]') !== null,
    );
    expect(tagged).toEqual(["quads"]);
  });

  it("/balance/quads shows the tag AND the rule-6 explanation", () => {
    renderStub(withQuadsRecovering(true), { at: "/balance/quads" });
    expect(screen.getByText(en.uf10.recovering)).toBeInTheDocument();
    expect(screen.getByText(en.uf10.recoveringWhy)).toBeInTheDocument();
  });

  it("recovering: false — neither the tag nor the explanation is in the DOM (not merely hidden)", () => {
    renderStub(withQuadsRecovering(false));
    expect(screen.queryByText(en.uf10.recovering)).toBeNull();
    expect(document.querySelector('[data-part="recovering"]')).toBeNull();

    renderBalance({
      ...at,
      result: balanceResult(withQuadsRecovering(false)),
      at: "/balance/quads",
    });
    expect(screen.queryByText(en.uf10.recoveringWhy)).toBeNull();
    expect(document.body.textContent).not.toContain(en.uf10.recoveringWhy);
  });
});

describe("AC-A14 row a11y", () => {
  const areas = () =>
    zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", { load: 6, target: 16, needsAttention: true, coverageStep: 2 })
        : a,
    );

  it("the row link's accessible name is exactly `Hamstrings, 6 of 16 hard sets, needs attention`", () => {
    renderStub(areas());
    expect(
      screen.getByRole("link", { name: "Hamstrings, 6 of 16 hard sets, needs attention" }),
    ).toBe(row("hamstrings"));
  });

  it("with needsAttention: false the name omits `needs attention`", () => {
    const without = areas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", { load: 6, target: 16, needsAttention: false, coverageStep: 2 })
        : a,
    );
    renderStub(without);
    expect(row("hamstrings")!.getAttribute("aria-label")).toBe("Hamstrings, 6 of 16 hard sets");
    expect(row("hamstrings")!.getAttribute("aria-label")).not.toContain("needs attention");
  });

  it("the row's min-height and min-width are each ≥ 44 CSS px (NFR-A11Y-2)", () => {
    renderStub(areas());
    // jsdom doesn't apply the stylesheet, so read the rule from the CSS the component imports —
    // that is the mechanism, and it fails if the rule is deleted or its value dropped.
    const css = readBalanceCss();
    const rule = ruleFor(css, ".wl-balance__row");
    expect(rule).toMatch(/min-height:\s*(\d+)px/);
    expect(rule).toMatch(/min-width:\s*(\d+)px/);
    expect(pxOf(rule, "min-height")).toBeGreaterThanOrEqual(44);
    expect(pxOf(rule, "min-width")).toBeGreaterThanOrEqual(44);
  });

  it("the numeric label and the area name are aria-hidden, so the name is not read twice", () => {
    renderStub(areas());
    const link = row("hamstrings")!;
    expect(link.querySelector('[data-part="value"]')).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelector(".wl-balance__row-name")).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelector('[data-part="bar"]')).toHaveAttribute("aria-hidden", "true");
  });
});

describe("AC-A15 the full C-01 is mounted, and fed the same data as the rows", () => {
  const hamstringsAt = (load: number, coverageStep: number, needsAttention: boolean) =>
    zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", { load, target: 16, coverageStep, needsAttention })
        : a,
    );

  it("contains exactly one full C-01 region with 9 area buttons, and its legend", () => {
    renderStub(zeroAreas());
    const regions = document.querySelectorAll('[data-component="C-01"][data-variant="full"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]!.querySelectorAll("button[data-area]")).toHaveLength(9);
    expect(screen.getByRole("list", { name: en.bodyMap.legendName })).toBeInTheDocument();
  });

  it("CONTRAST: there is NO compact C-01 region (the Today variant is not reused here)", () => {
    renderStub(zeroAreas());
    expect(document.querySelector('[data-variant="compact"]')).toBeNull();
    expect(document.querySelectorAll('[data-component="C-01"]')).toHaveLength(1);
  });

  it("the map button and the row show the same load and the same fill, and BOTH follow a mutation", () => {
    const { rerender } = renderBalance({
      ...at,
      result: balanceResult(hamstringsAt(6, 2, true)),
    });

    expect(mapButtonValue("hamstrings")).toBe("6 / 16");
    expect(rowValue("hamstrings")).toBe("6 / 16");
    expect(mapButtonFill("hamstrings")).toBe("var(--wl-color-coverage-2)");
    expect(rowFill("hamstrings")).toBe("var(--wl-color-coverage-2)");

    // Mutate that one area in the stub and re-render. A map fed a second, independent source
    // would keep the old numbers here while the rows moved (or the other way round).
    rerender(<BalanceTree {...at} result={balanceResult(hamstringsAt(18, 4, false))} />);

    expect(mapButtonValue("hamstrings")).toBe("18 / 16");
    expect(rowValue("hamstrings")).toBe("18 / 16");
    expect(mapButtonFill("hamstrings")).toBe("var(--wl-color-coverage-4)");
    expect(rowFill("hamstrings")).toBe("var(--wl-color-coverage-4)");
    // And the attention outline dropped on both.
    expect(row("hamstrings")!.style.outline).toBe("");
    expect(outlinedRowAreas()).toEqual([]);
  });

  it("clicking the C-01 hamstrings button lands on /balance/hamstrings rendering UF-10.2", () => {
    renderStub(zeroAreas());
    fireEvent.click(mapButton("hamstrings")!);
    expect(location()).toBe("/balance/hamstrings");
    expect(document.querySelector('[data-screen-id="UF-10.2"]')).toBeInTheDocument();
  });
});

describe("AC-A19 a bad area segment", () => {
  it("/balance/neck renders UF-10.1 at /balance (the shell's `isArea` redirect)", () => {
    renderStub(zeroAreas(), { at: "/balance/neck" });
    expect(document.querySelector('[data-screen-id="UF-10.1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-10.2"]')).toBeNull();
    expect(location()).toBe("/balance");
  });

  it("CONTRAST: /balance/calves renders UF-10.2 and stays at /balance/calves", () => {
    renderStub(zeroAreas(), { at: "/balance/calves" });
    expect(document.querySelector('[data-screen-id="UF-10.2"]')).toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-10.1"]')).toBeNull();
    expect(location()).toBe("/balance/calves");
  });

  it("the shell really does own the redirect: `isArea` rejects `neck` and accepts `calves`", async () => {
    // Asserted against the SHIPPED guard in `app/routes.ts`, not against this feature's test
    // router — so if web-shell ever drops the redirect, this fails rather than passing on a
    // local imitation of it.
    const { isArea } = await import("../../../app/routes.js");
    expect(isArea("neck")).toBe(false);
    expect(isArea("calves")).toBe(true);
    expect(isArea(undefined)).toBe(false);
  });
});

describe("AC-A20 a bad engine value does not crash", () => {
  it("coverageStep 7 still prints load / target and falls back to surface-2", () => {
    const areas = zeroAreas().map((a) =>
      a.area === "quads"
        ? areaBalance("quads", { load: 7, target: 20, coverageStep: 7 as unknown as number })
        : a,
    );
    expect(() => renderStub(areas)).not.toThrow();
    expect(rowValue("quads")).toBe("7 / 20");
    // C-01's existing `fillToken` behaviour, shared by the row.
    expect(rowFill("quads")).toBe("var(--wl-color-surface-2)");
    expect(mapButtonFill("quads")).toBe("var(--wl-color-surface-2)");
    // The other eight rows are unaffected.
    expect(rowAreas()).toHaveLength(9);
  });

  it("target 0 with load 0 renders no Infinity/NaN anywhere, and a 0 % bar", () => {
    const areas = zeroAreas().map((a) =>
      a.area === "calves" ? areaBalance("calves", { load: 0, target: 0, deficit: 0 }) : a,
    );
    expect(() => renderStub(areas)).not.toThrow();
    expect(rowBarWidth("calves")).toBe("0%");
    const text = row("calves")!.textContent!;
    expect(text).not.toMatch(/Infinity|NaN/);
    expect(row("calves")!.getAttribute("aria-label")).not.toMatch(/Infinity|NaN/);
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it("target 0 on the detail screen renders no Infinity/NaN either", () => {
    const areas = zeroAreas().map((a) =>
      a.area === "calves" ? areaBalance("calves", { load: 0, target: 0, deficit: 0 }) : a,
    );
    expect(() => renderStub(areas, { at: "/balance/calves" })).not.toThrow();
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });
});

// ---- helpers used above ----

function readBalanceCss(): string {
  return readFileSync(resolve(__dirname, "../balance.css"), "utf8");
}

function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1]!;
}

function pxOf(rule: string, property: string): number {
  const match = new RegExp(`${property}:\\s*(\\d+)px`).exec(rule);
  if (!match) throw new Error(`no ${property} in rule`);
  return Number(match[1]);
}
