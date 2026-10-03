// UF-09 Focus mode (T-0304a, T-0304e, T-0395). The public surface: the host, the focus-session
// hook other flows' seam overlays and T-0304b–d's views read and write through (D-0071 §3 §5),
// and the Today "Resume workout" card (D-0139 §4), mounted by the Today flow's own slot file.
export { SessionHost } from "./host.js";
export { ResumeCard } from "./resume-card.js";
export { useFocusSession } from "./session.js";
export type { FocusSession, FocusSetInput } from "./session.js";
export type { SeamAction } from "./seams.js";
