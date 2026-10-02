---
id: D-0110
title: UF-08.4 build defaults (T-0303d) — summary copy, a clock read for done-by and at the Start tap, one session id per Ready visit reused on retry, replace navigation into focus mode, the focus-prefs module shape and its storage failure mode
status: revisit
date: 2026-10-02
by: product-owner (groom T-0303b/T-0303d/T-0304a)
area: product
builds-on: D-0063 §5, D-0065 §6 §7, D-0071 §3 §6, D-0107 §4
---
## Context
D-0065 §6–§7 fix what UF-08.4 shows and how Start writes the session: `upsertSession` first, navigation after the IndexedDB write resolves, one session per Start, a new id per Start. Seven points are still open, and each changes a test:
1. D-0107 §4 reads the clock once, when the setup host mounts. If `started_at` uses that value, every minute the user spends on UF-08.1–.4 is charged to the workout, and the rule 8 time check (UF-09.8) starts behind.
2. Which clock the Ready "done by" uses (D-0107 Consequences say UF-08.4 uses its own `now + m`, but not when it is read).
3. What a failed write does, and whether a retry makes a second session.
4. Whether the jump to `/session/<id>` pushes or replaces. A push leaves `?step=ready` under the workout in history, so Back from focus mode lands on a setup screen with a Start button.
5. Singular and plural copy, and the empty plan's summary.
6. `focus-prefs.ts`'s shape when `localStorage` throws (private browsing) or holds junk.
7. Whether `focus-prefs.ts` may import anything at runtime. UF-09 imports it through `features/UF-08/index.tsx` (D-0071 §3), so a heavy import there would land in the UF-09 chunk.

## Decision
1. **A clock prop, read twice.** `SessionSetup` takes `clock?: () => Date` (default `() => new Date()`) beside the D-0107 §4 `now`. UF-08.1 and UF-08.2 keep using `now`.
   - **Done by.** The Ready step reads `clock()` once when it mounts. "Done by" = `formatTime(readyNow + m × 60 s)` with the host's `locale` and `timeZone`, where `m = ceil(totalS / 60)`.
   - **`started_at`.** Start reads `clock()` at the tap, and `started_at` is that instant as `toISOString()`. Time spent on setup is not charged to the workout.
2. **Summary copy** (strings in `flows/uf-08.ts`): "{m} min · warm-up + {n} {exercise|exercises} · {s} {set|sets} · done by {HH:MM}", where n = `plan.items.length` and s = Σ `sets` + the number of items with a back-off (the D-0107 §5 count). Singular when the value is 1.
   - With `plan.items` empty: "{m} min · warm-up only · done by {HH:MM}".
   - With `plan.warmup` empty as well as `plan.items`: "Nothing planned · done by {HH:MM}". Start still works (an empty plan is valid, D-0065 §3).
   - With `plan.warmup` empty but items present, the "warm-up + " part is left out.
3. **One session id per Ready visit.**
   - The id is `crypto.randomUUID()`, made on the first Start tap of a visit to `?step=ready`.
   - A tap while the write is pending does nothing.
   - If `upsertSession` rejects, UF-08.4 stays, shows "Couldn't start the workout. Try again." (`role="alert"`, which is allowed here because UF-08 is not focus mode), and re-enables Start.
   - A retry reuses the same id. `upsertSession` replaces by id, so a write that landed before the error was reported never becomes a second session.
   - Leaving the Ready step (Back) drops the id, and the next visit makes a new one. Two setups, or two devices, still give two sessions (NFR-SYNC-4).
4. **Replace navigation.** After the write resolves, Start calls `navigate("/session/<id>", {replace: true})`. Back from focus mode then goes to the entry before setup (normally `/`), never to a setup step.
5. **Offline is the same path.** `upsertSession` writes IndexedDB and never waits for the network. The `AutoSync` queue flushes the row later (T-0300c). "Later" means the next AutoSync trigger: an app mount or reload, the `online` event, or a `SIGNED_IN`/`TOKEN_REFRESHED` auth event (clarified by D-0112 §3). Start makes no fetch of its own, online or offline.
6. **`features/UF-08/focus-prefs.ts`:**
   - It exports `readFocusPrefs(): FocusPrefs`, `writeFocusPrefs(prefs: FocusPrefs): void` and `type FocusPrefs = {sound: boolean; voice: boolean; keepAwake: boolean}`.
   - The storage value is `localStorage["wl-focus-prefs"]` = `JSON.stringify({version: 1, sound, voice, keepAwake})`.
   - `readFocusPrefs` returns the defaults `{sound: true, voice: true, keepAwake: true}` when the key is missing, the JSON is invalid, `version !== 1`, any field isn't a boolean, or `localStorage` throws.
   - `writeFocusPrefs` swallows a throwing `localStorage`. The switch still shows the new value for the rest of the visit.
   - The module has **no runtime imports** (type-only imports are allowed), so UF-09 pulls in only these few lines.
   - `features/UF-08/index.tsx` re-exports `readFocusPrefs`, `writeFocusPrefs` and `type FocusPrefs`. Its runtime keys become `["SessionSetup", "readFocusPrefs", "writeFocusPrefs"]`.
7. **Back from Ready** goes to `?step=suggested` with the same `Workout` (reference-equal) and the D-0109 §1 inputs record unchanged.

## Consequences
- T-0303d encodes §1–§7. T-0303a's export pin (`["SessionSetup"]`) is updated by T-0303d to the §6 list. That pin test lives in `features/UF-08/**`, the same lane.
- T-0304c reads the prefs with `readFocusPrefs()` from `features/UF-08/index.tsx` (D-0071 §3) and gets the defaults when nothing is stored.
- UF-09's elapsed time (rule 8) starts at the Start tap, so the first UF-09.8 check is fair to the user.

## Revisit when
- Users start a workout and come back to setup by mistake often. Then consider a confirm on leaving focus mode instead of the replace.
- The prefs grow past three switches. Then add a version 2 with a migration from version 1.
