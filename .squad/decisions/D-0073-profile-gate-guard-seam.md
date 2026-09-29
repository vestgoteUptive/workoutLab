---
id: D-0073
title: Profile gate guard seam (T-0301a) — conditional `guest-only` for `/welcome/*`, the gated set is derived from `routes.ts`, and `stale` is gated
status: revisit
date: 2026-09-29
by: frontend-dev (T-0301a build)
area: web
---
## Context
D-0064 §9 specifies the profile gate: signed in with no `profiles` row → `/welcome/save`, so
T-0301c can write the profile and its 9 `area_targets`. D-0064 is `status: revisit`, and §9 is
ambiguous or incomplete in three places once it meets the merged code (T-0318, T-0319). None of
the three contradicts a `decided` decision, so per `CLAUDE.md` ("never stall") each gets a
stated default, recorded here.

The fourth item below is not in the ticket. It is a design consequence found while building, and
it is the one a reviewer is most likely to want to change.

## Decision

1. **`guest-only` is conditional, for `/welcome/*` only.** D-0064 §9 says "`/welcome/*` renders
   instead of redirecting" for a signed-in user whose status is `missing`. That cannot hold as
   written: `/welcome/*` has guard `guest-only`, and `RedirectIfSignedIn`
   (`apps/web/src/lib/auth/guards.tsx`) bounces signed-in **and** `stale` users off `/welcome/*`
   and `/account` — exactly the user D-0064 §8 needs on `/welcome/save`.
   **Default:** `RedirectIfSignedIn` stands down when, and only when, the pathname is `/welcome`
   or under `/welcome/` **and** the profile status is `missing`. `present` and `unknown` keep the
   behaviour T-0300b defined (a stored `wl-return-to`, otherwise `/`), and `/account` is
   unaffected in every case. This is the smallest change that satisfies both §8 and §9 and keeps
   `auth-guard.test.tsx` and `__tests__/auth-guard.phase3.test.tsx` passing unedited.
   **Needs a decision:** no — a mechanical consequence of D-0064 §8 + §9, recorded for the record.

2. **The gated set is derived from `routes.ts`, per D-0071 §11, not from D-0064 §9's list.**
   §9 names `/`, `/library*`, `/progress`, `/balance*`, `/plan` and `/session/setup`, which
   predates the five `protected` routes T-0318 added. D-0071 §11 (`status: decided`, later) says
   the gate covers "every `protected` route plus `/session/setup` … rather than a fixed list".
   **Default: D-0071 §11 wins** — newest decision, `decided` where D-0064 is `revisit`, and a
   superset, so nothing in §9 becomes false. `lib/profile/gated-routes.ts` derives the set at
   runtime: `guard === "protected"`, plus the **exact** path `/session/setup`, which is guard
   `session`, not `protected`. `/session/:sessionId` and `/session/:sessionId/summary` are also
   `session` and stay ungated (principle 1), so the rule keys on the path for that one entry and
   never on a `/session/` prefix.
   **Not a conflict.**

3. **`stale` is gated.** §9 says "signed in", and `useAuth()` has three statuses. **Default:** the
   gate is active whenever `status !== "signed-out"`. A `stale` user is still in the app, and a
   stale token's `maybeSingle()` will usually error, which yields `unknown` and therefore no
   redirect anyway. Safe in the bad case, correct in the good one.
   **Push back here** if a `stale` user is ever seen landing on `/welcome/save` unexpectedly:
   this is the one of the three that could produce a surprising redirect.

