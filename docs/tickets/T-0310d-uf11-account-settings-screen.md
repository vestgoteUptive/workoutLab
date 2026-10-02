---
id: T-0310d
title: "UF-11.4 Account settings screen at /plan/account: signed-in email, Export my data, Sign out, typed-confirm Delete account; Account link on UF-11.2; e2e (D-0136)"
lane: web-feature:UF-11
screens: [UF-11.4, UF-11.2, UF-01.1]
decisions: [D-0136, D-0135, D-0045, D-0067, D-0071, D-0075, D-0002]
deps: [T-0308b, T-0310b, T-0310c]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom, T-0310 split). Build flow: wl-build-web. About ½ day. Waits on T-0308b (blocked:H-13), because T-0308b owns features/UF-11 and pins its exports. It also waits on T-0310c (lib/account) and T-0310b (so the button calls a real function). UF-11 lane serial: run it after T-0308b, and before or after T-0308c but never in parallel with it, since both edit features/UF-11/index.tsx and the exports pin. The two app/** grants below are listed extras, so don't run it in parallel with a web-shell ticket that edits app/routes.ts. -->

## Why
NFR-PRIV-4 and NFR-PRIV-5 have to be reachable in the app: "export" and "delete" one tap from Plan, with no fifth tab (D-0045 §3). The screen only wires buttons. The paging, the delete call, the wipe and the sign-out are `lib/account`'s (T-0310c), so this ticket can't get the privacy-critical parts wrong. Deletion can't be undone, so it gets a typed confirm, and it's disabled offline (D-0136 §3).

## Scope
- In:
  - **`AccountSettings`** in `features/UF-11` (for example `AccountSettings.tsx`), exported from `features/UF-11/index.tsx`.
    - `[data-screen-id="UF-11.4"]` and `<h1>{en.screens.accountSettings}</h1>` are rendered by `AccountSettings` itself on the **first** render, before any `await`, in every state.
    - Contents, per D-0136 §1 and §8:
      - `Signed in as {email}` (from the auth session user, and left out when there's no email);
      - "Your data" with `Export my data`;
      - `Sign out`;
      - "Delete account" with the inline confirm panel.
    - Export: `exportAccountData({userId, email, now})`, then `downloadAccountExport(result, now, tz)`.
    - Delete: `deleteAccountAndSignOut({userId})`. On `"deleted"`, `navigate("/welcome", {replace: true})`.
    - Sign out: `useAuth().signOut()`.
    - `now` is injected (a clock prop or module), and `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
    - Online state comes from `navigator.onLine` plus the `online`/`offline` events, with no remount.
  - **UF-11.2**: an `Account` link (`href="/plan/account"`) on `Plan`, in every state, including loading and the cold-cache offline message. A user with nothing cached can still reach deletion.
  - **Route row**: `{path: "/plan/account", screenId: "UF-11.4", showTabBar: false, guard: "protected", load: () => import("../features/UF-11/index.js").then((m) => ({default: m.AccountSettings}))}` in `app/routes.ts`, directly after `/plan/edit`. The profile gate covers it automatically (D-0071 §11).
  - **Strings**: `en.uf11.account.*` in `lib/i18n/flows/uf-11.ts` (D-0075 shape, multi-line, add keys only), with the D-0136 §8 copy. The heading uses `en.screens.accountSettings` (T-0310c).
  - **e2e**: `tests/e2e/uf-11-account.spec.ts` (new) with the existing `mockSupabaseData` plus `page.route("**/functions/v1/account", …)`.
  - Edge cases:
    - offline (both actions disabled, re-enabled live);
    - cold cache (the link still shows);
    - zero history (export still downloads 7 tables);
    - an expired sign-in (401 message);
    - a server error (stays on the screen, nothing wiped);
    - double taps.
