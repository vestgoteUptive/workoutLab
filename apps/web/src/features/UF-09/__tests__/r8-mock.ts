// T-0304d: the `offline-spies.js` module (real writes wrapped in spies) with `loadLibrary`
// answering L_R8 (L1 + lateral-raise) and no cached exercise details.
//   vi.mock("../../../lib/offline/index.js", (orig) => import("./r8-mock.js").then((m) => m.r8Mock(orig)));
// And the REAL engine `timeCheck`, wrapped in a spy:
//   vi.mock("@workoutlab/engine", (orig) => import("./r8-mock.js").then((m) => m.engineSpy(orig)));
import { vi } from "vitest";
import { offlineSpies } from "./offline-spies.js";
import { L_R8 } from "./r8-fixtures.js";

type OfflineModule = typeof import("../../../lib/offline/index.js");
type EngineModule = typeof import("@workoutlab/engine");

export async function r8Mock(importOriginal: () => Promise<unknown>): Promise<OfflineModule> {
  const base = await offlineSpies(importOriginal);
  return {
    ...base,
    loadLibrary: vi.fn(async () => L_R8),
    loadExerciseDetail: vi.fn(async () => null),
  } as OfflineModule;
}

export async function engineSpy(importOriginal: () => Promise<unknown>): Promise<EngineModule> {
  const actual = (await importOriginal()) as EngineModule;
  return { ...actual, timeCheck: vi.fn(actual.timeCheck) };
}
