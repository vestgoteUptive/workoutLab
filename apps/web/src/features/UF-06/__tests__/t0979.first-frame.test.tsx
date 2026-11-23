// T-0979 AC5 (UF-06.2, D-0260, D-0263 §6): with the in-memory flag store warm, the Best set card and
// the history rows carry "per arm" in the first state they have, never flipping in a render later.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { freshOfflineDb, signIn, signOut } from "../../../lib/offline/__tests__/test-helpers.js";
import { invalidateCacheWrites } from "../../../lib/offline/cache-generation.js";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { warmUnilateralFlags } from "../../../lib/offline/unilateral-flags.js";
import { ExerciseHistory } from "../ExerciseHistory.js";
import { LIBRARY, LOCALE, TZ, USER, seed, set } from "./fixtures.js";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from } }));
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  // A slow detail read: only a warm store can label the rows in the state they first appear in.
  const slow = async (id: string) => {
    await new Promise((r) => setTimeout(r, 120));
    return actual.loadExerciseDetail(id);
  };
  return { ...actual, refreshAll: vi.fn(async () => undefined), loadExerciseDetail: slow };
});

const NOW = new Date("2026-11-19T12:00:00+01:00");
const row = (id: string): LibraryExercise => ({
  ...LIBRARY[0]!,
  id,
  name: id,
  areas: { back: 1, arms: 0.5 },
});
const lib = [...LIBRARY, row("dumbbell-row"), row("barbell-row")];
const sets = (id: string) => [
  set("S1", id, "2026-11-18 10:00", { w: 12, r: 10 }),
  set("S1", id, "2026-11-18 10:05", { w: 12, r: 9 }),
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
      unilateral,
    } as never,
  });
}

/** Every text the history rows and the Best set card have had, from the first mutation on. */
function record() {
  const texts: string[] = [];
  const grab = () => {
    for (const el of document.querySelectorAll(".wl-progress__row")) texts.push(el.textContent!);
    for (const el of document.querySelectorAll("dt")) {
      if (el.textContent === "Best set") texts.push(el.nextElementSibling!.textContent!);
    }
  };
  const mo = new MutationObserver(grab);
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  return { texts, stop: () => mo.disconnect() };
}

async function show(id: string) {
  const rec = record();
  render(
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
  await waitFor(() => expect(document.querySelector(".wl-progress__row")).not.toBeNull());
  await new Promise((r) => setTimeout(r, 300));
  rec.stop();
  return rec.texts;
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  invalidateCacheWrites();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0979 AC5 UF-06.2 first frame, warm", () => {
  it("T-0979 AC5 no recorded state of the rows or the Best set card lacks 'per arm'", async () => {
    await seed({ library: lib, history: sets("dumbbell-row") });
    await cacheDetail("dumbbell-row", "arm");
    await warmUnilateralFlags();
    const texts = await show("dumbbell-row");
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((t) => !/per arm/.test(t))).toEqual([]);
    expect(screen.getByText("Best set", { selector: "dt" }).nextElementSibling!.textContent).toBe(
      "12 kg × 10 per arm",
    );
  });

  it("T-0979 AC5 an unflagged row never carries a word", async () => {
    await seed({ library: lib, history: sets("barbell-row") });
    await cacheDetail("barbell-row", null);
    await warmUnilateralFlags();
    const texts = await show("barbell-row");
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((t) => /per (arm|leg|side)/.test(t))).toEqual([]);
  });
});
