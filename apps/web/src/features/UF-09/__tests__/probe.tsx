// T-0304e: reads `useFocusSession()` through a probe that the mocked view registry renders inside
// every machine view, so the production host needs no test hook.
//   vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));
import { useFocusSession, type FocusSession } from "../session.js";
import type { ViewProps } from "../views.js";

type ViewsModule = typeof import("../views.js");

/** The latest `useFocusSession()` value seen by a rendered machine view. */
export const probe: { current: FocusSession | null } = { current: null };

export function session(): FocusSession {
  if (!probe.current) throw new Error("no focus session rendered yet");
  return probe.current;
}

function Probe() {
  probe.current = useFocusSession();
  return null;
}

export async function probedViews(importOriginal: () => Promise<unknown>): Promise<ViewsModule> {
  const actual = (await importOriginal()) as ViewsModule;
  const VIEWS = Object.fromEntries(
    Object.entries(actual.VIEWS).map(([phase, View]) => {
      const Probed = (props: ViewProps) => (
        <>
          <Probe />
          <View {...props} />
        </>
      );
      return [phase, Probed];
    }),
  ) as ViewsModule["VIEWS"];
  return { ...actual, VIEWS };
}
