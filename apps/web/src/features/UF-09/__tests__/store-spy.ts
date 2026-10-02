// A `vi.mock` factory for `../store.js` that records every event the host dispatches, so a test
// can count end events (AC-4, AC-9: "exactly once"), not just the transitions they cause.
//   vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
import type { FocusEvent } from "../machine.js";
import type { FocusStore } from "../store.js";

type StoreModule = typeof import("../store.js");

export const dispatched: FocusEvent[] = [];
/** Every store the host created, newest last (T-0304e: a test dispatches what T-0304b's views
 *  will, e.g. `SAVED`, without a view of its own). */
export const stores: FocusStore[] = [];

export function lastStore(): FocusStore {
  const store = stores[stores.length - 1];
  if (!store) throw new Error("no focus store created yet");
  return store;
}

export function countOf(type: FocusEvent["type"]): number {
  return dispatched.filter((e) => e.type === type).length;
}

export async function storeSpy(importOriginal: () => Promise<unknown>): Promise<StoreModule> {
  const actual = (await importOriginal()) as StoreModule;
  return {
    ...actual,
    createFocusStore(options) {
      const store = actual.createFocusStore(options);
      const spied: FocusStore = {
        ...store,
        dispatch(event) {
          dispatched.push(event);
          store.dispatch(event);
        },
      };
      stores.push(spied);
      return spied;
    },
  };
}
