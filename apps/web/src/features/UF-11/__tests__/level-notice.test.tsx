// T-0683a UF-11.2 Level fact and UF-11.6 level notice (D-0230 §1, D-0231 §2, D-0233 §7;
// docs/specs/editable-level.md AC7, AC8). Fixtures as in favorites-screen.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";

configure({ asyncUtilTimeout: 4_000 });

vi.mock("../../../lib/offline/favorites.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/favorites.js")>();
  return { ...real, refreshFavorites: vi.fn(async () => undefined) };
});
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...real, refreshExcluded: vi.fn(async () => undefined) };
});
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
    refreshRoutines: vi.fn(async () => undefined),
  };
});
const { createFromSpy } = await import("./test-helpers.js");
const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const { Plan, EditPlan, FavoriteExercises } = await import("../index.js");
const { freshDb, seedCache, signIn, TEST_USER: A, useTimeZone } = await import("./test-helpers.js");
const { NOW, TZ, profileF, targetsF } = await import("./fixtures.js");

function lib(
  id: string,
  name: string,
  areas: LibraryExercise["areas"],
  extra: Partial<LibraryExercise> = {},
): LibraryExercise {
  return {
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas,
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
    ...extra,
  };
}
const L1: LibraryExercise[] = [
  lib("back-squat", "Back squat", { quads: 1, glutes: 1 }, { equipment: ["barbell"] }),
  lib("pull-up", "Pull up", { back: 1, arms: 0.5 }, { level: "advanced" }),
  lib("barbell-deadlift", "Barbell deadlift", { back: 1, hamstrings: 1 }, { level: "advanced" }),
];
const ALL_EQUIPMENT = ["barbell", "dumbbells", "none"] as never;
const NOTICE = "Your level is Beginner. Some favorites are above it.";

const seedFavorites = (...ids: string[]) =>
  offlineDb().favoriteCache.bulkPut(
    ids.map((exerciseId) => ({
      key: userScopedKey(A, exerciseId),
      userId: A,
      exerciseId,
      createdAt: "2026-10-01T10:00:00.000Z",
    })),
  );
const seed = (level: "beginner" | "intermediate" | "advanced", equipment = ALL_EQUIPMENT) =>
  seedCache(offlineDb(), {
    profile: profileF({ level, equipment }),
    targets: targetsF(),
    library: L1,
  });

function Loc() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}
function tree(at: string) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Loc />
      <Routes>
        <Route path="/plan" element={<Plan now={() => NOW} />} />
        <Route path="/plan/edit" element={<EditPlan now={() => NOW} />} />
        <Route path="/plan/favorites" element={<FavoriteExercises />} />
      </Routes>
    </MemoryRouter>
  );
}
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);
const notices = () =>
  [...document.querySelectorAll("p.wl-level-notice")].filter((p) =>
    p.textContent!.includes(NOTICE),
  );

beforeEach(() => {
  freshDb();
  signIn(A);
  useTimeZone(TZ);
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function ready() {
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  await screen.findByRole("searchbox", { name: "Search exercises" });
}

describe("T-0683a AC1 Plan shows Level", () => {
  it.each([
    ["beginner", "Beginner"],
    ["intermediate", "Intermediate"],
    ["advanced", "Advanced"],
  ] as const)("T-0683a AC1 level %s reads %s between Goal and Rhythm", async (level, label) => {
    await seed(level);
    render(tree("/plan"));
    await screen.findByRole("heading", { name: "Your plan" });
    const facts = document.querySelector(".wl-plan__facts")!;
    expect([...facts.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "Goal",
      "Level",
      "Rhythm",
      "Priority areas",
    ]);
    expect(facts.querySelectorAll("dd")[1]!.textContent).toBe(label);
  });
});

describe("T-0683a UF-11.6 level notice", () => {
  it("AC2 + AC8 shows one notice with the link, before the search field, not live", async () => {
    await seed("beginner");
    await seedFavorites("pull-up", "back-squat");
    render(tree("/plan/favorites"));
    await ready();
    const pullRow = document.querySelector('[data-exercise-id="pull-up"]')!;
    expect(pullRow.textContent).toContain("Above your level");
    const found = notices();
    expect(found).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Change level" });
    expect(link.getAttribute("href")).toMatch(/\/plan\/edit\?from=favorites$/);
    const p = found[0]!;
    expect(p.contains(link)).toBe(true);
    expect(p.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(p.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    const search = screen.getByRole("searchbox", { name: "Search exercises" });
    expect(p.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC3 no notice with only an at-level favorite", async () => {
    await seed("beginner");
    await seedFavorites("back-squat");
    render(tree("/plan/favorites"));
    await ready();
    expect(notices()).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Change level" })).toBeNull();
  });

  it("AC3 no level notice when equipment is the reason", async () => {
    await seed("beginner", [] as never);
    await seedFavorites("back-squat");
    render(tree("/plan/favorites"));
    await ready();
    expect(screen.getAllByText("Not available with your equipment").length).toBeGreaterThan(0);
    expect(notices()).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Change level" })).toBeNull();
  });

  it("AC3 no notice with no favorites", async () => {
    await seed("beginner");
    render(tree("/plan/favorites"));
    await ready();
    expect(notices()).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Change level" })).toBeNull();
  });

  it("AC4 one notice and one link for many above-level rows", async () => {
    await seed("beginner");
    await seedFavorites("pull-up", "barbell-deadlift");
    render(tree("/plan/favorites"));
    await ready();
    expect(screen.getAllByText("Above your level").length).toBeGreaterThanOrEqual(2);
    expect(notices()).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Change level" })).toHaveLength(1);
  });

  it("AC5 typing a query keeps the notice and link", async () => {
    await seed("beginner");
    await seedFavorites("pull-up", "back-squat");
    render(tree("/plan/favorites"));
    await ready();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
      target: { value: "squat" },
    });
    await screen.findByRole("list", { name: "Exercises" });
    expect(notices()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Change level" })).toBeTruthy();
  });

  it("AC6 an upgrade removes the row line and the notice", async () => {
    await seed("advanced");
    await seedFavorites("pull-up");
    render(tree("/plan/favorites"));
    await ready();
    await screen.findByText("Pull up");
    expect(screen.queryByText("Above your level")).toBeNull();
    expect(screen.queryByText(/Some favorites are above it/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Change level" })).toBeNull();
  });

  it("AC7 offline the notice shows and the link opens Edit plan with Save disabled", async () => {
    await seed("beginner");
    await seedFavorites("pull-up", "back-squat");
    setOnline(false);
    render(tree("/plan/favorites"));
    await ready();
    expect(notices()).toHaveLength(1);
    fireEvent.click(screen.getByRole("link", { name: "Change level" }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe("/plan/edit?from=favorites"),
    );
    const save = await screen.findByRole("button", { name: /^Save/ });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Connect to save")).toBeTruthy();
  });

  it("AC8 the link's accessible name is exactly Change level", async () => {
    await seed("beginner");
    await seedFavorites("pull-up");
    render(tree("/plan/favorites"));
    await ready();
    expect(screen.getByRole("link", { name: "Change level" })).toBeTruthy();
    expect(document.querySelector(".wl-level-notice__link")!.textContent).toBe("Change level");
  });
});
