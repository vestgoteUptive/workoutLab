// A side-effect-free leaf entry (D-0170 §1): the two focus-mode prefs functions and their type,
// with no component and nothing from SessionSetup.tsx. UF-09/device.ts imports this instead of
// the `index.tsx` barrel, so focus mode no longer evaluates SessionSetup (TR-0044, D-0170 §3).
export { readFocusPrefs, writeFocusPrefs } from "./focus-prefs.js";
export type { FocusPrefs } from "./focus-prefs.js";
