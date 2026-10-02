// T-0419 `vi.mock` factories. Each suite does
//   vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
//   vi.mock("../../../lib/offline/history.js", (orig) => import("./mocks.js").then((m) => m.historySpies(orig)));
//   vi.mock("../../../lib/offline/queue.js", (orig) => import("./mocks.js").then((m) => m.queueSpies(orig)));
// The engine functions stay the real ones, wrapped in `vi.fn` so a test can read their calls or
// stub one call (AC-4's order test). Every `refresh*` is a spy that does nothing (AC-7), and
// `upsertSession` is the real one, spied (AC-2).
import { vi } from "vitest";

type Engine = typeof import("@workoutlab/engine");
type History = typeof import("../../../lib/offline/history.js");
type Queue = typeof import("../../../lib/offline/queue.js");
type FeatureLoaders = typeof import("../../../lib/offline/feature-loaders.js");

export const REFRESH_NAMES = [
  "refreshAll",
  "refreshHistory",
  "refreshLibrary",
  "refreshTargets",
  "refreshProfile",
  "refreshSessions",
  "refreshCheckins",
  "refreshRoutines",
] as const;

export async function engineSpies(importOriginal: () => Promise<unknown>): Promise<Engine> {
  const actual = (await importOriginal()) as Engine;
  return {
    ...actual,
    balance: vi.fn(actual.balance),
    normalizeHistory: vi.fn(actual.normalizeHistory),
    isHardSet: vi.fn(actual.isHardSet),
  };
}

export async function historySpies(importOriginal: () => Promise<unknown>): Promise<History> {
  const actual = (await importOriginal()) as History;
  const refresh = Object.fromEntries(
    REFRESH_NAMES.filter((n) => n in actual).map((n) => [n, vi.fn(async () => undefined)]),
  );
  return { ...actual, ...refresh } as History;
}

export async function queueSpies(importOriginal: () => Promise<unknown>): Promise<Queue> {
  const actual = (await importOriginal()) as Queue;
  return { ...actual, upsertSession: vi.fn(actual.upsertSession) };
}

/** T-0433: `loadSessions` is the real one, spied, so a test can stub one call (the no-entry case). */
export async function featureLoaderSpies(
  importOriginal: () => Promise<unknown>,
): Promise<FeatureLoaders> {
  const actual = (await importOriginal()) as FeatureLoaders;
  return { ...actual, loadSessions: vi.fn(actual.loadSessions) };
}
