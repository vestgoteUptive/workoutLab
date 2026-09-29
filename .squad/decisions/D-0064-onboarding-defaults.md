---
id: D-0064
title: UF-01 onboarding defaults (T-0301) — three goals, preselected answers, three equipment profiles, rhythm range, the plan is engine targets, pending plan and save after sign-in, profile gate
status: revisit
date: 2026-09-29
by: product-owner (T-0301 groom)
area: product
---
## Context
D-0014 fixes the order (UF-01.1 → .2 → .3 → .4 → .5), the 60 s metric (first render of UF-01.1 → first render of UF-01.4 with a plan), the on-device plan and the 24 h local copy. D-0022 §6 and D-0061 §3 fix three equipment profiles on UF-01.3. The prototype differs from the contracts in several places, and some flows aren't described anywhere:
- UF-01.2 shows 4 goals ("Lose fat" among them). `Goal` in `api/openapi.yaml` and `profiles.goal` have 3.
- UF-01.3 shows 6 equipment chips. D-0061 §3 keeps 3 profiles.
- UF-01.4 has a weekday picker, a session length and a split name ("Upper / Lower"). `profiles` stores `rhythm_min`/`rhythm_max`, with no weekdays, no session length and no split. The engine has no splits.
- The magic link can open in a different browser context from the one that holds the local answers (the iOS PWA case in D-0045 §5). The user then ends up signed in with no profile, and `/workouts/suggest` returns 422.
- A returning user can go through onboarding on a new device and then sign in to an account that already has a profile.
- `RedirectIfSignedIn` on `/account` (T-0300b) navigates as soon as the code verifies, so UF-01.5 itself has no chance to save.

## Decision
1. **Goals.** UF-01.2 shows exactly the 3 `Goal` values in the enum order: `build_muscle` "Build muscle", `get_stronger` "Get stronger", `general_fitness` "General fitness". There is no "Lose fat". The subtitle copy may name the D-0061 §1 rep ranges.
2. **Preselected answers**, so that the fastest path is 3 activations (Get started → Continue → Continue) to a rendered plan: goal `build_muscle`, level `beginner`, equipment profile `full-gym`, rhythm 3–4. A restored answer (§6) replaces the default.
3. **Equipment.** UF-01.3 is a single choice of 3 profiles, stored as `profiles.equipment` = the D-0022 §6 / `data/exercises/src/profiles.ts` arrays: `bodyweight` = `["none"]`, `dumbbells` = `["none","dumbbell","bench"]`, `full-gym` = all 10 vocabulary items (`none, dumbbell, bench, barbell, rack, cable, machine, pullup-bar, kettlebell, band`). The finer checklist is T-0216 (D-0061 §3).
4. **Schedule.** UF-01.4 asks only for the rhythm range: two steppers, "at least" and "at most" sessions per week, each 1–7. Raising min above max pushes max up, and lowering max below min pushes min down. There is no weekday picker, no session length (UF-08.1 asks for the time at every start, principle 2) and no priority areas (UF-11.3 has them).
5. **The plan is what the engine returns.** The UF-01.4 plan card shows goal, level, equipment profile, the rhythm ("3–4 per week · 6–8 per 14 days") and the 9 per-area targets from `deriveTargets({rhythmMin, rhythmMax, priorityAreas: []})` from `@workoutlab/engine`, in the fixed area order (principle 3). There is no split name. The card is the "plan" in D-0014's metric.
6. **Pending plan.** The answers and timing are kept in `localStorage["wl-onboarding"]` as `{version: 1, goal, level, equipmentProfile, rhythmMin, rhythmMax, startedAtMs | null, timingMs | null, savedAtMs}`. Every change rewrites the key and `savedAtMs`. A value older than 24 h (`now − savedAtMs > 86 400 000`), with the wrong version or that fails to parse is deleted on read and treated as absent (D-0014).
7. **Timing (NFR-AN-2).** `startedAtMs` = `Date.now()` at the first commit of UF-01.1 when the stored value is null. `timingMs` = `Date.now() − startedAtMs` at the first commit of UF-01.4 with a plan when `timingMs` is null and `startedAtMs` isn't. A wall clock survives a reload. If UF-01.1 never rendered (the signed-in path below starts at `/welcome/goal`), `timingMs` stays null and `onboarding_timing_ms` is written as null.
8. **Save after sign-in (`/welcome/save`).** Any sign-in (link, code, Google) lands on a protected route. The profile gate (§9) sends a signed-in user with no profile to `/welcome/save`, which UF-01 owns:
   - with a valid pending plan: if a `profiles` row already exists, **the existing profile wins** (NFR-SYNC-3 server wins). The pending plan is deleted and the user goes to `/`. Otherwise UF-01 upserts `profiles` (goal, level, equipment, rhythm_min, rhythm_max, priority_areas `[]`, onboarding_timing_ms) and then the 9 `area_targets` rows (`sets_per_14d` from `deriveTargets`, `source: "default"`, `onConflict: "user_id,area_id"`). It then deletes the pending plan, re-checks the gate and goes to `/`.
   - with no valid pending plan: it goes to `/welcome/goal`, the signed-in onboarding path. There, UF-01.4's button goes straight to `/welcome/save` instead of `/account`.
   - A failed or offline write keeps the pending plan, shows an error with Retry, and never leaves a profile without its 9 targets unreported (the gate stays "missing" until both writes succeed).
9. **Profile gate (web-shell, T-0301a).** `lib/profile` exposes `useProfileStatus(): "unknown" | "present" | "missing"` and `recheckProfile()`. A cached profile (`loadProfile()`) → `present` with no network wait. Otherwise, when online, `profiles … maybeSingle()`: a row → `present` (and `refreshProfile()`), no row → `missing`. An error or offline → `unknown`. Signed in and `missing`: the protected routes `/`, `/library*`, `/progress`, `/balance*`, `/plan` and `/session/setup` redirect to `/welcome/save`, and `/welcome/*` renders instead of redirecting. `/session/:sessionId` is never gated (principle 1). `unknown` never redirects. Signed out, nothing changes (principle 5: UF-01.1 never waits for the gate).
10. **Privacy link.** UF-01.5 links to `https://workout.vestgote.com/privacy/` (D-0010, NFR-PRIV-6).

## Consequences
- T-0301 is split: T-0301a (web-shell, the gate), T-0301b (UF-01.1–.4, pending plan, timing), T-0301c (UF-01.5, Google, `/welcome/save`).
- A follow-up (data/content): expose the equipment profiles from a package the web app can import (for example `@workoutlab/shared`), so that UF-01 and T-0216 stop duplicating the three arrays. Until then, a test pins UF-01's constants to the literals in §3.
- T-0308 (UF-11.3) should reuse the same rhythm stepper behaviour as §4.

## Revisit when
- The first user test (D-0014's trigger), especially if people want to pick weekdays or a session length.
- Drop-off at UF-01.5 exceeds 30 %.
- T-0216 lands (then UF-01.3 may link to "Edit equipment").