- Out:
  - Everything inside `lib/account` (T-0310c) and the function (T-0310b).
  - Email change, and level/equipment editing (T-0216).
  - The privacy notice copy (T-0309/T-0403).
  - The account-deleted notice (T-0310c's shell component).
  - Any Dexie access from the feature: no `offlineDb()` and no Dexie import, because the wipe is `lib/account`'s.

## Acceptance criteria
- **Test surfaces.**
  - Vitest + Testing Library in `features/UF-11/__tests__/account-settings*.test.tsx`, with `vi.mock("../../../lib/account/index.js")` so every `lib/account` function is a `vi.fn()` unless an AC says otherwise.
  - Playwright in `tests/e2e/uf-11-account.spec.ts` where an AC is tagged **e2e**.
  - Signed-in fixture: user `U` with email `u@test.local`. Clock `2026-09-27T12:00:00+02:00`, tz `Europe/Stockholm`.
- Each new test title starts with `T-0310d AC-Dn`. All are red on `main`: there is no route, screen or link. Record the red run in the build log.

- **AC-D1 (route and first render)**
  - `routes` has exactly one entry with path `/plan/account`, shaped `{screenId: "UF-11.4", showTabBar: false, guard: "protected"}`, and it sits directly after `/plan/edit`.
  - `app/__tests__/routes.phase3.test.ts` gets this one row added to its expected list. No other row changes, and the length assertion still holds.
  - Rendering `App` at `/plan/account`, signed in, with a `supabase` mock that has no `from`: `[data-screen-id="UF-11.4"]` and an `<h1>` reading `Account settings` are in the DOM on the first render, and C-02 (the tab bar) is absent.
  - Signed out: `/plan/account` redirects to the auth flow (the existing guard behaviour), and `Account settings` is never rendered.
- **AC-D2 (the link on UF-11.2)**
  - `/plan` shows a link named `Account` with `href="/plan/account"`. It's there with a seeded cache, and in the cold-cache offline state (`Your plan isn't on this device yet…`).
  - Clicking it lands on `[data-screen-id="UF-11.4"]`.
- **AC-D3 (email)**
  - `Signed in as u@test.local` is shown.
  - **Contrast:** a session user with `email: null` shows no `Signed in as` text, and nothing throws.
- **AC-D4 (export)** Online, with `exportAccountData` resolving `R` after a deferred promise:
  - the click calls it once with `{userId: U, email: "u@test.local", now}`, where `now` is the injected clock;
  - while it's pending, the button is `disabled` and reads `Preparing your file…`;
  - a second click while pending makes no second call;
  - on resolve, `downloadAccountExport` is called once with `(R, now, "Europe/Stockholm")`, and the button is back to `Export my data`.
  - If it rejects: `Couldn't export your data. Try again.` appears (`role="alert"`), `downloadAccountExport` is **not** called, and the button is enabled again.
- **AC-D5 (offline, both actions)**
  - With `navigator.onLine = false`:
    - `Export my data` is disabled and `Connect to export your data.` is shown;
    - `Delete account…` is disabled and `Connect to delete your account.` is shown;
    - no `lib/account` function is called after clicking either.
  - Dispatching `online` enables both **without a remount**. Dispatching `offline` with the confirm panel open disables `Delete my account`.
- **AC-D6 (typed confirm)**
  - At first, the input `Type delete to confirm` and `Delete my account` are **absent**.
  - Clicking `Delete account…` shows the D-0136 §8 permanence text, the input (focused) and `Delete my account` (disabled).
  - Typing gives:

    | input | `Delete my account` |
    |---|---|
    | `delet` | disabled |
    | `delete` | enabled |
    | `  DELETE ` | enabled |
    | `deleted` | disabled |
    | `delete it` | disabled |

  - `Cancel` hides the panel, clears the input (reopening shows it empty) and returns focus to `Delete account…`. No `lib/account` call is made.
- **AC-D7 (delete outcomes)** With the input `delete`, clicking `Delete my account` calls `deleteAccountAndSignOut` once with `{userId: U}`. While it's pending, the button reads `Deleting…` and is disabled, and a double click makes one call. Then, by outcome:
  - `"deleted"`: the location becomes `/welcome`, and history `replace` was used (going back doesn't return to `/plan/account`).
  - `"unauthorized"`: `Your sign-in has expired. Sign in again, then delete your account.` (`role="alert"`). The location stays `/plan/account`.
  - `"failed"`: `Couldn't delete your account. Try again.` The button is enabled again, and a retry makes a second call.
  - `"offline"`: `Connect to delete your account.`
- **AC-D8 (sign out keeps the queue)**
  - `Sign out` calls `useAuth().signOut` once.
  - With the real `lib/offline` and `fake-indexeddb` seeded with one queued set for U, the set is still in `offlineDb().sets` after sign-out.
  - `wipeLocalUserData` and `deleteAccountAndSignOut` aren't called.
- **AC-D9 (e2e, the whole path)** In the preview build, signed in as U with `mockSupabaseData` (a profile, 9 targets, 2 sessions, 3 sets):
  - **Export:** `page.waitForEvent("download")` after `Export my data` gives a file named `workoutlab-export-YYYY-MM-DD.json`. Its JSON has `format: "workoutlab-export"`, `version: 1`, the 7 `tables` keys and 3 `session_sets`.
  - **Delete:**
    - Before confirming, seed IndexedDB `wl-offline` (through `page.evaluate`, after the app has opened it) with one `sets` row for U and one for user V, and set `localStorage["wl-last-email"]`.
    - The route answers `DELETE **/functions/v1/account` with 204, and records the request.
    - After typing `delete` and confirming:
      - the request had method `DELETE` and `Authorization: Bearer …`;
      - the page lands on `/welcome` and shows `Your account and all your data are deleted.`;
      - `wl-offline.sets` has 0 rows for U and still has V's row;
      - `localStorage` has no key starting with `wl-`.
  - **Server error:** a separate test answers 500. The page stays on `[data-screen-id="UF-11.4"]` with `Couldn't delete your account. Try again.`, and U's seeded row is still in `wl-offline.sets`.
  - **a11y (NFR-A11Y-1/-2):**
    - `@axe-core/playwright` reports 0 serious or critical violations on `/plan/account` with the panel closed and with it open;
    - every `button`, `input` and `a` on it has a `boundingBox()` of at least 44 × 44 CSS px;
    - with the real keyboard, Tab to `Delete account…` and Enter opens the panel with focus in the input.
- **AC-D10 (strings, exports and boundaries)**
  - Every user-facing string comes from `en.uf11`, `en.screens` or `OfflineStatus`, and `react/jsx-no-literals` is green.
  - `flows/uf-11.ts` stays multi-line with `} as const;` at column 0, and `lib/i18n/__tests__/flows.test.ts` passes unedited.
  - The `features/UF-11` exports pin test lists the exports on `main` at build time, plus `AccountSettings`. That is `["AccountSettings", "EditPlan", "Plan"]`, plus `CheckinCard` if T-0308c has merged.
  - `features/UF-11/**` imports `lib/account` only through `lib/account/index.js`, and has no `dexie` import and no `offlineDb(` call (source scan).
  - `app/__tests__/routes.phase3.render.test.tsx`, `auth-guard.phase3.test.tsx` and `App.test.tsx` pass unedited.
  - `git diff --name-only main...HEAD` lists only paths in "Paths you may change".

## Paths you may change
- `apps/web/src/features/UF-11/**` (the lane: `web-feature:UF-11`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-11.ts`: new `account` keys, in the D-0075 shape.
  - `apps/web/src/app/routes.ts`: the one `/plan/account` row, directly after `/plan/edit`.
  - `apps/web/src/app/__tests__/routes.phase3.test.ts`: the one `/plan/account` row in its expected list.
  - `tests/e2e/uf-11-account.spec.ts`: a new file.
  - `tests/e2e/fixtures/uf-11-account.ts`: an optional new file with this spec's fixture data.
  - `docs/tickets/T-0310d-uf11-account-settings-screen.md`: this file, for the build and accept log.

## Contract impact
None. The screen calls `lib/account` (T-0310c), which implements D-0135 §1 and D-0136. `api/openapi.yaml` and `docs/data-model.md` are unchanged by this ticket.

## Coordination
- UF-11 lane: after T-0308b and serial with T-0308c (both edit `features/UF-11/index.tsx` and the exports pin).
- `app/routes.ts` is a web-shell file, granted here for one row. Don't run this in parallel with a web-shell ticket that edits it.
- Follow-up (product): the NFR-PRIV-6 privacy notice names "Plan → Account settings" (T-0309/T-0403).

## Definition of done
Every AC has a passing test · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · `pnpm --filter @workoutlab/web test:e2e` is green, including `uf-11-account.spec.ts` · contracts unchanged · commits start with `T-0310d` and cite UF-11.4 (e.g. `T-0310d UF-11.4: account settings screen (D-0136)`) · no bundle-size claim without a fresh build and the measured numbers (T-0322).

## Build / accept log
