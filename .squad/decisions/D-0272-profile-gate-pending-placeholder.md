---
id: D-0272
title: "Profile gate: while the first profile read is still pending and the device is online, a gated route shows a neutral placeholder instead of the screen, for at most 3.5 s; offline, a failed read and a timeout render the route as today (T-0985)"
status: revisit
date: 2026-11-23
by: product-owner (groom T-0985)
area: web
amends: D-0197, D-0064, D-0071
builds-on: D-0073
---
## Context
T-0983 found that a brand-new user who signs in with a code on UF-01.5 sees UF-02.1 (Today) for a moment before the app moves them to `/welcome/save`. Cause: `ProfileGate` keys on `status` alone (D-0197 §4). While the first read is pending, `status` is `unknown`, and `unknown` renders the route. Only `missing` redirects. So the route paints, then the answer arrives and the redirect fires.

That rendering is on purpose (D-0064 §9, D-0071 §11, T-0301a AC-6): a profile that could not be read must never take the app away from the user (principle 1). Any fix has to keep that for offline users and for users whose read failed.

Checked in code:
- `profile-context.tsx` already has the right signal. `resolved` is `false` from the first signed-in render until `resolveProfileStatus()` settles, it is reset to `false` on a sign-in in place and on an account switch (D-0073 §4), and it is `true` when signed out and outside a provider. `status` cannot say this, because `unknown` also means "resolved, answer unknown".
- `resolveProfileStatus()` never throws and is bounded: a cache hit answers with no network wait, offline with no cache answers `unknown` at once, and the `profiles` read aborts after 3 s (D-0197 §6). The one unbounded part is the local `loadProfile()` read.
- `ProfileGate` sits outside `Suspense` (`App.tsx`), so a placeholder there also keeps the route's chunk from loading until the answer is in. For a returning user that delays the chunk fetch by the cache read, a few milliseconds.
- The same flash happens on a cold load of a new user who opens a magic link in a new browser. A rule limited to a "fresh sign-in navigation" needs new state to remember how the user arrived, and buys no safety, because the pending window is the same either way.

## Decision
1. **When the placeholder shows.** `ProfileGate` renders the placeholder instead of its children when all three hold: the profile is not resolved (`useProfileResolved()` is `false`), the device is online (`navigator.onLine !== false`, the test `status.ts` already uses), and the placeholder has not expired (§3). In every other case it behaves as today: `missing` redirects to `/welcome/save`, `present` and `unknown` render the route.
2. **Offline and failed reads keep today's behaviour.** Offline, the gate shows no placeholder: the route renders at once. A read that errors, is aborted, or finds no cache while offline resolves to `unknown`, `resolved` becomes `true`, and the route renders. Nothing here adds a redirect, a message or a retry. `unknown` still never redirects.
3. **Bound.** The placeholder ends at the first of: the resolution settling, or `PROFILE_PLACEHOLDER_MAX_MS = 3500` after it started. The cap is above the 3 s read abort (D-0197 §6), so a hanging network is reported by the read first, and it covers the one unbounded case, a hanging local cache read. After the cap the route renders as today, and a late `missing` still redirects. The cap is one timer per pending window, started when the placeholder starts and cleared when it ends, on the wall clock.
4. **Who it covers.** Any signed-in, online, unresolved window: a fresh sign-in on UF-01.5, a cold load of a signed-in session, an account switch. A returning user with a cached profile resolves from the cache without a network read, so the placeholder lasts the local read and no more. The routes covered are the ones `isGatedPath` derives (D-0071 §11). `/session/:sessionId` and its summary are never gated, so a workout is never held (principle 1). `/welcome/*` is not gated and is unchanged.
5. **What it is.** A neutral block with no text on screen, in the plan state: `min-height: 100dvh`, background `var(--wl-bg)` (the same as the screen about to appear, so there is nothing to flash), colours and fonts from `--wl-*` only, no spinner, no animation, no new string, no new token. No hard-coded colour (`tokens.json` is the only place colours are defined). It sits inside the `<main>` landmark, so the tab bar logic is unchanged (the tab bar follows the route, not the gate).
6. **Accessibility.** No announcement spam: no `role="status"`, no `aria-live`, no `role="alert"`, no text that changes. The element is `aria-busy="true"` and carries no accessible name. A screen-reader user hears nothing during the wait and the screen's own heading when it appears. **Focus:** the placeholder is not focusable, never takes focus and never holds it. On the sign-in path the code form is already unmounted when the placeholder shows, so focus is on `body` both before and after; the placeholder neither steals it nor leaves it on a hidden element. The destination screen keeps whatever focus handling it has today. No motion at all, so `prefers-reduced-motion` needs no branch.
7. **Onboarding under 60 s (principle 5).** The placeholder adds no step, no tap and no new network call. It replaces a flash of the wrong screen with a blank for the same wait, and the wait is bounded: a new user's real path is sign in, one `profiles` read (a few hundred ms on a normal connection), `/welcome/save`. Worst case, a hanging read, adds at most 3.5 s once, and the user then sees what they see today. Signed out, nothing changes: `/welcome` never waits for the gate, and the provider reads no storage and makes no call (AC-10 of T-0301a).
8. **Seam.** `ProfileGate` already reads the context, so the change is `ProfileGate.tsx` (the condition and the timer), one constant beside `PROFILE_READ_TIMEOUT_MS` in `status.ts`, and a small CSS file for the placeholder under `lib/profile/`. `ProfileStatus` stays three values, `status` is not changed, `resolved` is not changed, and `recheck()` does not reset `resolved`, so a recheck never brings the placeholder back. No Suspense boundary is added. No contract changes.
9. **Lane.** web-shell: `ProfileGate` and `lib/profile/**` are in its paths (`.squad/ownership.yaml`). The e2e (T-0983 found it in `tests/e2e/uf-01-onboarding.spec.ts`) belongs to the qa lane, but the ticket lists `tests/e2e/uf-01-onboarding.spec.ts` as an extra path, so the AC lands with the fix (no separate qa ticket to wait for). The ticket carries the check that the existing UF-01.5 AC-14 `waitForWrite` stays and is tightened, not loosened.

## Consequences
- The flash goes away for a new user. A returning user with a cache sees a blank for the local read instead of a first paint of the screen shell, and their route chunk starts loading a few milliseconds later.
- D-0197 §4's "`ProfileGate` keys on `status` alone" no longer holds: the gate also reads `resolved`, but only to **delay** rendering, never to redirect or block. The fail-open guarantee survives because every path out of "pending" ends in rendering the route: the settle (any status), the cap, and offline.
- Test impact: T-0301a's tests that render a gated route with a never-settling source (they assert the route is visible at once) must now advance past the cap; `profile-gate.test.tsx` needs the cap constant, not a literal.
- A user whose local cache read hangs while online waits 3.5 s. That case has no data behind it; this is a bound, not a measure.

## Revisit when
- A returning user reports a visible blank before Today (then show the placeholder only after a 150 ms grace, or preload the route chunk while pending).
- A telemetry hook shows the cap firing often.
- Someone wants a visible progress cue for a slow network: that is a design call, and needs a spec, not a spinner added here.
