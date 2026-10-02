// T-0304b: the `offline-spies.js` module (real writes wrapped in spies) plus the ticket's reads:
// `loadLibrary` answers L2 (L1 + push-up) and `loadExerciseDetail` answers bench-press → cue
// "Shoulder blades back", every other id → `null`.
//   vi.mock("../../../lib/offline/index.js", (orig) => import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)));
import { vi } from "vitest";
import { offlineSpies } from "./offline-spies.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";

type OfflineModule = typeof import("../../../lib/offline/index.js");

export async function setLoopMock(importOriginal: () => Promise<unknown>): Promise<OfflineModule> {
  const base = await offlineSpies(importOriginal);
  return {
    ...base,
    loadLibrary: vi.fn(async () => L2),
    loadExerciseDetail: vi.fn(defaultDetail),
  } as OfflineModule;
}
