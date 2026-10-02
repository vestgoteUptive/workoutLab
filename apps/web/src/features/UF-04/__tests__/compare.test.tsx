// T-0306a UF-04.3 Compare: AC-12 and the compare half of AC-13.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({ setCostS: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workoutlab/engine")>();
  hoisted.setCostS.mockImplementation(real.setCostS);
  return { ...real, setCostS: (e: Parameters<typeof real.setCostS>[0]) => hoisted.setCostS(e) };
});

const { refreshAll } = await import("../../../lib/offline/history.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { currentUrl, mountAt, screenId, setOnline } = await import("./harness.js");

async function seed(options: Parameters<typeof seedSpy>[1] = {}): Promise<void> {
  spy.reset();
  seedSpy(spy, options);
  await refreshAll(NOW, TZ);
  hoisted.setCostS.mockClear();
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
});
afterEach(() => signOut());

function row(label: string): string[] {
  const th = [...document.querySelectorAll("tbody th")].find((h) => h.textContent === label)!;
  return [...th.parentElement!.querySelectorAll("td")].map((td) => td.textContent ?? "");
}

describe("AC-12 compare", () => {
  it("shows two columns of data we have, with engine times", async () => {
    await seed();
    await mountAt("/library/back-squat/compare/leg-extension");
    await screen.findByRole("columnheader", { name: "Leg extension" });
    expect(
      screen
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
        .filter(Boolean),
    ).toEqual(["Back squat", "Leg extension"]);
    expect(row("Primary")).toEqual(["Glutes, Quads", "Quads"]);
    expect(row("Secondary")).toEqual(["Core, Hamstrings", "—"]);
    expect(row("Equipment")).toEqual(["Barbell, Rack", "Machine"]);
    expect(row("Type")).toEqual(["Compound", "Isolation"]);
    expect(row("Level")).toEqual(["Beginner", "Beginner"]);
    expect(row("Time per set")).toEqual(["2:45 per set", "1:45 per set"]);
    expect(row("Cue")).toEqual(["Chest up", "—"]);
    expect(screen.getByRole("link", { name: /Leg extension/ })).toHaveAttribute(
      "href",
      "/library/leg-extension",
    );
    const called = hoisted.setCostS.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(called).toEqual(expect.arrayContaining(["back-squat", "leg-extension"]));
  });

  it("contrast: a timed exercise's time comes from its duration, not a fixed 45 s", async () => {
    await seed({
      extra: [
        {
          id: "wall-sit",
          name: "Wall sit",
          type: "isolation",
          equipment: [],
          areas: { quads: 1 },
          timed: true,
          durationS: 60,
        },
      ],
    });
    await mountAt("/library/plank/compare/wall-sit");
    await screen.findByRole("columnheader", { name: "Wall sit" });
    expect(row("Time per set")).toEqual(["1:45 per set", "2:00 per set"]);
  });

  it("shows a dash for the cue when the detail is missing", async () => {
    await seed();
    const { offlineDb } = await import("../../../lib/offline/index.js");
    await offlineDb().exerciseDetails.clear();
    await mountAt("/library/back-squat/compare/leg-extension");
    await screen.findByRole("columnheader", { name: "Leg extension" });
    expect(row("Cue")).toEqual(["—", "—"]);
  });
});

describe("AC-13 compare redirects", () => {
  for (const [path, target, id] of [
    ["/library/back-squat/compare/back-squat", "/library/back-squat", "UF-04.2"],
    ["/library/back-squat/compare/nope", "/library/back-squat", "UF-04.2"],
    ["/library/back-squat/compare/wu-cat-cow", "/library/back-squat", "UF-04.2"],
    ["/library/nope/compare/leg-press", "/library", "UF-04.1"],
    ["/library/back-squat/compare/leg-press", "/library/back-squat/compare/leg-press", "UF-04.3"],
  ] as const) {
    it(`${path} → ${target} (${id}) by replace`, async () => {
      await seed();
      window.history.replaceState(null, "", "/library");
      const before = window.history.length;
      await mountAt(path);
      await waitFor(() => expect(screenId()).toBe(id));
      await waitFor(() => expect(currentUrl()).toBe(target));
      expect(window.history.length).toBe(before);
    });
  }
});
