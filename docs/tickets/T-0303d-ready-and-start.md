---
id: T-0303d
title: UF-08.4 Ready — summary, the 4-step focus explainer, the focus-prefs module and its index.tsx hand-off, Start → upsertSession (IndexedDB first, offline the same) → /session/<id>
lane: web-feature:UF-08
screens: [UF-08.4]
decisions: [D-0002, D-0004, D-0015, D-0045, D-0053, D-0063, D-0065, D-0071, D-0086, D-0091, D-0103, D-0107, D-0108, D-0109, D-0110, D-0112]
deps: [T-0303b]
status: todo
---
<!-- Groomed 2026-10-02 by product-owner. Child of docs/tickets/T-0303-session-setup.md (ACs D1–D6 there, refined by D-0110). Build flow: wl-build-web. About ⅓ day. Becomes ready when T-0303b is done. Runs before T-0303c if both are ready (the parent's note). -->

## Why
UF-08.4 is the last screen before focus mode. It shows the engine's numbers for the plan the user is about to do, explains focus mode in four steps (principle 1: one task on screen, everything else behind Pause), and holds the three device settings that focus mode reads. Start creates the `sessions` row in IndexedDB **before** it navigates (NFR-OFF-2), so a workout started offline, or in a tab killed a second later, is never lost. Each Start makes its own session (NFR-SYNC-4). The web calls no Edge Function: the row goes through the `lib/offline` queue, and `AutoSync` sends it when it can (D-0071 §8).

## Scope
- In:
  - **The UF-08.4 view in `features/UF-08`,** replacing the T-0303b placeholder. It keeps `data-screen-id="UF-08.4"` and contains:
    - the summary line (D-0110 §2);
    - the 4-step explainer;
    - 3 switches;
    - Start;
    - Back → `?step=suggested`.
  - **`features/UF-08/focus-prefs.ts`** (D-0110 §6) and its re-export from `features/UF-08/index.tsx`.
  - **The `clock` prop** on `SessionSetup` (D-0110 §1).
  - **Start** → `upsertSession` → `navigate("/session/<id>", {replace: true})` (D-0110 §3–§5).
  - **Strings and e2e.** Strings go in `lib/i18n/flows/uf-08.ts`. e2e rows are appended to `tests/e2e/uf-08-setup.spec.ts`.
- Out:
  - Focus mode itself (T-0304a–e). Whatever the UF-09 host renders at `/session/<id>` is asserted only as `[data-screen-id^="UF-09"]`.
  - Reading the prefs in UF-09 (T-0304c).
  - Swap (T-0303c).
  - Calling `POST /sessions/{id}/finish` or any Edge Function.
  - Edits to `lib/offline/**` (`upsertSession` is imported as it is), `routes.ts`, `en.ts`, `components/**`, `tests/e2e/fixtures/**` and the shell tests (D-0108 §2–§3).
  - Any contract change.

### Edge cases that are in scope
- **Offline:** Start writes IndexedDB and navigates with no network wait, online or offline (AC-6). A session started offline is sent once the device is back online. A session started online is sent at the next AutoSync trigger, such as a reload (AC-10, D-0112 §3).
- **Time running out:** "done by" is computed when Ready opens, and `started_at` is the Start tap, so setup time isn't charged to the workout's rule 8 clock (AC-1, AC-4). An empty plan still starts (AC-7).
- **Zero history:** the summary renders the zero-history plan's numbers (W-R7E4, AC-1).
- **Returning after 10 days off:** nothing here depends on history beyond the `Workout` it receives. Two setups started on two devices after a break make two sessions (AC-6).
- **Double tap / failed write:** one session per Ready visit, and a retry reuses the id (AC-5).

## Acceptance criteria
**Test setup.**
- Vitest + Testing Library in `apps/web/src/features/UF-08/__tests__/`, with T-0303a's F-web fixtures.
- `now` and `clock` are injected (F-tz: `2026-09-27T12:00:00+02:00`, Europe/Stockholm, en-GB). `lib/offline` loaders are mocked. `upsertSession` is a spy unless an AC says "real" (then `fake-indexeddb`, plus a signed-in user stubbed through the supabase-js `localStorage` auth key that `currentUserId()` reads).
- W-R7E4 is the `api/openapi.yaml` Workout example.
- **Test rules** (state.md traps):
  - Both values of every binary condition get a test.
  - Negative asserts wait a real 50 ms macrotask.
  - The "navigate only after the write" assert (AC-4) must fail on a planted fault: navigate before awaiting. The build log records it turning red.
  - Positive asserts on lazy content wait (D-0103 §1).

- **AC-1 (summary, D-0110 §1–§2)**
  - **W-R7E4.** With `clock()` = F-tz now when Ready mounts, the summary reads "29 min · warm-up + 3 exercises · 9 sets · done by 12:29".
  - **The clock pair.** With `clock()` = 12:10 local when Ready mounts (and `now` still 12:00), it reads "… · done by 12:39". The done-by follows the Ready-time clock, not the mount `now`.
  - **Singular.** R7-E2 (15 min, zero history) reads "… warm-up + 1 exercise · 4 sets · …".
  - **Back-off counts.** R7-E12 (15 min, warm-up off, High) reads "… 1 exercise · 5 sets · …".
  - **en-US.** With locale en-US, `America/New_York` and `clock()` = `2026-09-27T12:00:00-04:00`, the done-by equals `formatTime(…)` from `lib/format`, giving "12:29 PM" (U+202F normalised).
- **AC-2 (explainer)** An ordered list of exactly 4 items, in order: "One thing on screen", "Tap Done after each set", "Rest counts down by itself", "Everything else is behind pause".
- **AC-3 (focus prefs, D-0110 §6)**
  - **The switches.** 3 switches (`role="switch"` or checkbox): "Sound cues", "Voice countdown 3-2-1", "Keep screen awake". With nothing stored, all are on.
  - **Storing.** Toggling "Voice countdown 3-2-1" off writes `localStorage["wl-focus-prefs"]` = `{"version":1,"sound":true,"voice":false,"keepAwake":true}`, and a remount shows it off. Toggling it back on writes `voice: true`.
  - **`readFocusPrefs()` returns the defaults for:**
    - a missing key;
    - `"{"` (invalid JSON);
    - `{version: 2, …}`;
    - `{version: 1, sound: "yes", …}`;
    - a `localStorage.getItem` that throws.
  - **Pair.** It returns the stored values for a valid version-1 value.
  - **A throwing `setItem`.** It doesn't throw out of `writeFocusPrefs`, and the switch still shows the new value.
  - **Module keys.** `Object.keys(await import("…/focus-prefs"))` sorted is `["readFocusPrefs", "writeFocusPrefs"]`.
  - **No runtime imports.** A source test finds no non-`import type` import statement in `focus-prefs.ts`.
- **AC-4 (Start writes the session first, NFR-OFF-2, D-0065 §7, D-0110 §1 §4)** From W-R7E4 at F-tz, with `clock()` = `2026-09-27T12:04:00+02:00` at the tap:
  - **The call.** Start calls `upsertSession` once with `{id, started_at: "2026-09-27T10:04:00.000Z", ended_at: null, time_budget_min: 30, energy: "normal", warmup_in_budget: true, plan: workout.plan}`.
    - `id` matches the UUID v4 pattern.
    - `plan` deep-equals `workout.plan` and passes `parseSessionPlan` (`ok: true`).
    - The pair: `clock()` = 12:00 gives `"2026-09-27T10:00:00.000Z"`.
  - **The inputs flow through.** After UF-08.2 chip 20 and UF-08.1 Low + warm-up off, the call has `time_budget_min: 20`, `energy: "low"` and `warmup_in_budget: false`.
  - **Navigate after the write.** With `upsertSession` held on a deferred promise, the location is still `?step=ready` after 50 ms. On resolve it becomes `/session/<id>` (the same `id`) by a REPLACE navigation (`useNavigationType()` === "REPLACE").
  - **Double tap.** A second tap while pending makes no second call. Start has `aria-disabled="true"` while pending and not before.
- **AC-5 (a failed write, D-0110 §3)**
  - **Rejection.** `upsertSession` rejecting shows "Couldn't start the workout. Try again." (`role="alert"`). The location is unchanged after 50 ms, there is no unhandled rejection, and Start is enabled again.
  - **Retry.** The retry calls `upsertSession` with the **same** `id`, and on resolve navigates once.
  - **A new visit.** Back to UF-08.2, then Looks good, then Start uses a **different** `id`.
- **AC-6 (offline and two starts, real queue, NFR-SYNC-4, D-0110 §5)** With the real `upsertSession` over `fake-indexeddb`:
  - **Offline.** With `navigator.onLine` false, after Start `offlineDb().sessions.get(id)` holds `{id, row: {…AC-4 row}, pending: true, finished: false}`, and navigation happened.
  - **Online, the pair.** With `navigator.onLine` true and a `fetch` that never resolves, the same row is written and navigation happens with no wait for the network. A fetch spy records no call made by Start.
  - **Two starts.** Two separate setups (two renders) give two different ids and two rows.
- **AC-7 (empty plan)**
  - **Warm-up only.** Given `plan.items` `[]` (with the 4 warm-up moves, `totalS` 180), the summary reads "3 min · warm-up only · done by 12:03", and Start creates the session with `plan.items` `[]`.
  - **Nothing planned.** With `plan.warmup` also `[]` (`totalS` 0), it reads "Nothing planned · done by 12:00", and Start still works.
- **AC-8 (Back and cold load, D-0110 §7)**
  - **Back.** Back goes to `?step=suggested` and renders the same `Workout` (reference-equal), with no `suggest` call (spy count unchanged after 50 ms).
  - **Cold load.** A cold load of `?step=ready` still shows UF-08.1 (T-0303a AC-1).
- **AC-9 (strings, exports, lint, D-0071 §3)**
  - **Strings.** Every UF-08.4 string comes from `en.uf08`. `react/jsx-no-literals` is green, and `en.ts` is unchanged.
  - **Exports.** The T-0303a export pin in `features/UF-08/__tests__/` is updated to `Object.keys(index)` sorted = `["SessionSetup", "readFocusPrefs", "writeFocusPrefs"]`, and `type FocusPrefs` is importable from `features/UF-08/index.tsx` (a type-level test).
  - **Import bans.** The D-0071 §9 bans are green.
- **AC-10 (e2e: start online and offline, a11y, D-0086, D-0091 §1, D-0108)** Rows appended to `tests/e2e/uf-08-setup.spec.ts`, reusing T-0303a's in-spec seed, with no fixture edits. The spec registers its own `sessions` route after `mockSupabaseData` to record the upserted rows (the later-registered handler wins).
  - **Online.** `/` → "Start workout" → UF-08.1 (45) → chip 30 → Suggest → UF-08.2 → Looks good → UF-08.4 → Start.
    - The URL becomes `/session/<uuid v4>`, and `[data-screen-id^="UF-09"]` is visible.
    - IndexedDB `wl-offline.sessions` holds that id with `pending: true` (read with `page.evaluate`).
    - The spec then reloads the page, which mounts AutoSync and runs its `flushNow()` (D-0112 §1). Within 5 s of the reload, exactly one recorded `sessions` request carries that `id`, with `time_budget_min` 30.
    - The spec doesn't depend on a send before the reload, and doesn't assert that one is absent. Today no flush runs on enqueue (D-0112 §4).
  - **Offline.** After the precache settles: offline → reload `/session/setup` → Suggest → Looks good → Start.
    - The URL becomes `/session/<uuid>`, IndexedDB holds the row, and no `sessions` request is recorded while offline.
    - Going online then records exactly one `sessions` request carrying that `id`.
  - **Back after Start.** The browser Back from `/session/<id>` doesn't land on any `/session/setup` URL (the replace).
  - **a11y.**
    - axe on UF-08.4 reports 0 serious or critical violations.
    - Start, Back and the 3 switches are each ≥ 44 × 44 px.
    - Looks good → toggle a switch → Start works by keyboard only.
  - **Requests.** The guard reports no unclaimed Supabase request.
- **AC-11 (shell tests unchanged, D-0108 §3)** `git diff main...HEAD` lists nothing under `apps/web/src/app/**`, `tests/e2e/fixtures/**` or `tests/e2e/{offline,auth,shell}.spec.ts`, and those pass in the DoD run.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`), including focus-prefs.ts and the index.tsx re-export.
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-08.ts`: this flow's strings file (D-0071 §1, D-0075); add keys only, multi-line shape.
  - `tests/e2e/uf-08-setup.spec.ts`: append rows to the T-0303a spec (D-0071 §10).
  - `docs/tickets/T-0303d-ready-and-start.md`: this file, for the accept log.
- Read-only imports (not grants): `lib/offline` (`upsertSession`, `offlineDb`), `lib/format`, `lib/i18n/en.ts`, `lib/i18n/workout.ts`, `components/offline-status`, `@workoutlab/engine`, `@workoutlab/shared` (`parseSessionPlan`), and the existing `tests/e2e/fixtures/*` exports.

## Contract impact
None. The `sessions` row is the `docs/data-model.md` shape (`user_id` defaults to `auth.uid()` on the server), written through the T-0300c queue exactly as D-0045 §6 and D-0053 §7 define. The plan is `SessionPlan` v1 as the engine returned it.

## NFRs owned
OFF-2 start part (AC-4, AC-6, AC-10), SYNC-4 start part (AC-5, AC-6), I18N-2 (AC-1), A11Y-1/2/6 on UF-08.4 (AC-10).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the whole suite) · `format:check`, `check:repo` and `check:size` green · contracts unchanged · commits start `T-0303d` and cite UF-08.4 (for example `T-0303d UF-08.4: Start writes the session before navigating`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** This ticket is in the same lane as T-0303b and T-0303c, so they run one after another. It is parallel-safe by files with the UF-09 tickets: T-0304a–e never edit `features/UF-08/**`, and they import `readFocusPrefs` only through `index.tsx`, starting with T-0304c. Verification runs are staggered (state.md).
- **The e2e target.** If T-0304a has merged, `/session/<id>` renders `UF-09.1`. Before that, it renders the stub `UF-09`. The `^=` selector accepts both.
