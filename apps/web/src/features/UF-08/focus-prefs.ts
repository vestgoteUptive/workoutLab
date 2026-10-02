// The three focus-mode device settings shown on UF-08.4 and read by UF-09 (T-0303d, D-0110 §6).
// Stored as `localStorage["wl-focus-prefs"]` = `{version: 1, sound, voice, keepAwake}`.
//
// No runtime imports (type-only imports are allowed): UF-09 imports this through
// `features/UF-08/index.tsx` (D-0071 §3), so these few lines are all it pulls in.

export type FocusPrefs = { sound: boolean; voice: boolean; keepAwake: boolean };

const KEY = "wl-focus-prefs";

function defaults(): FocusPrefs {
  return { sound: true, voice: true, keepAwake: true };
}

/** The stored prefs, or the defaults (all on) for a missing, junk or unreadable value. */
export function readFocusPrefs(): FocusPrefs {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (raw === null) return defaults();
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return defaults();
    const v = value as Record<string, unknown>;
    if (v.version !== 1) return defaults();
    if (
      typeof v.sound !== "boolean" ||
      typeof v.voice !== "boolean" ||
      typeof v.keepAwake !== "boolean"
    ) {
      return defaults();
    }
    return { sound: v.sound, voice: v.voice, keepAwake: v.keepAwake };
  } catch {
    // Invalid JSON, or storage that throws (private browsing).
    return defaults();
  }
}

/** Stores the prefs. A throwing `localStorage` is swallowed: the caller keeps its own state. */
export function writeFocusPrefs(prefs: FocusPrefs): void {
  try {
    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        sound: prefs.sound,
        voice: prefs.voice,
        keepAwake: prefs.keepAwake,
      }),
    );
  } catch {
    // Private browsing or a full quota: the switch still shows the new value for this visit.
  }
}