4. **The gate exposes `resolved` as well as `status`, and `/welcome/*` waits for it.** Found while
   building §1, and load-bearing. `"unknown"` carries two meanings in D-0064 §9: step 5 ("before
   any of 2–4 resolves") and step 4 ("an error, or offline"). The profile gate itself does not
   care — neither meaning redirects — but the §1 stand-down does. Keyed on the status alone, the
   stand-down sees `"unknown"` on the **first** render, before the gate has read anything, so it
   fires its redirect: a `missing` user visiting `/welcome` goes `/welcome` → `/` → (the gate on
   `/`) → `/welcome/save`. The end state is right, `/welcome` and `/welcome/goal` are not, and the
   bounce is visible.
   **Default:** `ProfileStatusProvider` also exposes `resolved: boolean`, `true` once a resolution
   has committed, and `RedirectIfSignedIn` holds its `/welcome/*` redirect until then.
   `resolved` starts `true` when signed out and defaults to `true` outside a provider, so
   principle 5 is untouched: `/welcome`'s first committed render never waits for the gate, and a
   tree with no provider keeps exactly today's `guest-only` behaviour.
   `useProfileStatus()` still returns exactly the three states D-0064 §9 names; `resolved` is a
   second, internal signal, not a fourth state.

   **A `useState` initialiser is not enough, and this is the primary path rather than an edge
   case.** `useState(!signedIn)` runs once, so a user who signs in *in place* — the magic-link or
   OTP verify firing `SIGNED_IN` while they sit on `/welcome`, which is the D-0045 §5 case this
   gate exists for — flips `signedIn` false → true with `resolved` still `true` from the
   signed-out render. The stand-down then sees `resolved && "unknown"` and bounces them
   `/welcome` → `/` → `/welcome/save`: the same defect this section exists to prevent, reached by
   a transition instead of a cold load. `resolved` is therefore cleared by a render-phase
   transition check, which lands before any child reads the context, so no intermediate render
   can observe `resolved && "unknown"`. Found by code review on the committed diff and
   independently by the build; every cold-load test seeds the session before `render()`, so none
   of them could catch it — the regression test must flip auth status *after* mount (verified:
   removing the transition reset fails exactly the two `/welcome` and `/welcome/goal` transition
   tests).
   **Needs a decision:** arguably yes, which is why this entry is `revisit`. The alternative — a
   fourth status such as `"resolving"` — would change the `useProfileStatus()` contract D-0064 §9
   states verbatim, so it was not taken.

   **The gate keys on a user identity, not on the signed-in boolean (the account switch).**
   Superseding this section's earlier claim that "the sign-out direction is already covered by
   `run()`'s early return": true, but incomplete. That sentence enumerated two directions —
   signed-out → signed-in (the transition reset) and signed-in → signed-out (`run()`'s early
   return) — and missed the third. **Signed-in → signed-in was covered by nothing.** Found by QA
   on the committed build.

   supabase-js fires `SIGNED_IN` for a new session with **no** intervening `SIGNED_OUT` when a
   user verifies a different account in place. `signedIn` stays `true`, so there was no
   transition, no new `run()` identity (its dep list was `[signedIn]`) and no re-render: user B
   inherited user A's `status` *and* `resolved: true`. Both directions were wrong. A `present` →
   B with no profile meant **B was never gated**, every engine read returned nothing and
   `/workouts/suggest` 422'd — the silent-corruption class D-0064 §9 exists to close. A `missing`
   on `/welcome` → B who *has* a profile left **B stranded on onboarding**, because the §1
   stand-down kept using A's `missing`.

   It is reachable through the product's own UI, not a synthetic event: §1 and AC-7 *require*
   `/welcome/*` to render for a signed-in `missing` user, and that screen
   (`features/UF-01/index.tsx`) is a live email + code form calling `requestMagicLink` /
   `verifyCode`. A `missing` user standing down on `/welcome` can therefore verify a different
   account without ever signing out.

   **Default:** `useAuth()` publishes `userId: string | null` alongside `status` — read
   synchronously from the already-persisted session on the first render (principle 5, the same
   source `computeInitialStatus()` uses) and from each auth event's `session.user.id` after that.
   `AuthStatus` keeps its three values and `redirectTarget` its contract; `userId` is an
   additional field, so nothing that reads `status` changes behaviour. The gate then derives one
   key, `signedIn ? "in:<userId>" : "out"`, and uses it for **both** `run()`'s dep list and the
   render-phase transition check. Three properties follow:
   - Signed out the key is the constant `"out"`, so the inert path (principle 5, AC-10) is
     untouched.
   - When the stored session carries no `user` at all — the T-0300b fixtures in
     `auth-guard.test.tsx` and `auth-guard.phase3.test.tsx`, which stay unedited per AC-9 — the
     key is constant per signed-in-ness, i.e. *exactly* the old `[signedIn]` behaviour. A `null`
     identity is deliberately not read as "signed out": consumers key on `status` for
     signed-in-ness and on `userId` only for *change*.
   - `TOKEN_REFRESHED` carries the same user, so the key does not change and a token refresh
     still does not re-resolve. Only a genuine account switch does.

   **Re-running is not sufficient on its own**, which is why the identity change also resets
   `status` to `"unknown"` (and clears `refreshedFor`, since B's cache is not A's). `ProfileGate`
   keys on `status` alone and ignores `resolved`, so for as long as the held `status` is A's,
   every gated route is deciding B's fate from A's profile. Overwriting it whenever B's read
   happens to settle leaves that window open for an unbounded time if B's read is slow or never
   settles. Dropping it during render closes the window instead of shortening it.
   Verified by fault injection, each half separately: reverting `run()`'s dep list to
   `[signedIn]` fails both account-switch tests; disabling only the `status` reset fails the
   committed-frames test while the other two still pass; publishing no identity at all
   (`userId: null`) fails all three.
   **Needs a decision:** no — it closes a defect against D-0064 §9's own intent, and adds a
   field rather than changing a contract. Recorded because §4's earlier two-direction claim was
   wrong and a future reader would otherwise inherit it.

Also noted, no default needed: §9's "a cached profile → `present` with no network wait" does not
ask the gate to revalidate afterwards, and it does not. `refreshProfile()` already runs from
`refreshAll` on an online start (T-0319), so the cache is kept fresh outside the gate. The gate
calls `refreshProfile()` only for a row it read from the network, once per distinct resolution.

## Consequences
- `AuthContextValue` gains `userId: string | null` (§4). Any future consumer that wants "who is
  signed in" reads it from there rather than re-parsing localStorage or calling `getUser()`.
  It is an identity for *comparison*, not an authorisation claim: RLS remains the only thing
  that decides what a user may read or write.
- `apps/web/src/lib/auth/guards.tsx` now imports `lib/profile`. `lib/profile` does **not** import
  `lib/auth/guards`, so there is no cycle; it imports `lib/auth/auth-context` and, dynamically,
  `lib/auth/client` and `lib/offline`.
- `lib/offline` is reached from `lib/profile` only through a dynamic `import()` made after the
  signed-in check, so a signed-out first render cannot pull the Dexie chunk (the `AutoSyncGate`
  precedent in `app/App.tsx`). A source test pins this.
- T-0301c calls `useRecheckProfile()` after its writes land. The returned function resolves once
  the new status has committed, so T-0301c can navigate immediately afterwards without looping.
- A future `protected` route is gated the day it is added, with no change to `lib/profile`.
  A future route that must be gated but is **not** `protected` has to be added to
  `EXTRA_GATED_PATHS`, next to `/session/setup`.

## Revisit when
- T-0301c lands and the real `/welcome/save` exercises `useRecheckProfile()` end to end.
- A `stale` user is reported landing on `/welcome/save` (§3).
- The first design review of the gate seam, where `resolved` (§4) may be replaced by a fourth
  status or by a suspense boundary.
