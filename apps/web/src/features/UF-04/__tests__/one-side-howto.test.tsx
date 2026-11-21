// T-0976 UF-04.2 (D-0261, D-0263 §7): the one-side how-to line, AC1-AC6.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

const def = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  type: "compound" as const,
  equipment: ["dumbbell"],
  areas: { back: 1 },
  ...extra,
});
const EXTRA = [
  def("dumbbell-row", "Dumbbell row", { unilateral: "arm" }),
  def("single-leg-calf-raise", "Single-leg calf raise", {
    unilateral: "leg",
    areas: { calves: 1 },
  }),
  def("cable-woodchop", "Cable woodchop", { unilateral: "side", areas: { core: 1 } }),
  def("side-plank", "Side plank", {
    unilateral: "side",
    timed: true,
    durationS: 30,
    areas: { core: 1 },
  }),
  def("barbell-row", "Barbell row", { unilateral: null }),
];

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  spy.reset();
  seedSpy(spy, { extra: EXTRA });
  await refreshAll(NOW, TZ);
});
afterEach(() => signOut());

const line = () => document.querySelector('[data-field="one-side"]');

describe("T-0976 one-side how-to line", () => {
  it("AC1 dumbbell-row reads the arm line, directly under the steps", async () => {
    await mountAt("/library/dumbbell-row");
    await screen.findByRole("heading", { level: 1, name: "Dumbbell row" });
    expect(line()?.textContent).toBe(
      "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side.",
    );
    expect(line()?.tagName).toBe("P");
    expect(line()?.previousElementSibling?.querySelector("ol")).not.toBeNull();
  });

  it("AC2 leg and side wording", async () => {
    const first = await mountAt("/library/single-leg-calf-raise");
    await screen.findByRole("heading", { level: 1, name: "Single-leg calf raise" });
    expect(line()?.textContent).toBe(
      "Do all reps on one leg, then switch. Log reps for one leg. One set covers both legs. Log RIR for your weaker side.",
    );
    first.unmount();
    await mountAt("/library/cable-woodchop");
    await screen.findByRole("heading", { level: 1, name: "Cable woodchop" });
    expect(line()?.textContent).toBe(
      "Do all reps on one side, then switch. Log reps for one side. One set covers both sides. Log RIR for your weaker side.",
    );
  });

  it("AC3 timed side-plank has no RIR sentence", async () => {
    await mountAt("/library/side-plank");
    await screen.findByRole("heading", { level: 1, name: "Side plank" });
    expect(line()?.textContent).toBe("Hold one side, then switch. Log seconds for one side.");
    expect(line()?.textContent).not.toMatch(/RIR/);
  });

  it("AC4 barbell-row has no line", async () => {
    await mountAt("/library/barbell-row");
    await screen.findByRole("heading", { level: 1, name: "Barbell row" });
    expect(line()).toBeNull();
    expect(screen.queryByText(/then switch/)).toBeNull();
  });

  it("AC5 offline shows the line; a cached row without the flag shows none", async () => {
    expect(navigator.onLine).toBe(false);
    const first = await mountAt("/library/dumbbell-row");
    await screen.findByRole("heading", { level: 1, name: "Dumbbell row" });
    expect(line()).not.toBeNull();
    first.unmount();
    const cached = await offlineDb().exerciseDetails.toArray();
    for (const c of cached) delete (c.detail as { unilateral?: unknown }).unilateral;
    await offlineDb().exerciseDetails.bulkPut(cached);
    await mountAt("/library/dumbbell-row");
    await screen.findByRole("heading", { level: 1, name: "Dumbbell row" });
    expect(line()).toBeNull();
  });

  it("AC6 axe passes and the line uses the body type", async () => {
    await mountAt("/library/dumbbell-row");
    await screen.findByRole("heading", { level: 1, name: "Dumbbell row" });
    expect(line()?.className).toBe("wl-type-body");
    expect(line()?.hasAttribute("role")).toBe(false);
    expect(line()?.hasAttribute("aria-live")).toBe(false);
    const { violations } = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
