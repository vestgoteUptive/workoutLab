---
id: T-0308a
title: UF-07.1 Routine editor — name plus an ordered list of 1–8 distinct exercises (search picker, move up/down, remove), read-only progression card, online-only Save/Delete in the D-0070 §2 order
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0001, D-0002, D-0020, D-0021, D-0045, D-0063, D-0067, D-0070, D-0071, D-0075, D-0081]
deps: [T-0318, T-0319, T-0334]
status: done
---
<!-- Written by product-owner 2026-09-29 (groom mode) from T-0308's [a] ACs, D-0070 §1–§2, D-0071 §1/§3/§8/§10, D-0075 and D-0081 §4–§6. All three deps are done (T-0334 merged as f057d58). Build flow: wl-build-web. About ½ day. Runs in parallel with T-0308b, T-0306a, T-0307a and T-0307b (no path overlap). -->

## Why
UF-07.1 is the only place a user builds a saved routine. User flows v2 describes it as "Exercises, sets, progression rule", but the engine ignores routines: `suggest` takes only `pinnedIds`, sets are fitted to the time budget (principle 2), and progression is rule 14 for every exercise (principle 3). D-0070 §1 therefore cuts v1 to **a name plus an ordered list of 1–8 distinct exercises**, with a read-only progression card. An editable sets, reps or progression field would promise behaviour the engine doesn't have, so AC-A7 checks that none exists.

Both routes already exist (`/plan/routines/new` and `/plan/routines/:routineId` → `features/UF-07` `RoutineEditor`, `protected`, no tab bar, T-0318), so this ticket adds no route and edits no shared file. Writes are plain supabase-js calls under RLS (D-0001). The `routines`/`routine_items` tables, their unique `(routine_id, position)`, the composite FK with `on delete cascade`, the owner RLS policies and the `authenticated` grants all exist (T-0100b, `docs/data-model.md`). **No endpoint or column is missing.**

## Scope
- In:
  - **Data (D-0067 §3, D-0071 §8).**
    - The routine loads from `loadRoutines()` and the exercise names from `loadLibrary()`, both from `lib/offline`, read-only.
    - The feature never touches IndexedDB directly: no `offlineDb()`, no Dexie import, no cache write.
    - Writes use `supabase` from `lib/auth/client.ts` and go only to `routines` and `routine_items`.
  - **The screen** (`[data-screen-id="UF-07.1"]`):
    - `<h1>`: `Edit routine` (`en.screens.routineEditor`) on **both** `/plan/routines/new` and `/plan/routines/:id`. User flows v2 names UF-07.1 "Edit routine". T-0318's accepted `app/__tests__/routes.phase3.render.test.tsx` asserts that heading text on `/plan/routines/new` (line 35), and `en.ts` says the stub titles "stay as the screens' <h1> text".
    - **Shell tests you can't edit** (web-shell's `app/**`), which stay green unmodified:
      - `routes.phase3.render.test.tsx:65-76` scans `features/UF-07/index.tsx`. The body of `export function RoutineEditor(` (up to its first line that starts with `}`) must contain the literal `<h1>{en.screens.routineEditor}</h1>`. So the heading is rendered by `RoutineEditor` itself, not by a child component.
      - `routes.phase3.render.test.tsx:40-50` and `auth-guard.phase3.test.tsx:97-104` render `/plan/routines/R1` with no cached routine, no user id in the session, and in one case a `supabase` mock that has no `from`. The `[data-screen-id="UF-07.1"]` host and its `<h1>` are therefore in the DOM on the **first** render, before any `await`, including the loading state and an unknown id before the D-0081 §5 redirect. A missing `from` or a failed refresh never throws out of the component.
    - A **name** field labelled `Name`, trimmed, 1–40 characters after trimming.
    - The **exercise list** in order. Each row shows `{n}. {library name}` and has three buttons: `Move {name} up`, `Move {name} down` and `Remove {name}`.
    - `Add exercise` opens the **in-screen picker** (D-0081 §6): a search field `Search exercises`, then one row per match with an `Add {name}` button. An exercise already in the list shows `Added` (disabled). With 8 items every Add is disabled and `Up to 8 exercises` is shown. No match reads `No exercises match "{query}"`. `Done` closes the picker. The picker stays open after an Add, so several exercises can be added in a row.
    - The **progression card**, read-only, with the exact D-0070 §1 text: `Double progression. When every set reaches the top of its rep range, the weight goes up next time. After a long break or two short sessions in a row, it steps back.`
    - `Save`, `Cancel` (→ `/plan`, no writes, no confirm, D-0081), and on an existing routine only, `Delete routine` → a confirm dialog `Delete {name}?` with `Delete` and `Keep routine`.
    - `<OfflineStatus variant="text" />`, imported read-only from `components/offline-status/OfflineStatus.tsx`.
  - **Save (D-0070 §2):**
    - (1) `from("routines").upsert({id, name})`. A new routine's `id` is `crypto.randomUUID()`, generated **once per mount** (D-0081 §4).
    - (2) `from("routine_items").delete().eq("routine_id", id).gte("position", n)`.
    - (3) `from("routine_items").upsert(items, {onConflict: "routine_id,position"})`, where every item is exactly `{routine_id, position, exercise_id, sets: 3, reps_min: null, reps_max: null, duration_s: null, progression: "double_progression"}`.
    - Each step runs only if the previous one succeeded. After (3): `refreshRoutines()`, then navigate to `/plan`. A failure of `refreshRoutines()` after a successful write doesn't show an error: the write landed, and `/plan`'s own refresh catches up.
    - While a Save is in flight, Save is disabled.
  - **Delete:** `from("routines").delete().eq("id", R)`, which cascades to the items. Then `refreshRoutines()`, then `/plan`.
  - **Offline:** Save and Delete are disabled and `Connect to save` is shown. Editing the draft still works. Both re-enable on the `online` event without a remount.
  - **Unknown `:routineId`** follows D-0081 §5.
  - **Strings:** in `apps/web/src/lib/i18n/flows/uf-07.ts`, **this ticket's own file only** (D-0071 §1, D-0075). Written multi-line, with the closing `} as const;` at column 0 (D-0075's shape regex rejects a one-line filled literal, T-0335). `en.ts` is not edited. `en.screens.routineEditor` is reused.
  - **Exports:** `features/UF-07/index.tsx` exports exactly `RoutineEditor` (D-0071 §3). Everything else stays module-private.
  - **e2e:** `tests/e2e/uf-07-routines.spec.ts`, a new file (D-0071 §10).
