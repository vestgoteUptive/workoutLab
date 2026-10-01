---
id: D-0100
title: "`/welcome/save` (T-0301c) renders its own screen id `UF-01.5-save`, stays put when there is no saveable plan, writes the 9 targets before the profile, and never touches the onboarding start time"
status: revisit
date: 2026-10-01
by: product-owner (groom T-0301c)
area: product
builds-on: D-0064 §8, D-0097, D-0098, D-0073
amends: D-0064 §8 (the no-plan branch and the write order), D-0097 §1 (the `/welcome/save` row)
---
## Context
T-0301c builds `/welcome/save`, the step D-0064 §8 defines. Grooming it against the merged code
turned up four open points:

1. **Screen id.** D-0097 §1 says `/welcome/save` renders UF-01.1 "until T-0301c builds it", but names
   no id for the built screen. User flows v2 has no separate screen for the save step. It is part of
   UF-01.5 Account. `/auth/callback` already uses the suffix form `UF-01.5-auth-callback`.
2. **No saveable plan.** D-0064 §8 (and D-0098 §2) say `/welcome/save` "goes to `/welcome/goal`".
   This matters most in one case: the magic link opens in a different browser context (D-0045 §5),
   so the answers aren't there. An automatic jump drops the user into "Goal 1/3" with no word of
   why. It also breaks about ten `profile-gate.test.tsx` rows. Each of them lands on
   `/welcome/save` with no pending plan and asserts that the location stays there (AC-5, AC-7,
   AC-11, the D-0073 §3 `stale` row, the `/account` `missing` row).
3. **Write order.** D-0064 §8 writes `profiles` first, then the 9 `area_targets`. The gate keys on
   the `profiles` row (D-0064 §9). So if the targets write fails after the profile write succeeds,
   a reload resolves `present` and the user never comes back to `/welcome/save`. The result is a
   profile with no targets, which is the failure §8's last bullet rules out. `area_targets.user_id`
   references `auth.users`, not `profiles` (`docs/data-model.md`), so the targets can be written
   first.
4. **The start time.** T-0301b's `/welcome/*` catch-all renders UF-01.1 at `save`. UF-01.1's commit
   calls `markOnboardingStarted()` (D-0064 §7). Once `/welcome/save` is its own screen, it must not
   start the 60 s clock: the user is past onboarding there.

## Decision
1. **Screen id `UF-01.5-save`.** `/welcome/save` renders `[data-screen-id="UF-01.5-save"]` in every
   state. This replaces D-0097 §1's `/welcome/save` row. The `routes.ts` entry `/welcome/*` keeps
   `screenId: "UF-01.1"`.
2. **No saveable plan: stay and explain.** A saveable plan is a valid record with
   `planShown: true` (D-0098 §2). Without one, `/welcome/save` stays at `/welcome/save` and shows:
   - a heading, "Set up your plan";
   - one line of copy, "Your answers aren't on this device. It takes under a minute.";
   - one primary link, "Set up my plan", to `/welcome/goal`.

   It makes no Supabase call and no write in this state. From there, the signed-in onboarding path
   is unchanged: UF-01.4's button goes to `/welcome/save` (T-0301d AC-8). This replaces D-0064 §8's
   "with no valid pending plan: it goes to `/welcome/goal`" and the matching clause of D-0098 §2.
3. **With a saveable plan, online, in this order.** Each step runs only if the one before succeeded:
   1. Read `profiles` (`select("user_id").maybeSingle()`, RLS-scoped). If a row exists, the existing
      profile wins: clear the pending plan, run the gate recheck, and go to `/` with no write.
   2. Upsert the 9 `area_targets` rows: fixed area order, `sets_per_14d` from
      `deriveTargets({rhythmMin, rhythmMax, priorityAreas: []})`, `source: "default"`,
      `{onConflict: "user_id,area_id"}`.
   3. Upsert `profiles` with `{goal, level, equipment, rhythm_min, rhythm_max, priority_areas: [],
      onboarding_timing_ms}` and `{onConflict: "user_id"}`.
   4. Clear the pending plan, `await` the gate recheck (D-0101), then `navigate("/", {replace: true})`.

   The existence check (step 1) runs once per visit. Retry after a failure resends steps 2 and 3,
   which are idempotent upserts. It doesn't re-run step 1, because a profile written by this same
   attempt would otherwise count as "existing" and skip the targets. A partial failure can leave
   targets without a profile, never a profile without targets. The gate then stays `missing` and
   brings the user back here, which is §8's intent.
4. **Failure and offline.** On a failed write, the screen keeps the pending plan and shows "Couldn't
   save your plan. Try again." with a Retry button. If `navigator.onLine` is false when a save would
   start, the screen makes no request and shows "Connect to save your plan". The next `window`
   `online` event starts the save without a tap. (A cold load of `/welcome/save` while offline
   usually never gets here: the gate resolves `unknown`, and `RedirectIfSignedIn` sends the user
   to `/`, D-0073 §1.)
5. **The start time is untouched.** `/welcome/save` never calls `markOnboardingStarted()` and never
   creates a `wl-onboarding` record. `startedAtMs` is set only at the UF-01.1 commit (D-0064 §7).

## Consequences
- T-0301c builds §1–§5. Its `/welcome/save` rows in `apps/web/src/app/__tests__/profile-gate.test.tsx`
  change only their expected screen id (UF-01.1 → UF-01.5-save), in the D-0097 §2 shape. No row's
  location assertion changes, because §2 keeps the user on `/welcome/save`.
- T-0301b's `features/UF-01/__tests__/screens.test.tsx` AC-2 row `/welcome/save → UF-01.1` becomes
  `→ UF-01.5-save`.
- Signed-in onboarding now takes one more tap when the answers are on another device ("Set up my
  plan"). It isn't on the timed path: principle 5 times UF-01.1 → UF-01.4.
- A known race remains. A second device can write a profile between step 1 and step 3, and this
  device's upserts then overwrite its targets and rhythm. The `profiles` trigger keeps
  `onboarded_at` and `onboarding_timing_ms`. This is accepted at v1 scale. An RPC that writes both
  rows in one transaction is the fix if it is ever reported (the same route as D-0070's revisit).

## Revisit when
- The first user test shows people confused by the "Set up your plan" screen, or drop-off there
  above 30 %.
- A partial-write report appears. Then move both writes into one RPC or Edge Function.
- T-0328 changes the gate seam (a fourth status), which may change how the stand-down and this
  screen interact.
