// T-0687 UF-11.3 (WCAG 3.3.2, D-0230, D-0233, D-0203): the Goal, Level, Sessions per week and
// Priority areas groups each get a visible `.wl-label` <h2>, and are named by aria-labelledby.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { tokens } from "@workoutlab/design-tokens";
import type { EngineProfile } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { TZ, profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshRoutines: vi.fn(async () => undefined), refreshAll: async () => {} };
});
const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;
const GROUPS = [
  ["radiogroup", "Goal"],
  ["radiogroup", "Level"],
  ["group", "Sessions per week"],
  ["group", "Priority areas"],
] as const;
const H2S = ["Goal", "Level", "Sessions per week", "Priority areas", "New targets per 14 days"];
const HINTS = [
  "Under 6 months. We start with form-first variations like the goblet squat.",
  "6 months to 2 years. Barbell basics plus targeted accessories.",
  "2+ years. Adds the most demanding lifts, like the barbell deadlift.",
];
const NOTE = "Level changes which exercises we suggest, not your targets.";

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

function fProfile(): EngineProfile {
  return profileF({
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  });
}

async function openEdit(online = true) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  const db = freshDb();
  await seedCache(db, { profile: fProfile(), targets: targetsF(), checkins: [] });
  const view = renderPlan({ at: "/plan/edit" });
  await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

const groups = () => GROUPS.map(([role, name]) => screen.getByRole(role, { name }));
const h2s = () => screen.getAllByRole("heading", { level: 2 });

function expectHeadingsAndNames() {
  expect(h2s().map((h) => h.textContent)).toEqual(H2S);
  const g = groups();
  GROUPS.forEach(([, name], i) => {
    const heading = h2s()[i]!;
    expect(heading.textContent).toBe(name);
    expect(heading).toHaveClass("wl-label");
    expect(g[i]!.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(g[i]!.hasAttribute("aria-label")).toBe(false);
  });
}

describe("T-0687 UF-11.3 group headings", () => {
  it("T-0687 AC1 five h2s in order; the first four are .wl-label and name their group; no aria-label", async () => {
    await openEdit();
    expectHeadingsAndNames();
    expect(h2s()[4]).toHaveClass("wl-label");
  });

  it("T-0687 AC2 each heading comes immediately before its group; the h1 is first", async () => {
    await openEdit();
    const h1 = screen.getByRole("heading", { level: 1, name: "Edit plan" });
    const all = Array.from(document.querySelectorAll("h1, h2, [role=radiogroup], [role=group]"));
    const heads = h2s();
    expect(all[0]).toBe(h1);
    const g = groups();
    for (let i = 0; i < 4; i++) {
      expect(all.indexOf(g[i]!)).toBe(all.indexOf(heads[i]!) + 1);
      // No other control sits between the heading and its group.
      expect(g[i]!.previousElementSibling).toBe(heads[i]);
    }
  });

  it("T-0687 AC3 level names, hints and note unchanged; none in a live region", async () => {
    await openEdit();
    const level = screen.getByRole("radiogroup", { name: "Level" });
    expect(level).toHaveAccessibleDescription(NOTE);
    ["Beginner", "Intermediate", "Advanced"].forEach((name, i) => {
      const radio = screen.getByRole("radio", { name });
      expect(radio).toHaveAccessibleDescription(HINTS[i]!);
    });
    const live = "[aria-live], [role=status], [role=alert]";
    for (const el of [...h2s(), ...HINTS.map((h) => screen.getByText(h)), screen.getByText(NOTE)]) {
      expect(el.closest(live)).toBeNull();
    }
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("T-0687 AC4 every aria-labelledby id resolves to exactly one element, also after a remount", async () => {
    const first = await openEdit();
    first.unmount();
    await openEdit();
    for (const g of groups()) {
      const id = g.getAttribute("aria-labelledby")!;
      expect(id).toBeTruthy();
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }
    const ids = h2s().map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("T-0687 AC5 offline: the same headings and names", async () => {
    await openEdit(false);
    expectHeadingsAndNames();
  });

  it("T-0687 AC6 .wl-label on --wl-bg is at least 4.5:1 and axe reports nothing", async () => {
    const css = readFileSync(resolve(__dirname, "../../../main.css"), "utf8");
    const rule = /\n\.wl-label \{[^}]*\}/.exec(css)![0];
    expect(rule).toContain("color: var(--wl-ink-muted)");
    const plan = tokens.color.plan;
    expect(ratio(plan["ink-muted"], plan.bg)).toBeGreaterThanOrEqual(4.5);
    await openEdit();
    expect(await axeViolations()).toEqual([]);
  });

  it("T-0687 AC7 the design spec names five h2s, aria-labelledby on Level, and drops the old line", () => {
    const spec = readFileSync(
      resolve(__dirname, "../../../../../../Design-docs/docs/design/screens/UF-11.3.md"),
      "utf8",
    ).split("\n");
    const outline = spec.find((l) => l.includes("Heading outline"));
    expect(outline).toBeDefined();
    for (const h of H2S) expect(outline).toContain(`"${h}"`);
    expect(outline).toContain("five `h2`s");
    const levelBullet = spec.find((l) => l.startsWith("- **Control:**"));
    expect(levelBullet).toBeDefined();
    expect(levelBullet).toContain("aria-labelledby");
    expect(spec.join("\n")).not.toContain("named by `role` plus `aria-label`");
  });
});

function lum(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
async function axeViolations(): Promise<string[]> {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  const axe = loaded.default ?? loaded;
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => v.id);
}
