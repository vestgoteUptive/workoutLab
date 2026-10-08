// T-0540 UF-11.2 row + UF-11.5 (D-0199 §7-§10). Real Dexie (fake-indexeddb) for every cache; only
// the three network helpers in lib/offline/excluded are replaced, and the stubs write the cache
// the way the real ones do after the server confirms.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";

const h = vi.hoisted(() => ({
  refresh: undefined as undefined | (() => Promise<void>),
  exclude: undefined as undefined | ((u: string, id: string) => Promise<void>),
  include: undefined as undefined | ((u: string, id: string) => Promise<void>),
}));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return {
    ...real,
    refreshExcluded: vi.fn(async () => h.refresh?.()),
    excludeExercise: vi.fn(async (u: string, id: string) => h.exclude?.(u, id)),
    includeExercise: vi.fn(async (u: string, id: string) => h.include?.(u, id)),
  };
});

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});
const { createFromSpy } = await import("./test-helpers.js");
const checkinSpy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => checkinSpy.from(table) },
  isSupabaseConfigured: () => true,
}));

const ex = await import("../../../lib/offline/excluded.js");
const { Plan, ExcludedExercises } = await import("../index.js");
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
  lib("bench-press", "Bench press", { chest: 1, shoulders: 1 }),
  lib("db-bench-press", "Dumbbell bench press", { chest: 1, shoulders: 0.5 }),
  lib("lateral-raise", "Lateral raise", { shoulders: 1 }, { type: "isolation" }),
  lib("back-squat", "Back squat", { quads: 1, glutes: 0.5 }, { equipment: ["barbell"] }),
  lib("calf-raise", "Calf raise", { calves: 1 }, { type: "isolation" }),
  lib("bw-squat", "Bodyweight squat", { quads: 1 }),
  lib("bench-warmup", "Bench press warm-up", { chest: 1 }, { kind: "warmup" }),
];

const row = (exerciseId: string, createdAt: string) => ({
  key: userScopedKey(A, exerciseId),
  userId: A,
  exerciseId,
  createdAt,
});
async function seedExcluded(...rows: Array<[string, string]>) {
  await offlineDb().excludedCache.bulkPut(rows.map(([id, at]) => row(id, at)));
}
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);