- Out:
  - **Starting a workout from a routine** (routine items → `sessionInput.pinnedIds` on UF-08.1). That is the D-0070 §1 follow-up for web-feature:UF-08. The same goes for UF-08.3's "Always use this in <routine>".
  - Per-routine sets, reps, duration or progression editing (D-0070 §1), and drag to reorder (D-0070 §1 makes it optional; the move buttons are the accessible path and are what ships).
  - The routine **list** on UF-11.2 and the `New routine` link: T-0308b, a different lane.
  - Any offline write or queue for routines (NFR-SYNC-3 server-wins, D-0070 §2).
  - A database length check on `routines.name`. The 1–40 rule is client-side only; the column is plain `text` and stays that way (no contract change).
  - Any change to `lib/**`, `components/**`, `app/**`, `apps/web/eslint.config.mjs`, and any contract.

### Edge cases that are in scope
- **Offline:** the routine renders from the cache with no network call awaited. Save and Delete are disabled with `Connect to save`, and they enable on `online` (AC-A9).
- **Partial failure:** a failed step stops the later ones, and the draft stays on screen. A retry of a **new** routine reuses its id, so there is never a second routine (AC-A2, AC-A10).
- **A deep link the cache doesn't hold yet:** refresh once, then decide (AC-A11).
- **An item whose exercise isn't in the cached library** (a removed seed row, or a cold library cache): the row shows the raw `exercise_id`, can be moved and removed, and is saved unchanged if kept (AC-A12).
- **Zero history / new user:** the editor doesn't depend on training history. An empty `/plan/routines/new` has Save disabled until there is a name and one exercise (AC-A5).
- **Returning after 10 days off / time running out:** not applicable. UF-07.1 is never shown during a workout, and T-0318's import ban already stops UF-03/04/05/08/09 from importing `features/UF-07`.

