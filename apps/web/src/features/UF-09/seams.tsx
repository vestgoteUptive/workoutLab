// UF-09 seam registry (T-0304e, D-0071 §4, D-0111 §1). Other flows show their UI inside focus
// mode only through these two arrays; each seam ticket's one UF-09 grant is this file:
// - T-0306b adds `swap` to both arrays;
// - T-0305a adds `how-to` and `list-view` to `pauseSeamActions`.
// An entry's overlay replaces the current screen while it is open (principle 1). It gets the
// session through `ctx` and never imports UF-09, so there are no import cycles.
import type { ReactNode } from "react";
import type { FocusSession } from "./session.js";

/** A seam entry. `ctx` is the `useFocusSession()` value, which includes `close()`. */
export interface SeamAction {
  id: string;
  /** The button label (the seam's own flow strings). */
  label: string;
  render(ctx: FocusSession): ReactNode;
  /** `false` (swap, how-to): the workout stays or becomes paused while the overlay is open.
   *  `true` (list-view): the clocks keep running, and the check point is always `"next"`. */
  keepsClockRunning: boolean;
}

/** Rendered on UF-09.9 Paused. Empty until T-0306b / T-0305a. */
export const pauseSeamActions: SeamAction[] = [];

/** Rendered on UF-09.6 Next exercise. Empty until T-0306b. */
export const nextSeamActions: SeamAction[] = [];

export type SeamPlace = "pause" | "next";

/** User flows v2 order, built-ins and seams together (D-0071 §4). */
const ORDER: Record<SeamPlace, readonly string[]> = {
  pause: ["resume", "swap", "skip", "how-to", "list-view", "end"],
  next: ["ready", "swap"],
};

/** The action ids to render, in v2 order. An id the order doesn't know is dropped. Pure. */
export function orderActions(
  builtIns: readonly string[],
  seams: readonly { id: string }[],
  place: SeamPlace,
): string[] {
  const present = new Set([...builtIns, ...seams.map((s) => s.id)]);
  return ORDER[place].filter((id) => present.has(id));
}
