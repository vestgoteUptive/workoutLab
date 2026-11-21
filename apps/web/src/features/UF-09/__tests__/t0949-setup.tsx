// T-0949 shared setup: the real host with the real UF-09.10 sheet over fake-indexeddb (the sheet's
// cache loaders and lists are mocked in each test file, as T-0948 does). Spec fixture P.
import { act, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import * as offline from "../../../lib/offline/index.js";
import { USER_A } from "./fixtures.js";
import { flushReal, freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";
import { findEl } from "./set-loop-helpers.js";
import { LIB, NOW, PLAN_P, startedFor } from "./t0947-fixtures.js";

export { LIB };

export const PROFILE = {
  goal: "build_muscle",
  level: "beginner",
  equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T10:00:00Z",
  planUpdatedAt: "2026-08-02T10:00:00Z",
};

export const KEY = "wl-focus:S1";

/** Fresh fake DB, fake clock, signed in, profile cached, online. */
export async function prepare(online = true): Promise<void> {
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await offline.offlineDb().profileCache.put({ userId: USER_A, profile: PROFILE as never });
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
}

/** Seeds the stored focus state and session row. */
export async function seed(
  state: object,
  over: { elapsedS?: number; plan?: SessionPlan; warmup?: boolean } = {},
): Promise<void> {
  window.localStorage.setItem(KEY, JSON.stringify(state));
  await seedSession({
    plan: over.plan ?? PLAN_P,
    started_at: startedFor(over.elapsedS ?? 600),
    warmup_in_budget: over.warmup ?? true,
  });
}

export const addButton = () => screen.queryByRole("button", { name: "Add exercise" });

/** Taps "Add exercise" and waits for the lazy sheet's search field. */
export async function openSheet(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
  await flushReal();
  await findEl(() => screen.queryByRole("searchbox"));
  await flushReal();
}

/** Types a query and taps "Add {name}". */
export async function addNamed(query: string, name: string): Promise<void> {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
  await flushReal();
  fireEvent.click(screen.getByRole("button", { name: `Add ${name}` }));
  await flushReal();
  await flushReal();
}

export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await flushReal();
}