## Acceptance criteria
- **Test surfaces.** Vitest + Testing Library + `fake-indexeddb` in `apps/web/src/features/UF-07/__tests__/*.test.tsx`. Supabase is spied at `from(table)` and records every call in order, including its method (`upsert`/`delete`/`update`/`insert`/`select`), payload, options and filter chain (`eq`/`gte`). A feature-local spy is fine. `lib/offline/__tests__/supabase-spy.ts` may be imported read-only but not edited. Playwright in `tests/e2e/uf-07-routines.spec.ts` where tagged **e2e**.
  - **`refreshRoutines` is a stub.** Use `vi.mock` of `lib/offline`, passing every other export through, so that `refreshRoutines` is a resolved `vi.fn()`. The real one calls `from("routines").select(…)` and `from("routine_items").select(…)`. Its calls would then land in the spy's log and contradict AC-A1's "exactly three calls" and AC-A8's "never `routine_items`". AC-A11's third case gives the stub a body that writes the cache.
  - **What counts as a failed step.** A step fails when its promise rejects **or** when it resolves with a non-null `error`. supabase-js resolves `{data, error}` on a 4xx/5xx and doesn't throw. Every failure case in AC-A10 runs in both forms.
- **Fixtures.** Seed the `lib/offline` cache with a library that holds at least these entries:
  - `barbell-back-squat` "Barbell back squat"
  - `barbell-front-squat` "Barbell front squat"
  - `goblet-squat-dumbbell` "Goblet squat"
  - `romanian-deadlift-barbell` "Romanian deadlift (barbell)"
  - `leg-curl-machine` "Leg curl (machine)"
  - `jumping-jacks` "Jumping jacks" (`kind: "warmup"`)
  - enough further `kind: "exercise"` entries to reach 9
  - Routine R `{id: "22222222-2222-4222-8222-222222222222", name: "Lower A", items: [barbell-back-squat, romanian-deadlift-barbell, leg-curl-machine]}`.
  - The user is signed in, and `navigator.onLine = true` unless the AC says otherwise. The signed-in user id is **not** R's id. `11111111-1111-4111-8111-111111111111` is the e2e `FAKE_USER_ID` and the `lib/offline` tests' `USER`. If R reused it, a Delete that filtered on the user id would still pass AC-A8's `eq("id", R)`.

