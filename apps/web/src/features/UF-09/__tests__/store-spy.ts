// A `vi.mock` factory for `../store.js` that records every event the host dispatches, so a test
// can count end events (AC-4, AC-9: "exactly once"), not just the transitions they cause.
//   vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
import type { FocusEvent } from "../machine.js";

type StoreModule = typeof import("../store.js");

export const dispatched: FocusEvent[] = [];

export function countOf(type: FocusEvent["type"]): number {
  return dispatched.filter((e) => e.type === type).length;
}

export async function storeSpy(importOriginal: () => Promise<unknown>): Promise<StoreModule> {
  const actual = (await importOriginal()) as StoreModule;
  return {
    ...actual,
    createFocusStore(options) {
      const store = actual.createFocusStore(options);
      return {
        ...store,
        dispatch(event) {
          dispatched.push(event);
          store.dispatch(event);
        },
      };
    },
  };
}
