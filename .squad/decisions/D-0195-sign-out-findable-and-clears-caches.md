---
id: D-0195
title: "GitHub #35: sign-out exists (UF-11.4, D-0136 §7, T-0310d) but is buried. UF-11.2 gets an \"Account and sign out\" link in its header and UF-11.4 puts Sign out under the email. Signing out ends only this device's session, clears this user's caches and every wl- storage key, and keeps the unsynced queue, with a confirm when there is any"
status: revisit
date: 2026-10-06
by: product-owner (GitHub #35 intake)
area: product
builds-on: D-0045 §3 §6, D-0136, D-0168, D-0071 §11, D-0174
amends: D-0136 §1 (UF-11.4 order), D-0136 §7 (what Sign out does), D-0174/T-0471 (the check-in card is the first element after Plan's header, not after the bare <h1>)
---
## Context
GitHub #35 (the owner): "There is no way to log out from the app."

Sign-out **is specified and built**:
- User flows v2 UF-11.4 and D-0136 §1/§7: a `Sign out` button on Account settings
  (`/plan/account`), calling `useAuth().signOut()`; the queue stays (D-0045 §6).
- T-0310d built it: `apps/web/src/features/UF-11/AccountSettingsBody.tsx` renders the button.

Why the owner didn't find it (main da5c366):
- The only way in is the `Account` link in `PlanBody.tsx`, rendered **last** on UF-11.2: after
  the targets, check-ins, routines and the primary `Edit plan` link. The label says nothing about
  signing out.
- On UF-11.4, `Sign out` sits below the Equipment section (D-0168) and Your data, in its own
  section with no heading.
- GitHub #36: the tab bar sits at the end of the document, so that bottom-of-page link is also
  next to the tab bar the owner only sees after scrolling.

What Sign out leaves behind today:
- `supabase.auth.signOut()` with the default **global** scope: every device of this user is
  signed out, not only this one.
- Offline it still ends the local session: supabase-js 2.117.2 `_signOut` removes the session
  even when the logout request fails with a network error (it only returns the error). Nothing
  in our code pins that.
- Every row in IndexedDB (`wl-offline`) stays: the 9 caches (history, library, targets, profile,
  syncMeta, exercise details, sessions, check-ins, routines) and the queue (`sessions`, `sets`).
  They're keyed by `userId` and never shown to another user, but they stay readable on a shared
  device. `localStorage` keeps `wl-last-email`, which pre-fills the next person's sign-in form
  with this user's email, plus `wl-onboarding` and `wl-focus-prefs`.
- Account deletion already wipes everything for the user (D-0136 §5, `lib/account/wipe.ts`).

## Decision
1. **Findable.**
   - UF-11.2: Plan's `<h1>` and a link sit together in a header row
     (`<div class="wl-plan__header">`). The link text is `Account and sign out` and it goes to
     `/plan/account`. The old `Account` link at the bottom of `PlanBody` is removed (one way in).
     The check-in card is now the first element after that header (amends the T-0471 pin of
     `h1.nextElementSibling`). The privacy notice's "Plan → Account" path stays correct, so the
     H-22-approved text doesn't change.
   - UF-11.4 order, top to bottom: `Signed in as {email}` and the `Sign out` button, together in
     one section; then Equipment; then Your data; then Delete account.
2. **Scope: this device.** Sign out calls `signOut({ scope: "local" })`. Other devices stay signed
   in. Offline, the session on this device still ends (supabase-js removes it on a network
   error); a test pins that, so a supabase-js upgrade that changes it fails CI.
3. **What's cleared, in this order** (one `lib/account` function, `signOutAndClearDevice`):
   - (1) `signOut({ scope: "local" })`.
   - (2) In one Dexie `rw` transaction over every `offlineDb()` table **except** `sessions` and
     `sets`, delete the rows of this `userId`. Other users' rows stay.
   - (3) Remove every `localStorage` and `sessionStorage` key that starts with `wl-` (the D-0136 §5
     rule, so `wl-last-email` goes too).
   - The queue tables `sessions` and `sets` are **kept whole** for this user: D-0045 §6 and
     NFR-OFF-4 say a queued row is only dropped by account deletion, and the `finished` marker on a
     flushed `sessions` entry (D-0053 §7) must outlive the flush. They upload the next time the
     same user signs in on this device. They're never sent or shown for another user.
   - The Workbox precache is kept (no user data, D-0136 §5).
   - A failure in (2) or (3) doesn't undo or block (1): the function still resolves, with
     `cleared: false`. Nothing is shown; the rows are still `userId`-scoped.
4. **Confirm when work is unsynced.** If this user has a `sets` row with `status: "queued"` or a
   `sessions` row with `pending: true` (`hasUnsyncedWork`), `Sign out` first opens an inline panel:
   `Some workouts haven't synced yet. They stay on this device and upload the next time you sign in here.`
   with `Sign out anyway` and `Cancel`. Rejected sets don't count: they never upload.
   With nothing unsynced, `Sign out` signs out straight away.
5. **Feedback and landing.** While signing out the button reads `Signing out…` and is disabled
   (one call per click). Sign out is enabled offline. Afterwards the user is on `/welcome`: the
   router navigation when the auth status is `signed-out`, else `window.location.replace("/welcome")`
   (the same guard as D-0136's delete path, T-0310c rework 2).
6. **Copy** (UF-11, `lib/i18n/flows/uf-11.ts`): `Account and sign out`, `Signing out…`, the §4
   sentence, `Sign out anyway`, `Cancel` (reuse the existing key). `Sign out` is unchanged.

## Consequences
- web-shell (T-0528): `lib/account` gets `signOutAndClearDevice` and `hasUnsyncedWork`, sharing
  the row and key helpers with `wipe.ts` (whose behaviour doesn't change).
- web-feature:UF-11 (T-0529): the header link, the UF-11.4 order, the confirm, the e2e.
- `useAuth().signOut()` (lib/auth) is unchanged; UF-11.4 stops calling it.
- User flows v2 UF-11.2 / UF-11.4 text updated in the same intake.

## Revisit when
- A service-worker runtime cache with API responses is added (then sign-out clears it too).
- Users ask for "sign out of all devices" (then add a second button with `scope: "global"`).
