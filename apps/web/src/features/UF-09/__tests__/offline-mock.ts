// The `vi.mock` factory every host test uses for `lib/offline/index.js`: the real module, with
// `offlineDb` wrapped in a spy (so a test can make it throw), `loadLibrary` answering the L1
// library (D-0111 §2), and every `refresh*` a spy (AC-8: UF-09 calls none of them).
//   vi.mock("../../../lib/offline/index.js", (orig) => import("./offline-mock.js").then((m) => m.offlineMock(orig)));
import { vi } from "vitest";
import { L1 } from "./fixtures.js";

type OfflineModule = typeof import("../../../lib/offline/index.js");

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

export async function offlineMock(importOriginal: () => Promise<unknown>): Promise<OfflineModule> {
  const actual = (await importOriginal()) as OfflineModule;
  const refresh = Object.fromEntries(REFRESH_NAMES.map((n) => [n, vi.fn(async () => undefined)]));
  return {
    ...actual,
    ...refresh,
    offlineDb: vi.fn(actual.offlineDb),
    loadLibrary: vi.fn(async () => L1),
  } as OfflineModule;
}