- **AC-A1 (create)** On `/plan/routines/new`, online:
  - Given the name `Lower A` and Add Barbell back squat, then Add Romanian deadlift (barbell), When Save is pressed, Then the spy records exactly these three calls, in this order:
    - `routines.upsert({id: <uuid v4>, name: "Lower A"})`, where the payload has exactly the keys `id` and `name` (no `user_id`, no timestamps).
    - `routine_items.delete()` with `eq("routine_id", <same id>)` and `gte("position", 2)`.
    - `routine_items.upsert([{routine_id: <same id>, position: 0, exercise_id: "barbell-back-squat", sets: 3, reps_min: null, reps_max: null, duration_s: null, progression: "double_progression"}, {…, position: 1, exercise_id: "romanian-deadlift-barbell", …}], {onConflict: "routine_id,position"})`.
  - Then `refreshRoutines` is called, and the location becomes `/plan`.
  - **Contrast:** the id matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`, and two separate mounts produce two different ids.
- **AC-A2 (a retry reuses the new routine's id — D-0081 §4)** On `/plan/routines/new`:
  - Given the `routine_items.upsert` rejects on the first Save and succeeds on the second, When Save is pressed twice (once per attempt), Then both `routines.upsert` calls carry the **same** `id`.
  - Across the whole test the spy saw exactly **one** distinct `routines.id`.
- **AC-A3 (edit, reorder, remove)** On `/plan/routines/22222222-…`, Given the loaded list [Barbell back squat, Romanian deadlift (barbell), Leg curl (machine)]:
  - When `Move Leg curl (machine) up` is pressed once, then `Remove Barbell back squat`, then Save, Then:
    - the rows read `1. Leg curl (machine)` and `2. Romanian deadlift (barbell)` before Save
    - the `delete` has `gte("position", 2)`
    - the items upsert holds exactly `[{position: 0, exercise_id: "leg-curl-machine"}, {position: 1, exercise_id: "romanian-deadlift-barbell"}]` (plus the fixed columns)
    - `routines.upsert` carries `{id: "22222222-…", name: "Lower A"}`
  - **Contrast:** a Save with no edits still sends all three calls with the loaded order unchanged. A server-wins rewrite is the D-0070 §2 behaviour, not a no-op.
- **AC-A4 (move buttons: ends, keyboard, focus)**
  - `Move {first} up` and `Move {last} down` are `disabled`, and every other move button is enabled.
  - With the keyboard only (Tab to `Move Leg curl (machine) up`, press Enter), the row moves to position 2. Focus then stays on that same row's `Move Leg curl (machine) up` button.
  - Pressing Enter again moves it to position 1. `Move … up` is now disabled, so focus lands on `Move Leg curl (machine) down`.
  - A polite live region announces `Leg curl (machine) moved to position 1`.
  - Space activates the buttons the same way.
- **AC-A5 (limits)**
  - The name `  Lower A  ` saves as `Lower A`.
  - An empty name, a whitespace-only name, or a trimmed length of 41 disables Save and shows `Name your routine (up to 40 characters)`. **Contrast:** a trimmed length of exactly 40 enables Save and the message is **absent** from the DOM.
  - With 0 exercises, Save is disabled. **Contrast:** Save enables after adding 1.
  - In the picker, an exercise already in the list shows `Added` and its button is `disabled`. Pressing it adds nothing, and the list length is unchanged.
  - With 8 items, every picker Add button is `disabled` and `Up to 8 exercises` is shown. After removing one, the Add buttons enable and the message is absent.
- **AC-A6 (picker scope and search — D-0081 §6)**
  - With an empty query, the picker lists every `kind: "exercise"` fixture entry in `localeCompare` order by name, and `Jumping jacks` (`kind: "warmup"`) is **absent**.
  - The query `SQUAT` lists exactly Barbell back squat, Barbell front squat and Goblet squat (case-insensitive substring), in that order.
  - `zzz` shows `No exercises match "zzz"` and no Add buttons.
- **AC-A7 (no sets/reps/progression editing — D-0070 §1)**
  - The screen has no `input[type=number]`, no `select`, no `role="spinbutton"` and no control whose accessible name matches `/sets|reps|progression/i`. The only text input besides the picker's search is `Name`.
  - The progression card's text equals the D-0070 §1 sentence exactly, and there is no button or link inside the card.
  - A routine whose cached items carry an extra `sets: 5` property is rewritten with `sets: 3` on Save (AC-A1's fixed columns). `CachedRoutineItem` is only `{position, exerciseId}`, so the fixture adds the property with a cast, standing in for a server row with `sets: 5`. This pins that the UI never carries a sets value through.
- **AC-A8 (delete)**
  - On `/plan/routines/22222222-…`: `Delete routine` → the dialog `Delete Lower A?` → `Delete`. The spy then records exactly one call, `routines.delete()` with `eq("id", "22222222-…")`, followed by `refreshRoutines` and `/plan`.
  - During the whole test, `from` is **never** called with `session_sets`, `sessions` or `routine_items`. The cascade is the database's job.
  - `Keep routine` closes the dialog with no call.
  - **Contrast:** `/plan/routines/new` has no `Delete routine` control in the DOM.
- **AC-A9 (offline — D-0070 §2)** Given `navigator.onLine = false` and `fetch` stubbed to a promise that never resolves:
  - `/plan/routines/22222222-…` renders the 3 rows from the cache without waiting on the network.
  - Save and Delete are `disabled`, and `Connect to save` is shown.
  - Move and Remove still work on the draft.
  - The spy records **no** write.
  - When `navigator.onLine` becomes true and an `online` event is dispatched, Save and Delete enable **without a remount**, and `Connect to save` is absent.
  - **Contrast:** dispatching `offline` again disables both.
- **AC-A10 (errors)**
  - If `routines.upsert` rejects: `Couldn't save your routine. Try again.` is shown, and **neither** `routine_items` call is made.
  - If the `delete` rejects: the upsert of items isn't made.
  - If the items upsert rejects: the same message is shown, the draft (name and order) is still on screen, and the location is unchanged.
  - If `routines.delete` rejects: `Couldn't delete your routine. Try again.` is shown, the dialog closes, and the location is unchanged.
  - Each message renders inside the UF-07.1 form region, never as a `role="banner"` element or a page-level toast. Pressing Save again (a retry) re-runs the full three-step sequence from step (1).
- **AC-A11 (unknown routine id — D-0081 §5)**
  - Offline, with an id not in the cache: the app redirects to `/plan`, and `refreshRoutines` isn't called.
  - Online, with an id that isn't in the cache and that the refresh doesn't return: `refreshRoutines` is awaited once, then the app redirects to `/plan`.
  - Online, with an id that isn't in the cache but that the stubbed `refreshRoutines` writes into it: the editor renders that routine and **doesn't** redirect. This is the half that proves the refresh isn't skipped.
- **AC-A12 (an item missing from the library)** Given routine R2 with items [`barbell-back-squat`, `retired-exercise`], where `retired-exercise` isn't in the library cache:
  - the second row reads `2. retired-exercise` and has working move and remove buttons
  - a Save with no edits sends `exercise_id: "retired-exercise"` at position 1
  - nothing throws
