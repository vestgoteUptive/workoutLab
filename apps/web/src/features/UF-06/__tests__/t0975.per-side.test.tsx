// T-0975 UF-06.2 (D-0260, D-0263 §6, §8): per-side words on the history rows, Best set and the
// empty state; coverage and Est. 1RM are unchanged by the flag (AC1 to AC3, AC5 to AC8).
// AC1/AC2 on UF-03 and AC9 are in UF-03/__tests__/t0975.per-side.test.tsx; the PR line on UF-02.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance, estimatedOneRepMax } from "@workoutlab/engine";
import type { LibraryExercise } from "@workoutlab/shared";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { userScopedKey } from "../../../lib/offline/db.js";
import { offlineDb } from "../../../lib/offline/db.js";
import { ExerciseHistory } from "../ExerciseHistory.js";
import { exerciseHistory } from "../stats.js";
import { LIBRARY, LOCALE, TARGETS, TZ, USER, seed, set } from "./fixtures.js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from } }));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});

const NOW = new Date("2026-11-19T12:00:00+01:00");
const row = (id: string, over: Partial<LibraryExercise> = {}): LibraryExercise => ({
  ...LIBRARY[0]!,
  id,
  name: id,
  areas: { back: 1, arms: 0.5 },
  ...over,
});
const DB_ROW = row("dumbbell-row");
const BB_ROW = row("barbell-row");
const PUSH = row("push-up", { externalLoad: false, incrementKg: 0 });
const PLANK = row("plank", { timed: true, defaultDurationS: 45, externalLoad: false });
const lib = [...LIBRARY, DB_ROW, BB_ROW, PUSH, PLANK];

const sets = (id: string) => [
  set("S1", id, "2026-11-18 10:00", { w: 12, r: 10 }),
  set("S1", id, "2026-11-18 10:05", { w: 12, r: 10 }),
  set("S1", id, "2026-11-18 10:10", { w: 12, r: 9 }),
];

