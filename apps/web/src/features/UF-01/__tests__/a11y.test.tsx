// T-0301b AC-8 (NFR-A11Y-1, NFR-A11Y-6) and the render half of AC-11 (NFR-I18N-1): a
// keyboard-only run from /welcome to /welcome/level, named radio groups, axe on UF-01.1–.3, and
// every visible string on those screens coming from `en.uf01`.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn(), auth: {} } }));

const { findScreen, mountAt, stored, where } = await import("./harness.js");
const { press, tabTo } = await import("./keyboard.js");

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
});

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const focused = () => document.activeElement as HTMLElement;
const isNamed = (name: string) => (el: HTMLElement) =>
  el === screen.queryByRole("link", { name }) ||
  el === screen.queryByRole("button", { name }) ||
  el === screen.queryByRole("radio", { name });

describe("AC-8 keyboard only (NFR-A11Y-6)", () => {
  it("/welcome → Get started → ArrowDown to Get stronger → Continue → /welcome/level", async () => {
    mountAt("/welcome");
    await findScreen("UF-01.1");

    await tabTo(isNamed("Get started"));
    await press("Enter");
    await findScreen("UF-01.2");
    expect(where.current).toBe("/welcome/goal");

    // Only the checked radio is in the Tab order; Arrow moves and checks.
    await tabTo(isNamed("Build muscle"));
    await press("ArrowDown");
    expect(focused()).toBe(screen.getByRole("radio", { name: "Get stronger" }));
    expect(screen.getByRole("radio", { name: "Get stronger" })).toBeChecked();

    await tabTo(isNamed("Continue"));
    await press("Enter");
    await findScreen("UF-01.3");
    expect(where.current).toBe("/welcome/level");
    expect(stored()).toMatchObject({ goal: "get_stronger" });
  });

  it("UF-01.3 by keyboard: arrows pick Advanced and Dumbbells, Space on Continue", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    await tabTo(isNamed("Beginner"));
    await press("ArrowRight", "ArrowRight");
    expect(screen.getByRole("radio", { name: "Advanced" })).toBeChecked();
    await press("Tab");
    expect(focused()).toBe(screen.getByRole("radio", { name: "Full gym" }));
    await press("ArrowUp");
    expect(screen.getByRole("radio", { name: "Dumbbells" })).toBeChecked();
    await tabTo(isNamed("Continue"));
    await press("Space");
    await findScreen("UF-01.4");
    expect(stored()).toMatchObject({ level: "advanced", equipmentProfile: "dumbbells" });
  });

  it("Back is reachable and works by keyboard", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    await tabTo(isNamed("Back"));
    await press("Enter");
    await findScreen("UF-01.1");
    expect(where.current).toBe("/welcome");
  });

  it("UF-01.2's radio group is named by its heading", async () => {
    mountAt("/welcome/goal");
    await findScreen("UF-01.2");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getByRole("radiogroup", { name: "What's your main goal?" })).toBeInTheDocument();
  });

  it("UF-01.3's two groups are named", async () => {
    mountAt("/welcome/level");
    await findScreen("UF-01.3");
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(2);
    expect(screen.getByRole("radiogroup", { name: "Training experience" })).toBe(groups[0]);
    expect(screen.getByRole("radiogroup", { name: "Where do you train?" })).toBe(groups[1]);
  });
});

describe("AC-8 axe (NFR-A11Y-1)", () => {
  it.each([
    ["/welcome", "UF-01.1"],
    ["/welcome/goal", "UF-01.2"],
    ["/welcome/level", "UF-01.3"],
  ])("%s (%s) has no axe violations", async (path, id) => {
    const view = mountAt(path);
    await findScreen(id);
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

/** Every string value in `en.uf01`, functions called with placeholder args. */
function catalogue(): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") out.add(v);
    else if (typeof v === "function") out.add((v as (a: string, b: string) => string)("1", "3"));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(en.uf01);
  out.add(en.uf01.progressName("2", "3"));
  return out;
}

describe("AC-11 every visible string on UF-01.1–.3 comes from en.uf01", () => {
  it.each([
    ["/welcome", "UF-01.1"],
    ["/welcome/goal", "UF-01.2"],
    ["/welcome/level", "UF-01.3"],
  ])("%s (%s)", async (path, id) => {
    mountAt(path);
    const root = await findScreen(id);
    const known = catalogue();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent!.trim();
      if (text) texts.push(text);
    }
    expect(texts.length).toBeGreaterThan(2);
    // The progress "1/3" is three text nodes of digits and the allowed "/" separator.
    const stray = texts.filter((t) => !known.has(t) && !/^[0-9]+$|^\/$/.test(t));
    expect(stray).toEqual([]);
    // aria-labels too.
    const labels = [...root.querySelectorAll("[aria-label]")].map((e) =>
      e.getAttribute("aria-label"),
    );
    for (const label of labels) expect(known.has(label!), label!).toBe(true);
  });
});
