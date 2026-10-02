// T-0421 UF-05.1 AC-11: the dialog (principle 1), Escape, no link out, the two radio groups,
// the 44 px row height (a stylesheet test, the `OfflineStatus.test.tsx` pattern) and axe
// (D-0060 §7) over the list, the empty state and the load failure.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { w5 } from "./fixtures.js";
import { freezeClock, loadAxe, mountSheet, rowIds, seedCache, settle, signOut } from "./harness.js";

let axe: Awaited<ReturnType<typeof loadAxe>>;
beforeAll(async () => {
  axe = await loadAxe();
});

beforeEach(async () => {
  freezeClock();
  await seedCache();
});

afterEach(() => {
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function noViolations(): Promise<void> {
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

describe("AC-11 dialog, principle 1, a11y", () => {
  it("is a dialog named after the current item's library name", async () => {
    mountSheet(w5(), 1);
    expect(await screen.findByRole("dialog", { name: "Replace Barbell row" })).toBeInTheDocument();
  });

  it("contrast: another item index names that item", async () => {
    mountSheet(w5(), 2);
    expect(
      await screen.findByRole("dialog", { name: "Replace Leg extension" }),
    ).toBeInTheDocument();
  });

  it("Escape calls onClose; another key doesn't", async () => {
    const m = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.keyDown(document, { key: "Enter" });
    await settle();
    expect(m.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(m.onClose).toHaveBeenCalledTimes(1);
  });

  it("has no a[href] at all, in any state", async () => {
    const m = mountSheet(w5(), 1);
    await rowIds();
    expect(m.container.querySelectorAll("a")).toHaveLength(0);
    m.unmount();

    vi.spyOn(engine, "rankSwaps").mockReturnValue([]);
    const e = mountSheet(w5(), 1);
    await screen.findByText("No alternatives fit your equipment");
    expect(e.container.querySelectorAll("a")).toHaveLength(0);
  });

  it("every option row is a radio in the group named Replacement", async () => {
    mountSheet(w5(), 1);
    const ids = await rowIds();
    const group = screen.getByRole("radiogroup", { name: "Replacement" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(ids.length);
    for (const id of ids) {
      expect(group.querySelector(`[data-id="${id}"] input[type="radio"]`)).not.toBeNull();
    }
    // The two groups are distinct: the reasons don't count as replacements.
    const reasons = screen.getByRole("radiogroup", { name: "Reason" });
    expect(reasons).not.toBe(group);
    expect(within(reasons).getAllByRole("radio")).toHaveLength(5);
  });

  it("the row and chip classes are at least 44 px tall in uf-05.css", () => {
    const css = readFileSync(resolve(__dirname, "../uf-05.css"), "utf8");
    const tsx = readFileSync(resolve(__dirname, "../SwapSheet.tsx"), "utf8");
    expect(tsx).toContain('import "./uf-05.css"');
    for (const cls of [".wl-uf05__row", ".wl-uf05__chip", ".wl-uf05__use", ".wl-uf05__close"]) {
      expect(tsx).toContain(`"${cls.slice(1)}"`);
      const heights = [
        ...css.matchAll(
          new RegExp(
            `${cls.replace(".", "\\.")}[^{]*\\{[^}]*min-(?:height|block-size):\\s*(\\d+)px`,
            "g",
          ),
        ),
      ].map((m) => Number(m[1]));
      expect(heights.length, cls).toBeGreaterThan(0);
      expect(Math.max(...heights), cls).toBeGreaterThanOrEqual(44);
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/var\(--wl-color-/);
  });

  it("axe: 0 violations with the list", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    await noViolations();
  });

  it("axe: 0 violations with the empty state", async () => {
    vi.spyOn(engine, "rankSwaps").mockReturnValue([]);
    mountSheet(w5(), 1);
    await screen.findByText("No alternatives fit your equipment");
    await noViolations();
  });

  it("axe: 0 violations with the load failure", async () => {
    await seedCache({ profile: null });
    mountSheet(w5(), 1);
    await screen.findByText("Couldn't load alternatives.");
    await noViolations();
  });

  it("focus moves into the sheet on mount and back to the opener on unmount", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const m = mountSheet(w5(), 1);
    await rowIds();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    m.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