async function cacheDetail(id: string, unilateral: unknown) {
  await offlineDb().exerciseDetails.put({
    key: userScopedKey(USER, id),
    userId: USER,
    detail: {
      id,
      instructions: [],
      mistakes: [],
      cue: null,
      source: "s",
      license: "l",
      attribution: null,
      sourceUrl: null,
      variants: [],
      ...(unilateral === undefined ? {} : { unilateral }),
    } as never,
  });
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/progress/${id}`]}>
      <Routes>
        <Route
          path="/progress/:exerciseId"
          element={<ExerciseHistory now={NOW} timeZone={TZ} locale={LOCALE} />}
        />
        <Route path="/progress" element={<div data-screen-id="UF-06.1" />} />
      </Routes>
    </MemoryRouter>,
  );
}
const rowsText = () =>
  [...document.querySelectorAll(".wl-progress__row")].map((e) => e.textContent);
const card = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0975 UF-06.2", () => {
  it("AC1/AC2/AC7: flagged dumbbell-row rows and Best set read per arm, offline from the cache", async () => {
    await seed({ library: lib, history: sets("dumbbell-row") });
    await cacheDetail("dumbbell-row", "arm");
    renderAt("dumbbell-row");
    expect(await screen.findByText(/12 × 10 per arm/)).toBeInTheDocument();
    expect(rowsText()).toEqual(["Wed 18 Nov · 12 × 10 per arm, 12 × 10 per arm, 12 × 9 per arm"]);
    expect(card("Best set")!.textContent).toBe("12 kg × 10 per arm");
  });

  it("AC3: barbell-row with the same sets reads exactly as before", async () => {
    await seed({ library: lib, history: sets("barbell-row") });
    await cacheDetail("barbell-row", null);
    renderAt("barbell-row");
    expect(await screen.findByText(/12 × 10, 12 × 10, 12 × 9/)).toBeInTheDocument();
    expect(rowsText()[0]).not.toMatch(/per /);
    expect(card("Best set")!.textContent).toBe("12 kg × 10");
  });

  it("AC3: a flagged bodyweight row reads '10 per arm'; Best set '10 reps per arm'", async () => {
    await seed({ library: lib, history: [set("S1", "push-up", "2026-11-18 10:00", { r: 10 })] });
    await cacheDetail("push-up", "arm");
    renderAt("push-up");
    expect(await screen.findByText(/10 per arm/)).toBeInTheDocument();
    expect(rowsText()).toEqual(["Wed 18 Nov · 10 per arm"]);
    expect(card("Best set")!.textContent).toBe("10 reps per arm");
  });

  it("a timed flagged row reads '40 s per side'", async () => {
    await seed({ library: lib, history: [set("S1", "plank", "2026-11-18 10:00", { d: 40 })] });
    await cacheDetail("plank", "side");
    renderAt("plank");
    await waitFor(() => expect(card("Best set")!.textContent).toBe("40 s per side"));
    expect(rowsText()).toEqual(["Wed 18 Nov · 40 s per side"]);
  });

  it("AC7: a cached row without `unilateral` has no suffix", async () => {
    await seed({ library: lib, history: sets("dumbbell-row") });
    await cacheDetail("dumbbell-row", undefined);
    renderAt("dumbbell-row");
    expect(await screen.findByText(/12 × 10, 12 × 10, 12 × 9/)).toBeInTheDocument();
    expect(card("Best set")!.textContent).toBe("12 kg × 10");
  });

  it("AC7: an old set logged as 20 for a newly flagged row shows '20 per arm', unedited", async () => {
    await seed({ library: lib, history: [set("S1", "push-up", "2026-11-18 10:00", { r: 20 })] });
    await cacheDetail("push-up", "arm");
    renderAt("push-up");
    expect(await screen.findByText(/20 per arm/)).toBeInTheDocument();
    const stored = await offlineDb().historyCache.toArray();
    expect(stored.map((s) => s.reps)).toEqual([20]);
  });

  it("AC8: zero sets for a flagged row keep the empty state", async () => {
    await seed({ library: lib, history: [] });
    await cacheDetail("dumbbell-row", "arm");
    renderAt("dumbbell-row");
    expect(await screen.findByText("No sets in the last 8 weeks")).toBeInTheDocument();
    expect(rowsText()).toEqual([]);
  });
});

describe("T-0975 maths is unchanged by the flag", () => {
  it("AC5: back rises by 3 hard sets, and balance equals a bilateral row with the same sets", () => {
    const at = "2026-11-19T11:00:00.000Z";
    const run = (id: string, library: LibraryExercise[]) =>
      balance(sets(id), TARGETS, library, at, TZ);
    const flagged = run("dumbbell-row", [...lib.filter((e) => e.id !== "dumbbell-row"), DB_ROW]);
    const bilateral = run("barbell-row", lib);
    const back = flagged.areas.find((a) => a.area === "back")!;
    expect(back.load).toBe(3);
    const anon = (r: typeof flagged) =>
      JSON.parse(JSON.stringify(r.areas).replace(/(dumbbell|barbell)-row/g, "row"));
    expect(anon(flagged)).toEqual(anon(bilateral));
  });

  it("AC6: Est. 1RM is the Epley value from reps and weight as logged", () => {
    const [point] = estimatedOneRepMax(sets("dumbbell-row"), lib, "dumbbell-row");
    expect(point!.e1rm).toBeCloseTo(12 * (1 + 10 / 30), 10);
    expect(point!.weightKg).toBe(12);
    expect(point!.reps).toBe(10);
  });

  it("AC6 (screen): the Est. 1RM card and series are identical flagged and unflagged, Epley as logged", async () => {
    const { e1rmSeries } = await import("../stats.js");
    const run = (id: string) => e1rmSeries(id, sets(id), lib, NOW, TZ).map((p) => p.e1rm);
    expect(run("dumbbell-row")).toEqual(run("barbell-row"));
    expect(run("dumbbell-row")[0]).toBeCloseTo(16, 10);
    await seed({ library: lib, history: sets("dumbbell-row") });
    await cacheDetail("dumbbell-row", "arm");
    renderAt("dumbbell-row");
    await screen.findByText(/12 × 10 per arm/);
    expect(card("Est. 1RM")!.textContent).toBe("about 16 kg");
  });

  it("exerciseHistory without a word is unchanged (AC3 pure)", () => {
    const h = exerciseHistory("dumbbell-row", sets("dumbbell-row"), lib, NOW, TZ, LOCALE)!;
    expect(h.rows[0]!.sets).toEqual(["12 × 10", "12 × 10", "12 × 9"]);
    const f = exerciseHistory("dumbbell-row", sets("dumbbell-row"), lib, NOW, TZ, LOCALE, "arm")!;
    expect(f.rows[0]!.sets).toEqual(["12 × 10 per arm", "12 × 10 per arm", "12 × 9 per arm"]);
    expect(f.best!.label).toBe("12 kg × 10 per arm");
  });
});
