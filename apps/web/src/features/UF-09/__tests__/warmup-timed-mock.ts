// T-0304c: the `offline-spies.js` module (real writes wrapped in spies) plus the ticket's reads:
// `loadLibrary` answers L1, and `loadExerciseDetail` answers wu-scap-push-up → cue "Arms
// straight", every other id (wu-band-pull-apart among them) → `null`.
//   vi.mock("../../../lib/offline/index.js", (orig) => import("./warmup-timed-mock.js").then((m) => m.warmupTimedMock(orig)));
import { vi } from "vitest";
import type { ExerciseDetail } from "../../../lib/offline/index.js";
import { L1 } from "./fixtures.js";
import { offlineSpies } from "./offline-spies.js";

type OfflineModule = typeof import("../../../lib/offline/index.js");

export const SCAP_CUE = "Arms straight";

const SCAP_DETAIL: ExerciseDetail = {
  id: "wu-scap-push-up",
  instructions: [],
  mistakes: [],
  cue: SCAP_CUE,
  source: "test",
  license: "CC0",
  attribution: null,
  sourceUrl: null,
  variants: [],
};

export async function warmupDetail(id: string): Promise<ExerciseDetail | null> {
  return id === "wu-scap-push-up" ? SCAP_DETAIL : null;
}

export async function warmupTimedMock(
  importOriginal: () => Promise<unknown>,
): Promise<OfflineModule> {
  const base = await offlineSpies(importOriginal);
  return {
    ...base,
    loadLibrary: vi.fn(async () => L1),
    loadExerciseDetail: vi.fn(warmupDetail),
  } as OfflineModule;
}