- **AC-A13 (cancel, and double submit)**
  - `Cancel` after edits navigates to `/plan`, and the spy records **no** call.
  - A double click on Save (the second click while the first is in flight) produces exactly one `routines.upsert`.
- **AC-A14 (a11y — e2e, NFR-A11Y-1/-2)** In the preview build, with an injected session and the mocked Supabase (`mockSupabaseData` with a `routines`/`routineItems` fixture):
  - `@axe-core/playwright` reports 0 serious or critical violations on `/plan/routines/new` with the picker **open**, and on `/plan/routines/<R>`.
  - Every `button`, `input` and `a` on both screens has a `boundingBox()` of at least 44 × 44 CSS px.
  - A real-keyboard move (Tab to `Move Leg curl (machine) up`, press Enter) reorders the rows.
- **AC-A15 (strings, exports and the shared-file boundary)**
  - Every user-facing string comes from `en.uf07` or from an existing `en.*` key, and `react/jsx-no-literals` stays green.
  - `flows/uf-07.ts` is filled multi-line, with `} as const;` at column 0, so `lib/i18n/__tests__/flows.test.ts` (D-0075) stays green **unmodified**.
  - A test pins `Object.keys(await import("../index.js"))` to exactly `["RoutineEditor"]`.
  - `apps/web/src/app/__tests__/routes.phase3.render.test.tsx`, `auth-guard.phase3.test.tsx` and `App.test.tsx` stay green **unmodified** (see "Shell tests you can't edit" in Scope). A feature test also pins that `/plan/routines/new` and an unknown `/plan/routines/X` both have `[data-screen-id="UF-07.1"]` with `<h1>Edit routine</h1>` synchronously after the lazy chunk resolves, before any IndexedDB read settles.
  - The branch's `git diff --name-only main...HEAD` lists no path outside "Paths you may change".
  - `pnpm -w lint` is green.

## Paths you may change
- `apps/web/src/features/UF-07/**` (the lane: `web-feature:UF-07`).
- **Listed extras:**
  - `docs/tickets/T-0308a-routine-editor.md`: this file, for the build, QA and accept logs (added 2026-10-02 by the orchestrator after the H-13 catch-up).
  - `apps/web/src/lib/i18n/flows/uf-07.ts`: this ticket's own flow file, and no other (D-0071 §1, D-0075). Add keys only. The `export const uf07 = {…} as const;` shape stays, written multi-line.
  - `tests/e2e/uf-07-routines.spec.ts`: a new file only (D-0071 §10).
  - `tests/e2e/fixtures/uf-07-routines.ts`: an optional new file holding this spec's fixture data, passed to the existing `mockSupabaseData(page, fixtures)`. A spec-local `page.route` is fine for capturing writes.
- **Not yours, and each is already done for you:**
  - `apps/web/src/app/**`: both routes exist.
  - `apps/web/src/components/**`: OfflineStatus is a read-only import.
  - `apps/web/src/lib/**`, including `lib/i18n/en.ts`, every other `lib/i18n/flows/*.ts` and `lib/offline/**`.
  - `apps/web/eslint.config.mjs`.
  - `tests/e2e/fixtures/supabase-mock.ts`: read-only. Other lanes' specs share it, and editing it from five parallel lanes would conflict.
  - `apps/web/src/features/UF-11/**`: the routine list is T-0308b's.
  - Any file under `packages/**`, and every contract file.
  - If you believe you need one of these, stop and put it in your result as a follow-up.

## Contract impact
None. The writes use `routines {id, name}` and `routine_items {routine_id, position, exercise_id, sets, reps_min, reps_max, duration_s, progression}` exactly as in `docs/data-model.md`, under the existing owner RLS and `authenticated` grants (T-0100b). `user_id` is filled by its `auth.uid()` default, and the timestamps by `routines_before_write`. The `onConflict: "routine_id,position"` target is the existing unique `routine_items_routine_id_position_key`. D-0070 and D-0081 are `status: revisit`. Nothing here depends on a point D-0071 amended.

