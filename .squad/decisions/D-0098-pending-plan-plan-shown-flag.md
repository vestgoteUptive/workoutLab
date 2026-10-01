---
id: D-0098
title: The pending plan records whether UF-01.4 showed a plan (`planShown`); only such a plan is offered for saving
status: revisit
date: 2026-10-01
by: product-owner (groom T-0301b)
area: product
builds-on: D-0014, D-0064 §6–§8
---
> **Amended by D-0100 (§2), 2026-10-01.** §2: with no saveable plan, `/welcome/save` no longer goes to `/welcome/goal`. It stays on screen `UF-01.5-save` and offers a "Set up my plan" link to `/welcome/goal`. The rule that a record with `planShown: false` counts as "no pending plan" is unchanged.

## Context
D-0064 §7 sets `startedAtMs` at the first commit of UF-01.1, and §6 keeps it inside the
`wl-onboarding` record. So the record exists as soon as UF-01.1 renders, holding the §2 default
answers. If a user then taps "I already have an account", T-0301c sees a "valid pending plan" and:
- shows "Save your plan" instead of "Sign in" on UF-01.5, and
- on `/welcome/save`, for an account with no profile, writes the default answers the user never
  saw or confirmed.

`timingMs` can't stand in for "a plan was shown", because it stays null on the signed-in path that
starts at `/welcome/goal` (D-0064 §7).

## Decision
1. **A new field.** The record gets `planShown: boolean`. It is `false` when the record is created
   and becomes `true` at the first commit of UF-01.4 with a rendered plan card. Once `true`, it stays
   `true` until the record is cleared or expires. The version stays `1`, because no version of the
   record has shipped. Full shape: `{version: 1, goal, level, equipmentProfile, rhythmMin,
   rhythmMax, startedAtMs, timingMs, planShown, savedAtMs}`. A stored value without a boolean
   `planShown` is invalid and is deleted on read, as in §6.
2. **Saveable means `planShown === true`.** T-0301c's "Save your plan" heading, its Back link, and
   the `/welcome/save` write all require a valid record with `planShown: true`. A record with
   `planShown: false` counts as "no pending plan" (UF-01.5 shows "Sign in", and `/welcome/save` goes
   to `/welcome/goal`). The record isn't deleted, so its `startedAtMs` still times the onboarding.
3. Everything else in D-0064 §6–§8 is unchanged: the 24 h expiry, rewriting on every change, and
   the existing profile winning.

## Consequences
- T-0301b creates the record with `planShown: false`. T-0301d sets it to `true`. T-0301c reads it.
- T-0301c's AC-C1, AC-C5 and AC-C7 fixtures need `planShown: true`. The AC-B8 literal gains the
  field.

## Revisit when
- UF-01.5 drop-off data (D-0064) shows users expecting "I already have an account" to keep the
  answers they never confirmed.
- `startedAtMs` survives a detour. A user who opens UF-01.1, taps "I already have an account", comes
  back hours later (within 24 h) and then onboards gets a `timingMs` that includes the detour. That
  inflates NFR-AN-2's p50/p90. Revisit if the first metric run shows outliers of this shape. One
  option: reset `startedAtMs` whenever UF-01.5 is reached with `planShown: false`.
