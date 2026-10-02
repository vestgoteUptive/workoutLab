// T-0304c: a `vi.mock` factory for `../session.js` that records every call the host makes to the
// hook's `recordSet`, before the hook's own in-flight dedupe. So a test sees a second auto-log
// attempt (the host's guard missing) even though `lib/offline` would only get one write.
//   vi.mock("../session.js", (orig) => import("./session-spy.js").then((m) => m.sessionSpy(orig)));
import type { FocusSetInput } from "../session.js";

type SessionModule = typeof import("../session.js");

export const hookRecordCalls: FocusSetInput[] = [];

export async function sessionSpy(importOriginal: () => Promise<unknown>): Promise<SessionModule> {
  const actual = (await importOriginal()) as SessionModule;
  return {
    ...actual,
    createFocusActions(deps) {
      const actions = actual.createFocusActions(deps);
      return {
        ...actions,
        recordSet(input) {
          hookRecordCalls.push(input);
          return actions.recordSet(input);
        },
      };
    },
  };
}
