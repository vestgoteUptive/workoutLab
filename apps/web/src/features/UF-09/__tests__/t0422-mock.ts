// T-0422 `vi.mock` factories: spies over the REAL `lib/offline` queue writes (every write, the
// re-exports in `lib/offline/index.js` included, because they are the same module), and a spy on
// the hook's `replaceItem`, so a test sees the seam's exact call.
//   vi.mock("../../../lib/offline/queue.js", (orig) => import("./t0422-mock.js").then((m) => m.queueSpies(orig)));
//   vi.mock("../session.js", (orig) => import("./t0422-mock.js").then((m) => m.replaceSpy(orig)));
import { vi } from "vitest";

type QueueModule = typeof import("../../../lib/offline/queue.js");
type SessionModule = typeof import("../session.js");

export async function queueSpies(importOriginal: () => Promise<unknown>): Promise<QueueModule> {
  const actual = (await importOriginal()) as QueueModule;
  return {
    ...actual,
    recordSet: vi.fn(actual.recordSet),
    editSet: vi.fn(actual.editSet),
    deleteSet: vi.fn(actual.deleteSet),
    upsertSession: vi.fn(actual.upsertSession),
  };
}

/** Every `replaceItem(...)` call the hook got, in order, with its arguments exactly as passed
 *  (AC-6: a call without `mainLiftId` has two). */
export const replaceCalls: unknown[][] = [];

export async function replaceSpy(importOriginal: () => Promise<unknown>): Promise<SessionModule> {
  const actual = (await importOriginal()) as SessionModule;
  return {
    ...actual,
    createFocusActions(deps) {
      const actions = actual.createFocusActions(deps);
      return {
        ...actions,
        replaceItem(...args: Parameters<typeof actions.replaceItem>) {
          replaceCalls.push([...args]);
          return actions.replaceItem(...args);
        },
      };
    },
  };
}