## Ambiguity resolved (state it, do not stall)
- The parent T-0308 AC-A1/A2 named exercises `back-squat`, `romanian-deadlift` and `leg-curl`, which are not library ids. **Default taken: the real seed ids** `barbell-back-squat`, `romanian-deadlift-barbell` and `leg-curl-machine`, and the move/remove buttons are named with the **library name** (`Move Leg curl (machine) up`) rather than the id, because a screen reader should say the name.
- The `<h1>` is `Edit routine` on `/plan/routines/new` as well, not `New routine` (check mode, 2026-09-29). The groom's `New routine` heading fails T-0318's accepted `routes.phase3.render.test.tsx:35`, which this lane may not edit. User flows v2 already names the screen "Edit routine". If product wants a distinct heading for a new routine, it's a web-shell follow-up to change that test row, plus a one-line change here. `New routine` stays the UF-11.2 link label (T-0308b).
- The new-routine id lifetime, the unknown-id refresh, the picker order and match rule, and Cancel without a confirm are D-0081 §4–§6.

## Definition of done
- Every AC has a passing test.
- `pnpm -w typecheck lint test --force --concurrency=1` is green. The **`--force`** matters: without it, turbo replays another worktree's cache and reports a false green.
- `pnpm --filter @workoutlab/web test:e2e` is green, including `uf-07-routines.spec.ts`.
- Contracts are unchanged.
- No file outside "Paths you may change" is touched. Check your own `git diff --name-only` before you hand back. T-0320's `check-lane-paths` reads this section's backticked paths once it lands.
- Commits start `T-0308a:` and cite the screen id (e.g. `T-0308a UF-07.1: stable id across save retries`).
- Make no bundle-size claim unless you ran a fresh `pnpm --filter @workoutlab/web build` and report measured gzip numbers (T-0322).

## Build log (frontend-dev)

### Post-merge catch-up 2026-10-02 (landed on main by the orchestrator)
- Merged main (ad1d5db, 7c2abc1); only `.squad/board.md` conflicted (took main's). AC-A1…A15 were already built and tested.
- Fix: `uf-07-routines.spec.ts` imports `./fixtures/guarded-test.js`, no own listeners (T-0904/T-0430).
- Reds seen: e2e `shell.spec.ts` AC-6 `/plan/routines/R1` once (D-0091 race now that UF-07.1 is built, T-0452); UF-11 AC-B16 diff test (retired on main by T-0450).
- Gate at ab4cbb7: web turbo `--force` green, repo-checks 146/146 and check-all 0 (fresh clone), format clean, e2e 158/158.

## QA log (qa-tester, HEAD 2841d40, tree clean)
- AC→test: A1/A2/A3/A5-trim/A7-sets/A8/A10/A13 `__tests__/save.test.tsx`; A4/A5/A6/A7-ui/A12 `editing.test.tsx` + `keyboard.test.tsx`; A9/A11 `offline.test.tsx`; A15 `shell.test.tsx` (exports, sync h1) + lint/flows.test; A14 e2e `uf-07-routines.spec.ts` (axe x2, 44px, keyboard move) + A1 e2e create.
- Baseline `vitest run src/features/UF-07`: 5 files, 71/71.
- Planted faults (backup copy, restored by cp): offline save allowed → A9 2 red; drop focus retention → A4 3 red; no redirect on unknown id → A11 5 red (+1); `gte(position, n+1)` → A1/A3 3 red; name not trimmed → A5 1 red.
- e2e `uf-07-routines` + `shell.spec`: 21 pass, 1 red = shell AC-6 `/plan/routines/R1` offline (known T-0452 race, unknown id redirects).
- Gate (main merged): typecheck/lint/test turbo 19/19 cached green; repo-checks 146/146; check-all rc 0.
- Verdict: done.

## Accept log (product-owner, HEAD bf901aa, tree clean)
- AC→test: every AC A1–A15 has a passing test (QA map above). Planted faults turned A1/A3/A4/A5/A9/A11 red. Diff paths are all inside "Paths you may change". Contracts unchanged. D-0070 §1–§2 (name + 1–8 items, fixed columns, three-step server-wins save, online-only) and D-0081 §4–§6 (one id per mount, refresh then redirect, picker scope/order, Cancel with no confirm) hold.
- T-0453 judged against AC-A4/A14: A4 pins focus only for the move buttons, and A14 pins axe 0 serious/critical, 44 px and the keyboard move. Focus after Remove/Add and the dialog focus trap aren't in any AC, so they're fine as a follow-up. They are real WCAG 2.4.3 gaps, so T-0453 should be groomed next for UF-07. T-0454 (unreadable cache, empty-library copy) is out of AC scope too.
- The shell AC-6 e2e red is T-0452 (a D-0091 race), not this ticket.
- Verdict: done.
