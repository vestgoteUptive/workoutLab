// T-0639 (D-0217 §1; UF-04.1): the Upper and Legs group chips and the polite result count.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { currentUrl, mountAt, rowNames, setOnline } = await import("./harness.js");

type D = { id: string; name: string; equipment: string[]; areas: Record<string, number> };
const FOUR: D[] = [
  {
    id: "back-squat",
    name: "Back squat",
    equipment: ["barbell", "rack"],
    areas: { quads: 1, glutes: 1 },
  },
  { id: "leg-curl", name: "Leg curl", equipment: ["machine"], areas: { hamstrings: 1 } },
  {
    id: "bench-press",
    name: "Bench press",
    equipment: ["barbell", "bench"],
    areas: { chest: 1, arms: 0.5 },
  },
  { id: "plank", name: "Plank", equipment: [], areas: { core: 1, shoulders: 0.5 } },
];

async function seed(profileEquipment: string[] | null = ["machine"]): Promise<void> {
  spy.reset();
  seedSpy(spy, {
    profile: profileEquipment === null ? null : { level: "beginner", equipment: profileEquipment },
  });
  spy.setRows(
    "exercises",
    FOUR.map((d) => ({
      id: d.id,
      name: d.name,
      type: "compound",
      level: "beginner",
      equipment: d.equipment,
      instructions: ["Do the move"],
      mistakes: [],
      cue: null,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
      attribution: null,
      source_url: null,
      kind: "exercise",
      timed: false,
      increment_kg: null,
      default_duration_s: null,
      external_load: false,
    })),
  );
  spy.setRows(
    "exercise_areas",
    FOUR.flatMap((d) =>
      Object.entries(d.areas).map(([area_id, weight]) => ({ exercise_id: d.id, area_id, weight })),
    ),
  );
  await refreshAll(NOW, TZ);
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
});
afterEach(() => {
  cleanup();
  signOut();
});

const chips = () => screen.getByRole("group", { name: "Filter exercises" });
const chip = (name: string) => within(chips()).getByRole("button", { name });
const pressed = () =>
  within(chips())
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);

describe("UF-04.1 group chips", () => {
  it("AC1 Legs shows back-squat and leg-curl; group=legs, no area, only Legs pressed", async () => {
    await seed(null);
    await mountAt("/library?area=chest");
    await waitFor(() => expect(rowNames()).toHaveLength(1));
    fireEvent.click(chip("Legs"));
    expect(rowNames()).toEqual(["Back squat", "Leg curl"]);
    expect(currentUrl()).toBe("/library?group=legs");
    expect(pressed()).toEqual(["Legs"]);
  });

  it("AC2 Upper shows bench-press only; a 0.5 match is not shown", async () => {
    await seed(null);
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(4));
    fireEvent.click(chip("Upper"));
    expect(rowNames()).toEqual(["Bench press"]);
    expect(currentUrl()).toBe("/library?group=upper");
  });

  it("AC3 an area or All replaces the group; history length is unchanged", async () => {
    await seed(null);
    await mountAt("/library?group=legs");
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    const length = window.history.length;
    fireEvent.click(chip("Quads"));
    expect(currentUrl()).toBe("/library?area=quads");
    expect(pressed()).toEqual(["Quads"]);
    fireEvent.click(chip("Legs"));
    fireEvent.click(chip("All"));
    expect(currentUrl()).toBe("/library");
    expect(pressed()).toEqual(["All"]);
    expect(window.history.length).toBe(length);
  });

  it("AC4 area wins over group; an unknown group is ignored", async () => {
    await seed(null);
    const view = await mountAt("/library?group=legs&area=chest");
    await waitFor(() => expect(rowNames()).toEqual(["Bench press"]));
    expect(pressed()).toEqual(["Chest"]);
    view.unmount();
    await mountAt("/library?group=arms");
    await waitFor(() => expect(rowNames()).toHaveLength(4));
    expect(pressed()).toEqual(["All"]);
  });

  it("AC5 group combines with My equipment", async () => {
    await seed(["machine"]);
    await mountAt("/library?group=legs");
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    fireEvent.click(chip("My equipment"));
    expect(rowNames()).toEqual(["Leg curl"]);
    expect(currentUrl()).toBe("/library?group=legs&mine=1");
  });

  it("AC6 + AC7 the count is a status: 4 / 2 / 1 results, absent with no match (offline)", async () => {
    await seed(null);
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(4));
    const count = () => document.querySelector('[data-part="count"]');
    expect(count()).toHaveAttribute("role", "status");
    expect(count()).toHaveTextContent(/^4 results$/);
    fireEvent.click(chip("Legs"));
    expect(count()).toHaveTextContent(/^2 results$/);
    fireEvent.click(chip("All"));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "plank" } });
    expect(count()).toHaveTextContent(/^1 result$/);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(count()).toBeNull();
    expect(screen.getByText('No exercises match "zzz"')).toBeInTheDocument();
  });

  it("AC9 axe finds no violations and the group keeps its name; the list stays a list", async () => {
    await seed(null);
    await mountAt("/library?group=legs");
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    expect(chips()).toHaveAccessibleName("Filter exercises");
    expect(screen.getByRole("list")).toBeInTheDocument();
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
