// T-0683b UF-11.3 return to UF-11.6 (D-0230 §5, D-0233 §8; docs/specs/editable-level.md AC9).
// Fixtures as in level-notice.test.tsx: level beginner, full equipment, favorites [pull-up, back-squat].
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";

configure({ asyncUtilTimeout: 4_000 });

/** Lets a test make the save's refresh deliver a new profile, as the server read would. */
const onRefresh: { current: (() => Promise<void>) | null } = { current: null };

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
    refreshAll: vi.fn(async () => {
      await onRefresh.current?.();
    }),
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
const LIBRARY: LibraryExercise[] = [
  lib("back-squat", "Back squat", { quads: 1, glutes: 1 }, { equipment: ["barbell"] }),
  lib("pull-up", "Pull up", { back: 1, arms: 0.5 }, { level: "intermediate" }),
];
const ALL_EQUIPMENT = ["barbell", "dumbbells", "none"] as never;
const NOTICE_TEXT = /Your level is .*Some favorites are above it/;

const profileAt = (level: "beginner" | "intermediate") =>
  profileF({ level, equipment: ALL_EQUIPMENT });
const seed = () =>
  seedCache(offlineDb(), { profile: profileAt("beginner"), targets: targetsF(), library: LIBRARY });
const seedFavorites = () =>
  offlineDb().favoriteCache.bulkPut(
    ["pull-up", "back-squat"].map((exerciseId) => ({
      key: userScopedKey(A, exerciseId),
      userId: A,
      exerciseId,
      createdAt: "2026-10-01T10:00:00.000Z",
    })),
  );
const deliverIntermediate = () => {
  onRefresh.current = async () => {
    await offlineDb().profileCache.put({ userId: A, profile: profileAt("intermediate") });
  };
};

function Loc() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}
/** A reachable "Favorite exercises" row and a history stepper stand in for UF-11.2 and the browser. */
function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/plan/favorites")}>
        Go favorites
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Go forward
      </button>
    </>
  );
}
function tree(at: string) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Loc />
      <Nav />
      <Routes>
        <Route path="/plan" element={<Plan now={() => NOW} />} />
        <Route path="/plan/edit" element={<EditPlan now={() => NOW} />} />
        <Route path="/plan/favorites" element={<FavoriteExercises />} />
      </Routes>
    </MemoryRouter>
  );
}
const here = () => screen.getByTestId("loc").textContent;
const h1 = () => screen.getByRole("heading", { level: 1 });
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);
const tap = (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el);
  });

beforeEach(() => {
  freshDb();
  signIn(A);
  useTimeZone(TZ);
  spy.reset();
  onRefresh.current = null;
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openEdit(at: string) {
  await seed();
  render(tree(at));
  await screen.findByRole("radiogroup", { name: "Level" });
}
const save = () => screen.getByRole("button", { name: /^Save/ });
const pickIntermediate = () => tap(screen.getByRole("radio", { name: /^Intermediate/ }));

describe("T-0683b AC1 Save returns to favorites", () => {
  it("T-0683b AC1 lands on /plan/favorites, focus on the h1, row line and notice gone", async () => {
    await seedFavorites();
    deliverIntermediate();
    await openEdit("/plan/edit?from=favorites");
    await pickIntermediate();
    await tap(save());
    await waitFor(() => expect(here()).toBe("/plan/favorites"));
    await screen.findByRole("searchbox", { name: "Search exercises" });
    await waitFor(() => expect(document.activeElement).toBe(h1()));
    expect(h1().textContent).toBe("Favorite exercises");
    await waitFor(() =>
      expect(document.querySelector('[data-exercise-id="pull-up"]')).not.toBeNull(),
    );
    const pull = document.querySelector('[data-exercise-id="pull-up"]')!;
    expect(pull.textContent).not.toContain("Above your level");
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
    expect(spy.calls.some((c) => c.table === "profiles" && c.method === "update")).toBe(true);
  });
});

describe("T-0683b AC2 Cancel returns to favorites", () => {
  it("T-0683b AC2 form Cancel lands on /plan/favorites, focus on the h1, no write", async () => {
    await seedFavorites();
    await openEdit("/plan/edit?from=favorites");
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(here()).toBe("/plan/favorites"));
    await waitFor(() => expect(document.activeElement).toBe(h1()));
    expect(spy.calls).toHaveLength(0);
  });

  it("T-0683b AC2 cold-cache Cancel does the same", async () => {
    render(tree("/plan/edit?from=favorites"));
    await screen.findByText("Your plan isn't on this device yet. Connect to load it.");
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(here()).toBe("/plan/favorites"));
    await waitFor(() => expect(document.activeElement).toBe(h1()));
    expect(spy.calls).toHaveLength(0);
  });

  it("T-0683b AC2 cold-cache Cancel with another from goes to /plan", async () => {
    render(tree("/plan/edit?from=account"));
    await screen.findByText("Your plan isn't on this device yet. Connect to load it.");
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(here()).toBe("/plan"));
  });
});

