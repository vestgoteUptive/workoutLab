// T-0558 UF-04.2 figure card (D-0207 §3; spec body-map-silhouette AC-4, AC-5). Reads the
// rendered classes, not props.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb } = await import("../../../lib/offline/index.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, setOnline } = await import("./harness.js");

async function seed(options: Parameters<typeof seedSpy>[1] = {}): Promise<void> {
  spy.reset();
  seedSpy(spy, options);
  await refreshAll(NOW, TZ);
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
});
afterEach(() => signOut());

/** area -> modifier, read from the rendered figure (front view only, to avoid doubles). */
function modifiers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of document.querySelectorAll("svg.wl-fig [data-area]")) {
    const m = /wl-fig__region--([\w-]+)/.exec(el.getAttribute("class") ?? "");
    const area = el.getAttribute("data-area")!;
    const mod = m?.[1] ?? "?";
    // Both views must agree for an area.
    expect(out[area] ?? mod).toBe(mod);
    out[area] = mod;
  }
  return out;
}
const nonNone = (m: Record<string, string>, v: string) =>
  Object.keys(m)
    .filter((a) => m[a] === v)
    .sort();

describe("AC-1 figure regions follow exercise.areas", () => {
  it("back squat: quads and glutes primary, hamstrings and core secondary, rest none", async () => {
    await seed();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    const m = modifiers();
    expect(nonNone(m, "primary")).toEqual(["glutes", "quads"]);
    expect(nonNone(m, "secondary")).toEqual(["core", "hamstrings"]);
    expect(nonNone(m, "none")).toEqual(["arms", "back", "calves", "chest", "shoulders"].sort());
  });

  it("a row with only weight 1.0 areas has no secondary region", async () => {
    await seed();
    await mountAt("/library/goblet-squat");
    await screen.findByRole("heading", { level: 1, name: "Goblet squat" });
    const m = modifiers();
    expect(nonNone(m, "secondary")).toEqual([]);
    expect(nonNone(m, "primary")).toEqual(["glutes", "quads"]);
  });

  it("a single primary area is the only primary region", async () => {
    await seed();
    await mountAt("/library/leg-extension");
    await screen.findByRole("heading", { level: 1, name: "Leg extension" });
    const m = modifiers();
    expect(nonNone(m, "primary")).toEqual(["quads"]);
    expect(nonNone(m, "secondary")).toEqual([]);
  });
});

describe("AC-2 visible labels and swatches", () => {
  it("shows Primary and Secondary, each followed by an aria-hidden swatch; lists keep their names", async () => {
    await seed();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    for (const [text, kind] of [
      ["Primary", "primary"],
      ["Secondary", "secondary"],
    ] as const) {
      const label = screen.getByText(text);
      expect(label).toBeVisible();
      const swatch = label.nextElementSibling!;
      expect(swatch.getAttribute("aria-hidden")).toBe("true");
      expect(swatch.className).toContain(`wl-uf04__swatch--${kind}`);
    }
    expect(screen.getByRole("list", { name: "Primary areas" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Secondary areas" })).toBeInTheDocument();
  });

  it("without secondary areas neither the label nor the list exists", async () => {
    await seed();
    await mountAt("/library/goblet-squat");
    await screen.findByRole("heading", { level: 1, name: "Goblet squat" });
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.queryByText("Secondary")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Secondary areas" })).not.toBeInTheDocument();
  });
});

describe("AC-3 no area weights", () => {
  it("renders no card and no lists, the rest of the screen stays", async () => {
    await seed({
      extra: [{ id: "bare", name: "Bare move", type: "isolation", equipment: [], areas: {} }],
    });
    await mountAt("/library/bare");
    await screen.findByRole("heading", { level: 1, name: "Bare move" });
    expect(document.querySelector("svg.wl-fig")).toBeNull();
    expect(document.querySelector('[data-field="figure-card"]')).toBeNull();
    expect(screen.queryByRole("list", { name: /areas$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My history" })).toBeInTheDocument();
  });
});

describe("AC-4 detail missing", () => {
  it("the figure card shows and the download line follows it", async () => {
    await seed();
    await offlineDb().exerciseDetails.clear();
    await mountAt("/library/back-squat");
    const line = await screen.findByText("Instructions download the next time you're online.");
    const card = document.querySelector('[data-field="figure-card"]')!;
    expect(card.querySelector("svg.wl-fig")).not.toBeNull();
    expect(card.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("AC-5 not interactive", () => {
  it("the figure is aria-hidden and nothing in the card is focusable except none", async () => {
    await seed();
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    const svg = document.querySelector("svg.wl-fig")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("a, button, [tabindex], [role=button]")).toHaveLength(0);
    const card = document.querySelector('[data-field="figure-card"]')!;
    expect(card.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });
});
