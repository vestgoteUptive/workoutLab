// T-0307b: the *online* value of AC-12's online/offline binary, which the offline suite cannot
// reach. `screens.test.tsx` runs with `navigator.onLine = false` (per the ticket's "through the
// engine" rule) and stubs `refreshAll`, so nothing there ever drives a real refresh. This file
// lets the real `refreshAll` run against the ticket's `createSelectSpy`, which proves three
// things the offline tests leave open:
//
//  1. The screens survive an online mount at all. A `supabase.from` spy that returns nothing
//     throws inside `refreshAll` on `.select(...)` of `undefined`; only a real refresh finds that.
//  2. "Render from the cache first, then re-read and recompute" (D-0071 §8) actually recomputes:
//     a row that only the network has appears after the refresh resolves.
//  3. AC-12's "no `/functions/v1/` URL" is non-vacuous. Asserted offline it is trivially true,
//     because the screens make no request at all.
//
// The mid-flight assertion (lesson: a microtask flush closes the window it exists to catch) is
// made against a *manually released* deferred promise, never a timer or a flush.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));

const { ExerciseHistory } = await import("../ExerciseHistory.js");
const { Progress } = await import("../Progress.js");
const offline = await import("../../../lib/offline/index.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { LOCALE, NOW, TZ, USER, historyH, seed, set } = await import("./fixtures.js");

/** The `exercises` row shape `refreshLibrary` maps, for the two ids these tests need. */
function exerciseRow(id: string, name: string) {
  return {
    id,
    name,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    timed: false,
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
  };
}

/** A `session_sets_live` row, the way `refreshHistory` selects it. */
function setRow(clientId: string, exerciseId: string, at: string, weightKg: number, reps: number) {
  return {
    client_id: clientId,
    session_id: `net-${clientId}`,
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps,
    weight_kg: weightKg,
    duration_s: null,
  };
}

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

/** Every table `refreshAll` touches, so the refresh completes instead of throwing. */
function serveNetwork(sets: unknown[]) {
  spy.setRows("session_sets_live", sets);
  spy.setRows("exercises", [
    exerciseRow("back-squat", "Back squat"),
    exerciseRow("romanian-deadlift", "Romanian deadlift"),
  ]);
  spy.setRows("exercise_areas", [
    { exercise_id: "back-squat", area_id: "quads", weight: 1 },
    { exercise_id: "back-squat", area_id: "glutes", weight: 1 },
    { exercise_id: "romanian-deadlift", area_id: "hamstrings", weight: 1 },
  ]);
  spy.setRows("exercise_variants", []);
  spy.setRows(
    "area_targets",
    AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 12,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
  );
  spy.setRows("sessions", []);
  spy.setRows("plan_checkins", []);
  spy.setRows("routines", []);
  spy.setRows("routine_items", []);
  spy.setRows("profiles", []);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/progress" element={<Progress now={NOW} timeZone={TZ} locale={LOCALE} />} />
        <Route
          path="/progress/:exerciseId"
          element={<ExerciseHistory now={NOW} timeZone={TZ} locale={LOCALE} />}
        />
        <Route path="/balance" element={<div data-screen-id="UF-10.1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const recentRows = () => {
  const section = screen.getByRole("heading", { name: "Recent exercises" }).parentElement!;
  return within(section).queryAllByRole("link");
};
const rowNames = () =>
  recentRows().map((r) => r.querySelector(".wl-progress__recent-name")!.textContent);

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.reset();
  serveNetwork([]);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("online mount runs a real refreshAll", () => {
  it("UF-06.1 renders through a real refresh without throwing, and selects the history table", async () => {
    await seed({ history: historyH() });
    renderAt("/progress");

    await waitFor(() => expect(recentRows()).toHaveLength(4));
    // The refresh really ran: a hand-rolled `from` spy with no `select` would have thrown here.
    await waitFor(() => expect(spy.countFor("session_sets_live")).toBeGreaterThanOrEqual(1));
    expect(screen.getByText("0 workouts this month")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("UF-06.2 renders through a real refresh without throwing", async () => {
    await seed({ history: historyH() });
    renderAt("/progress/back-squat");

    expect(await screen.findByRole("heading", { level: 1, name: "Back squat" })).toBeVisible();
    await waitFor(() => expect(spy.countFor("session_sets_live")).toBeGreaterThanOrEqual(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recomputes after the refresh: a row only the network has appears (D-0071 §8)", async () => {
    // The cache holds one exercise; the network holds that one plus a newer RDL session.
    await seed({ history: [set("A", "back-squat", "2026-09-20 10:00", { w: 100, r: 8 })] });
    serveNetwork([
      setRow("c1", "back-squat", "2026-09-20T08:00:00.000Z", 100, 8),
      setRow("c2", "romanian-deadlift", "2026-09-26T08:00:00.000Z", 80, 10),
    ]);

    renderAt("/progress");
    // First paint is the cache alone.
    await waitFor(() => expect(rowNames()).toEqual(["Back squat"]));
    // After the refresh the screen recomputes over the replaced cache.
    await waitFor(() => expect(rowNames()).toEqual(["Romanian deadlift", "Back squat"]));
  });

  it("makes no /functions/v1/ request while online (AC-12, non-vacuously)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seed({ history: historyH() });
    renderAt("/progress");

    await waitFor(() => expect(recentRows()).toHaveLength(4));
    await waitFor(() => expect(spy.countFor("session_sets_live")).toBeGreaterThanOrEqual(1));
    // The screens reach Supabase only through the T-0319 loaders, which are spied here, so the
    // meaningful assertion is that the feature added no Edge Function call of its own.
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain("/functions/v1/");
    }
    expect(spy.calls.every((c) => !c.table.includes("functions"))).toBe(true);
  });

  it("a failing refresh leaves the cached render in place and raises no alert", async () => {
    spy.fail("session_sets_live", { code: "PGRST500", message: "boom" });
    await seed({ history: historyH() });
    renderAt("/progress");

    await waitFor(() => expect(recentRows()).toHaveLength(4));
    await waitFor(() => expect(spy.countFor("session_sets_live")).toBeGreaterThanOrEqual(1));
    expect(rowNames()[0]).toBe("Back squat");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the cached render does not wait on the network (mid-flight, deferred)", () => {
  it("shows the calendar and Recent rows while refreshAll is still pending", async () => {
    // A deferred promise released by hand: no timer, no microtask flush, so the mid-flight window
    // genuinely stays open across the assertions.
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refreshSpy = vi
      .spyOn(offline, "refreshAll")
      .mockImplementation(async () => await pending);

    await seed({ history: historyH() });
    renderAt("/progress");

    // Everything below happens with `refreshAll` un-resolved.
    await waitFor(() => expect(recentRows()).toHaveLength(4));
    expect(screen.getByText("0 workouts this month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Balance, last 14 days" })).toBeInTheDocument();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    // Contrast: the refresh really is still in flight, so this was not a post-refresh render.
    expect(rowNames()).toEqual(["Back squat", "Plank", "Push-up", "Romanian deadlift"]);

    release();
    await waitFor(() => expect(recentRows()).toHaveLength(4));
  });
});
