// UF-09 Focus mode (T-0304a, T-0304e). The public surface: the host, and the focus-session
// hook other flows' seam overlays and T-0304b–d's views read and write through (D-0071 §3 §5).
export { SessionHost } from "./host.js";
export { useFocusSession } from "./session.js";
export type { FocusSession, FocusSetInput } from "./session.js";
export type { SeamAction } from "./seams.js";