describe("T-0683b AC3 any other from value returns to /plan", () => {
  const cases = [
    "/plan/edit?from=https://evil.example",
    "/plan/edit?from=//evil.example",
    "/plan/edit?from=account",
    "/plan/edit?from=favorites/../x",
    "/plan/edit?from=Favorites",
    "/plan/edit",
  ];
  it.each(cases)("T-0683b AC3 Save from %s goes to /plan", async (at) => {
    await openEdit(at);
    await pickIntermediate();
    await tap(save());
    await waitFor(() => expect(here()).toBe("/plan"));
    expect(document.activeElement).not.toBe(document.querySelector("h1[tabindex='-1']"));
  });
  it.each(cases)("T-0683b AC3 Cancel from %s goes to /plan", async (at) => {
    await openEdit(at);
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(here()).toBe("/plan"));
    expect(spy.calls).toHaveLength(0);
  });
});

describe("T-0683b AC4 focus only with the flag, and only once", () => {
  it("T-0683b AC4 arriving without the flag leaves focus off the title", async () => {
    await seed();
    await seedFavorites();
    render(tree("/plan"));
    await screen.findByRole("heading", { name: "Your plan" });
    await tap(screen.getByRole("button", { name: "Go favorites" }));
    await screen.findByRole("searchbox", { name: "Search exercises" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(here()).toBe("/plan/favorites");
    expect(document.activeElement).not.toBe(h1());
  });

  it("T-0683b AC4 after the flagged arrival a back-and-forward does not refocus", async () => {
    await seedFavorites();
    await openEdit("/plan/edit?from=favorites");
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(h1()));
    // The flag is cleared by a replace, so the entry no longer carries it.
    await tap(screen.getByRole("button", { name: "Go back" }));
    await screen.findByRole("radiogroup", { name: "Level" });
    (document.activeElement as HTMLElement).blur();
    await tap(screen.getByRole("button", { name: "Go forward" }));
    await screen.findByRole("searchbox", { name: "Search exercises" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(here()).toBe("/plan/favorites");
    expect(document.activeElement).not.toBe(h1());
  });
});

describe("T-0683b AC5 a failed save stays", () => {
  it("T-0683b AC5 stays on /plan/edit?from=favorites with the alert", async () => {
    await openEdit("/plan/edit?from=favorites");
    spy.failOn("profiles", "error");
    await pickIntermediate();
    await tap(save());
    expect((await screen.findByRole("alert")).textContent).toBe(en.uf11.saveFailed);
    expect(here()).toBe("/plan/edit?from=favorites");
  });
});

describe("T-0683b AC6 offline", () => {
  it("T-0683b AC6 Save is aria-disabled and Cancel returns to favorites with focus on the title", async () => {
    await seedFavorites();
    await seed();
    setOnline(false);
    render(tree("/plan/edit?from=favorites"));
    await screen.findByRole("radiogroup", { name: "Level" });
    expect(save().getAttribute("aria-disabled")).toBe("true");
    await tap(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(here()).toBe("/plan/favorites"));
    await waitFor(() => expect(document.activeElement).toBe(h1()));
  });
});
