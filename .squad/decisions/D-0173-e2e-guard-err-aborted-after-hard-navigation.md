---
id: D-0173
title: "T-0469 UF-11.4 AC-2 hits a guard gap: a fulfilled request's response can still fire requestfailed/ERR_ABORTED when the page does a hard navigation right after — the guard's detector 2 has no exemption for it; default is to file a qa follow-up and leave AC-2 documented as blocked, not to touch the shared fixture"
status: revisit
date: 2026-10-03
by: frontend-dev (T-0469 build)
area: process
builds-on: D-0086, D-0090, D-0155
---
## Context
T-0469 AC-2 (UF-11.4 account deletion e2e) drives the **real** delete flow: a real supabase-js
client, a mocked `DELETE /functions/v1/account` (204) and a mocked `POST /auth/v1/logout?scope=local`
(204, GoTrue's local sign-out). `AccountSettingsBody.onDelete` (`lib/account`/`features/UF-11`,
D-0136 §4 comment) deliberately does a **hard** `window.location.replace("/welcome")` rather than
an SPA `navigate()` whenever the real `AuthProvider`'s `status` hasn't yet flipped to
`"signed-out"` at the moment the delete promise resolves — which is the normal case, because
`onAuthStateChange`'s `SIGNED_OUT` callback updates React state asynchronously relative to the
promise chain that is awaiting it. This is correct, existing, in-scope behavior (its own code
comment: *"the guest-only /welcome route would bounce the user back to / ... a full load starts
signed out"*), not a UF-11 bug the row is meant to expose.

Measured directly (requestfailed listener added temporarily, then removed): both the DELETE and
the logout POST are fulfilled with 204 by this spec's own routes — confirmed via `page.on("response")`
showing `204` for both, the app behaving correctly (one DELETE recorded with `Authorization: Bearer
…`, IndexedDB wiped for this user only, `/welcome` renders the right text) — and yet Chromium
*also* reports both as `requestfailed` with `net::ERR_ABORTED`, because the hard navigation that
follows tears down the frame while the browser process is still finalizing those two responses.
This is a timing race between route fulfillment and navigation, not a leak to the real network and
not an unmocked request.

`tests/e2e/fixtures/guarded-test.ts`'s detector 2 (`context.on("requestfailed", ...)`) exists
specifically to catch real leaks that detector 1 (the context catch-all route) cannot see — but it
only exempts `net::ERR_INTERNET_DISCONNECTED` / `net::ERR_NETWORK_CHANGED` (the offline case,
D-0086 §4). It has no exemption for `ERR_ABORTED` after a same-tick hard navigation, so it fails
AC-2 even though both requests were correctly mocked and correctly handled.

`guarded-test.ts` is owned by the `qa` lane (`tests/e2e/**`, `.squad/ownership.yaml`); T-0469's
"Paths you may change" lists only its own new spec and fixture file, not this shared file. Per the
agent rules ("stay in your lane... add a follow-up, don't make the change yourself"), this ticket
does not edit it.

## Decision
1. **Default: file a qa follow-up, don't touch `guarded-test.ts` from this ticket.** The follow-up
   (below) adds an `ERR_ABORTED`-immediately-before-a-hard-navigation exemption to detector 2,
   mirroring the existing `OFFLINE_FAILURES` pattern: track the fulfilled routes' entries (already
   in `routed`/the per-request fulfillment path) and skip `requestfailed` for an entry that was
   already fulfilled with a real status, rather than only skipping specific error-text values.
2. **T-0469's own AC-2 row stays written to the correct behavior** (the real DELETE + real local
   sign-out + hard navigation + per-user wipe), not loosened to avoid the hard-navigation branch.
   It is recorded in this ticket's build log as **blocked on the qa follow-up**, with the manual
   proof (the measured 204/204 responses and app-level correctness) kept in the log so the row's
   intent isn't lost.
3. **No change to `lib/account` or `AccountSettingsBody`'s branch condition.** The hard-navigation
   branch is correct, existing, out-of-scope behavior (D-0136 §4); forcing the SPA branch instead
   (e.g. by faking `status` to `"signed-out"` before confirming) would test a path real users don't
   take on first deletion and would hide the very thing AC-2 is meant to prove.

## Consequences
- New follow-up: **extend `tests/e2e/fixtures/guarded-test.ts`'s detector 2 with an
  already-fulfilled exemption for `net::ERR_ABORTED`** (qa lane). Until it lands, T-0469 AC-2's
  spec row is present and correct but fails the guard's teardown assertion; it is not weakened or
  deleted (per-role rule: never delete/weaken a test to make it pass).
- Any other UF-11 (or other flow) e2e row that drives a real hard navigation right after a
  mocked response will hit the same gap. The follow-up fixes it for all of them at once.

## Revisit when
- The qa follow-up lands; re-run T-0469's AC-2 row (no change needed to the row itself) to confirm
  it goes green.
