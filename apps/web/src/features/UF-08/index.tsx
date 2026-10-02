// UF-08 Session setup (T-0303a). Exports the `/session/setup` host (D-0071 §3, D-0107 §1) and the
// focus-mode prefs UF-09 reads (T-0303d, D-0110 §6).
export { SessionSetup } from "./SessionSetup.js";
export { readFocusPrefs, writeFocusPrefs } from "./focus-prefs.js";
export type { FocusPrefs } from "./focus-prefs.js";