function tree(at: string) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/plan" element={<Plan now={() => NOW} />} />
        <Route path="/plan/excluded" element={<ExcludedExercises />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  const db = freshDb();
  signIn(A);
  useTimeZone(TZ);
  await seedCache(db, { profile: profileF(), targets: targetsF(), library: L1 });
  h.refresh = undefined;
  h.exclude = async (u, id) => {
    await offlineDb().excludedCache.put(row(id, "2026-10-08T10:00:00.000Z"));
    void u;
  };
  h.include = async (u, id) => {
    await offlineDb().excludedCache.delete(userScopedKey(u, id));
  };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(ex.excludeExercise).mockClear();
  vi.mocked(ex.includeExercise).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The search box once the cache read is done (a skeleton shows until then). */
async function searchbox() {
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  return screen.getByRole("searchbox", { name: "Search exercises" });
}

const names = () =>
  within(screen.getByRole("list", { name: "Exercises" }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".wl-plan__name")!.textContent);

describe("AC1 row on UF-11.2 and the list", () => {
  it("shows the count between the Your plan and Targets cards, and the list round-trips", async () => {
    await seedExcluded(
      ["lateral-raise", "2026-10-01T10:00:00.000Z"],
      ["bench-press", "2026-10-03T10:00:00.000Z"],
    );
    const { container } = render(tree("/plan"));
    const link = await screen.findByRole("link", { name: "Excluded exercises, 2" });
    expect(link).toHaveTextContent("Excluded exercises · 2");
    const cards = [...container.querySelectorAll("section.wl-card")];
    const at = cards.findIndex((c) => c.contains(link));
    expect(cards[at - 1]).toHaveAccessibleName("Your plan");
    expect(cards[at + 1]).toHaveAccessibleName("Targets");

    fireEvent.click(link);
    await screen.findByRole("heading", { level: 1, name: "Excluded exercises" });
    await waitFor(() => expect(names()).toEqual(["Bench press", "Lateral raise"]));
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Chest, Shoulders");
    expect(items[0]).toHaveTextContent("Excluded 3 Oct");
    expect(items[1]).toHaveTextContent("Excluded 1 Oct");
    expect(screen.getAllByRole("button", { name: /^Include .* again$/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Include Bench press again" }));
    await waitFor(() => expect(names()).toEqual(["Lateral raise"]));
    fireEvent.click(screen.getByRole("link", { name: "Back to Plan" }));
    expect(await screen.findByRole("link", { name: "Excluded exercises, 1" })).toHaveTextContent(
      "Excluded exercises · 1",
    );
  });

  it("shows 'none' with no exclusions", async () => {
    render(tree("/plan"));
    expect(await screen.findByRole("link", { name: "Excluded exercises, none" })).toHaveTextContent(
      "Excluded exercises · none",
    );
  });
});

describe("AC2 search", () => {
  it("lists matches by name, never warm-ups, and Exclude calls the write", async () => {
    await seedExcluded(["bench-press", "2026-10-03T10:00:00.000Z"]);
    render(tree("/plan/excluded"));
    await waitFor(() => expect(names()).toEqual(["Bench press"]));
    fireEvent.change(await searchbox(), {
      target: { value: "BENCH" },
    });
    expect(names()).toEqual(["Bench press", "Dumbbell bench press"]);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Excluded");
    expect(first).toHaveTextContent("Include again");
    expect(second).toHaveTextContent("Exclude");
    fireEvent.click(screen.getByRole("button", { name: "Exclude Dumbbell bench press" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Include Dumbbell bench press again" }),
      ).toHaveTextContent("Include again"),
    );
    expect(ex.excludeExercise).toHaveBeenCalledWith(A, "db-bench-press");
    expect(screen.getByRole("status")).toHaveTextContent("Dumbbell bench press excluded");
  });
});

describe("AC3 search scope", () => {
  it("finds back-squat although the profile has no barbell", async () => {
    render(tree("/plan/excluded"));
    fireEvent.change(await searchbox(), { target: { value: "squat" } });
    expect(names()).toEqual(["Back squat", "Bodyweight squat"]);
  });
});

describe("AC4 empty states", () => {
  it("empty list and no-match copy", async () => {
    render(tree("/plan/excluded"));
    expect(
      await screen.findByText(
        "No excluded exercises. Search to exclude one, or tap Remove on a suggested workout.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("No exercises match “zzz”.")).toBeInTheDocument();
  });
});

describe("AC5 neutral notice", () => {
  it("one area, two areas, none", async () => {
    await seedExcluded(["calf-raise", "2026-10-01T10:00:00.000Z"]);
    render(tree("/plan/excluded"));
    expect(
      await screen.findByText("Not suggested: Calves. Every exercise for it is excluded."),
    ).toBeInTheDocument();
    await act(() => offlineDb().excludedCache.put(row("bw-squat", "2026-10-02T10:00:00.000Z")));
    expect(
      await screen.findByText("Not suggested: Quads, Calves. Every exercise for them is excluded."),
    ).toBeInTheDocument();
    await act(() => offlineDb().excludedCache.clear());
    await waitFor(() => expect(screen.queryByText(/Not suggested/)).toBeNull());
  });

  it("an Exclude that empties an area is announced in the status line", async () => {
    render(tree("/plan/excluded"));
    fireEvent.change(await searchbox(), { target: { value: "calf" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude Calf raise" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Calf raise excluded. Not suggested: Calves. Every exercise for it is excluded.",
      ),
    );
  });
});

describe("AC6 offline", () => {
  it("disables every write control with one description, and re-enables on 'online'", async () => {
    await seedExcluded(
      ["bench-press", "2026-10-03T10:00:00.000Z"],
      ["lateral-raise", "2026-10-01T10:00:00.000Z"],
    );
    setOnline(false);
    render(tree("/plan/excluded"));
    await waitFor(() => expect(names()).toHaveLength(2));
    const buttons = screen.getAllByRole("button", { name: /Include/ });
    for (const b of buttons) expect(b).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Connect to change excluded exercises")).toHaveLength(1);
    const id = screen.getByText("Connect to change excluded exercises").id;
    for (const b of buttons) expect(b).toHaveAttribute("aria-describedby", id);
    fireEvent.click(buttons[0]!);
    expect(ex.includeExercise).not.toHaveBeenCalled();

    setOnline(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => {
      for (const b of screen.getAllByRole("button", { name: /Include/ })) {
        expect(b).not.toHaveAttribute("aria-disabled");
      }
    });
    expect(screen.queryByText("Connect to change excluded exercises")).toBeNull();
  });
});

describe("AC7 mount refresh", () => {
  it("lists what the server returned after the refresh", async () => {
    await seedExcluded(["bench-press", "2026-10-03T10:00:00.000Z"]);
    h.refresh = async () => {
      await offlineDb().excludedCache.clear();
      await offlineDb().excludedCache.put(row("lateral-raise", "2026-10-02T10:00:00.000Z"));
    };
    render(tree("/plan/excluded"));
    await waitFor(() => expect(names()).toEqual(["Lateral raise"]));
    expect(ex.refreshExcluded).toHaveBeenCalled();
  });
});

describe("AC8 write failure", () => {
  it("keeps the list, shows role=alert and enables the button again", async () => {
    h.exclude = async () => {
      throw new ex.ExcludedWriteError("server");
    };
    render(tree("/plan/excluded"));
    fireEvent.change(await searchbox(), { target: { value: "lateral" } });
    const btn = screen.getByRole("button", { name: "Exclude Lateral raise" });
    fireEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(await offlineDb().excludedCache.count()).toBe(0);
    await waitFor(() => expect(btn).not.toHaveAttribute("aria-disabled"));
    expect(btn).toHaveTextContent("Exclude");
  });
});

describe("AC9 reachability", () => {
  it("no source under UF-03, UF-08 or UF-09 links to /plan/excluded", () => {
    const root = resolve(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (
          /\.(tsx?|css)$/.test(name) &&
          readFileSync(p, "utf8").includes("plan/excluded")
        ) {
          hits.push(p);
        }
      }
    };
    for (const f of ["UF-03", "UF-08", "UF-09"]) walk(join(root, f));
    expect(hits).toEqual([]);
  });
});

describe("focus after Include again", () => {
  it("moves to the next row's button, or the search field when none is left", async () => {
    await seedExcluded(
      ["lateral-raise", "2026-10-01T10:00:00.000Z"],
      ["bench-press", "2026-10-03T10:00:00.000Z"],
    );
    render(tree("/plan/excluded"));
    await waitFor(() => expect(names()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Include Bench press again" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Include Lateral raise again" })).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Include Lateral raise again" }));
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
  });
});

describe("status region is visually hidden but present", () => {
  it("has role=status on mount, empty, and its stylesheet clips it", async () => {
    render(tree("/plan/excluded"));
    const status = await screen.findByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(status).toHaveClass("wl-excluded__status");
    const css = readFileSync(resolve(__dirname, "../excluded.css"), "utf8");
    const rule = css.match(/\.wl-excluded__status \{([^}]*)\}/)![1]!;
    expect(rule).toContain("clip-path: inset(50%)");
    expect(rule).toContain("position: absolute");
  });
});
