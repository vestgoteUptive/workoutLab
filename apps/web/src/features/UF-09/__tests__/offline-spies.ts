// T-0304e: the `offline-mock.js` module plus spies over the REAL `lib/offline` writes, so a test
// counts calls and can hold or reject one while the default behaviour writes to fake-indexeddb.
//   vi.mock("../../../lib/offline/index.js", (orig) => import("./offline-spies.js").then((m) => m.offlineSpies(orig)));
import { vi } from "vitest";
import { offlineMock } from "./offline-mock.js";

type OfflineModule = typeof import("../../../lib/offline/index.js");

export async function offlineSpies(importOriginal: () => Promise<unknown>): Promise<OfflineModule> {
  const actual = (await importOriginal()) as OfflineModule;
  const base = await offlineMock(async () => actual);
  return {
    ...base,
    recordSet: vi.fn(actual.recordSet),
    editSet: vi.fn(actual.editSet),
    deleteSet: vi.fn(actual.deleteSet),
    upsertSession: vi.fn(actual.upsertSession),
  } as OfflineModule;
}
