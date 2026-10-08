# UF-11 Plan check-in — spec

- **Flow:** UF-11 Plan check-in (new in v2, D-0002; was v1 UF-09)
- **Screens:** UF-11.1 Check-in · UF-11.2 Plan · UF-11.3 Edit plan
- **Built in:** T-0308 (web-feature:UF-07). Rules in T-0202 (engine rule 9), encoded in `docs/engine-rules.md` by T-0101.
- **Decisions:** D-0002, D-0018 (periods, planned, proposals), D-0017 (NFR)
- **Principle:** 4, targets are not static. They adapt to what the user actually does, and never silently.

## UF-11.1 Check-in (card)
- Appears on UF-02.1 Today (below the body map) and at the top of UF-11.2, only while a proposal is pending.
- Copy (under): "You trained {a} and {b} times in the last two 14-day periods. Your plan is {2·min}–{2·max}. Switch to {newMin}–{newMax} per week?" Copy (over) uses "Step up to {newMin}–{newMax} per week?"
- `{newMin}–{newMax}` is the **clamped proposal** the engine returns (D-0018), never raw arithmetic in the UI (principle 3). Under: `newMin = max(1, min−1)`, `newMax = max(1, max−1)`. Over: `newMin = min(7, min+1)`, `newMax = min(7, max+1)`. Examples: 3–4 under → "2–3"; 1–2 under → "1–1" (never "0–1"); 6–7 over → "7–7" (never "7–8"). If the clamped rhythm equals the current one (1–1 under, 7–7 over), there is no proposal and no card.
- Shows a before → after preview of the per-area targets that the engine returns for the proposed rhythm.
- Actions: **Accept** · **Keep current**. There is no close button. The card stays until it is answered or replaced by a newer evaluation.
- Never rendered on UF-08.*, UF-09.* or UF-03.* (principle 1: nothing competes with the workout).

## UF-11.2 Plan
- Layout (D-0203): a header with the title, "Account and sign out" and a purpose line; the check-in card (only while pending); then the cards "Your plan", "Targets", "Check-ins" and "Routines".
- "Your plan": goal, rhythm (`min–max` per week and "{2·min}–{2·max} per 14 days"), priority areas, and Edit plan; the Favorite (UF-11.6) and Excluded (UF-11.5) rows sit directly under it, in that order.
- "Targets": a tile grid of the per-area targets. A source caption shows only when it isn't the default: "Adapted {d MMM}" / "Set by you". "From your plan" is no longer shown on Plan (it stays on UF-10.2). A footnote explains the default source once. A "See this period in Balance" link goes to UF-10.1.
- "Check-ins": a "First check-in" / "Next check-in" caption above the date, and the last 3 check-ins.
- "Routines": the routine list and New routine.
- Edit plan is the one primary action, except while a check-in is pending (then Accept is).
- "Next check-in: {date}" (the day after the current period ends).
- The last 3 check-ins: period dates, sessions completed, proposal, answer.
- "Edit plan" → UF-11.3. Entry points: UF-10.1 "Plan" link, and the Today card.

## UF-11.3 Edit plan
- The same controls as UF-01.2 Goal and UF-01.4 Schedule: goal, rhythm range (per week, 1–7, min ≤ max), priority areas (0–3).
- Save re-derives the targets (rule 4, `source = default`) and resets the check-in streak, so the next proposal needs two consecutive periods on the new rhythm. Any pending proposal is withdrawn.
- Changing level and equipment happens in settings, not here (out of scope for this spec).

## Evaluation rules (D-0018, summary)
- Period k covers local days [onboarding + 14k, onboarding + 14k + 13]. A completed session is a session with ≥ 1 hard set, dated by its local `started_at`.
- Under: completed < 0.7 × 2·min. Over: completed > 1.1 × 2·max.
- Two consecutive under periods propose −1/−1. Two consecutive over periods propose +1/+1. Bounds are clamped to 1–7, and there is no proposal if the clamped rhythm equals the current one.
- On app open, evaluate only the **last two ended periods** since the last reset, and show at most one card.
- Accept or Keep both record a `plan_checkins` row and reset the streak.

## Edge cases
- **Zero history:** a new user sees "First check-in on {date}" and no card until period 1 ends. Zero sessions in periods 0 and 1 counts as under twice, so a proposal is made.
- **Returning after 10 days off:** one low period alone never triggers a proposal.
- **Long absence (≥ 28 days, several periods):** only the last two ended periods are evaluated, and there is one card.
- **Offline:** the card renders from cached state, but Accept and Keep are disabled with "Connect to update your plan". UF-11.3 Save is disabled offline too.
- **Time running out:** not applicable. The check-in is never shown during a workout.

## Acceptance criteria (for T-0308 UI and T-0202 engine; each one is at least one automated test)
Fixtures: timezone Europe/Stockholm, onboarding completed 2026-08-02, rhythm 3–4 per week (plan 6–8 per period). Periods: P2 = 30 Aug–12 Sep, P3 = 13–26 Sep, P4 = 27 Sep–10 Oct, P5 = 11–24 Oct. Default targets as in rule 4.

- **AC1 (under twice → lower)** Given P2 = 4 and P3 = 3 completed sessions, When the app opens on 2026-09-27, Then UF-02.1 shows the card "You trained 4 and 3 times in the last two 14-day periods. Your plan is 6–8. Switch to 2–3 per week?" with Accept and Keep current.
- **AC2 (one low period, 10 days off → no proposal)** Given P2 = 7 and P3 = 2 (no sessions 15–24 Sep), When the app opens on 2026-09-27, Then no card is shown. Given P4 = 3 as well, When the app opens on 2026-10-11, Then the card proposes 2–3 per week.
- **AC3 (threshold)** Given P2 = 5 and P3 = 5 (5 ≥ 4.2), When the app opens on 2026-09-27, Then no card is shown. Given P2 = 4 and P3 = 4 (4 < 4.2), Then the lower proposal is shown.
- **AC4 (over twice → higher)** Given P2 = 9 and P3 = 10 (> 8.8), When the app opens on 2026-09-27, Then the card proposes "Step up to 4–5 per week?". Given P2 = 9 and P3 = 8, Then no card is shown.
- **AC5 (mixed → nothing)** Given P2 = 3 (under) and P3 = 9 (over), When the app opens on 2026-09-27, Then no card is shown.
- **AC6 (never silent)** Given the AC1 proposal is pending, When the user visits Today on 5 separate days without answering, Then profile rhythm stays 3–4, every `area_targets` row keeps the same `sets_per_14d`, `source` and `updated_at`, and the card is still shown.
- **AC7 (accept)** Given the AC1 proposal, When the user taps Accept on 2026-09-27, Then rhythm becomes 2–3, targets are re-derived with `source = adapted` and `updated_at = 2026-09-27`, a `plan_checkins` row records P2 = 4, P3 = 3, proposal 2–3 and answer `accepted`, and the card disappears. Given P4 = 3 under the new plan (4–6; 3 < 2.8 is false), Then no card is shown on 2026-10-11.
- **AC8 (keep resets the streak)** Given the AC1 proposal, When the user taps Keep current on 2026-09-27, Then rhythm and targets are unchanged, a `plan_checkins` row records answer `kept`, and the card disappears. Given P4 = 3, When the app opens on 2026-10-11, Then no card is shown. Given P5 = 2 as well, Then on 2026-10-25 the card proposes 2–3.
- **AC9 (never during a workout)** Given the AC1 proposal is pending, When the user is on any of UF-08.1–UF-08.4, UF-09.1–UF-09.9 or UF-03.1–UF-03.3, Then the check-in card is not in the DOM. When they return to UF-02.1, Then it is shown.
- **AC10 (offline)** Given the AC1 proposal is pending and the device is offline, When UF-02.1 renders, Then the card is visible, Accept and Keep current are disabled, and "Connect to update your plan" is shown. When the connection returns, Then both buttons become enabled without a reload.
- **AC11 (zero history, new user)** Given onboarding completed 2026-09-20 and no sessions, When UF-11.2 opens on 2026-09-27, Then it shows "Next check-in: 4 Oct" and no card. Given still no sessions, When the app opens on 2026-10-18, Then the card proposes 2–3 per week (0 and 0 are both < 4.2).
- **AC12 (floor)** Given rhythm 1–1 and P2 = 0, P3 = 0, When the app opens on 2026-09-27, Then no card is shown. Given rhythm 1–2 and the same history, Then the card reads "You trained 0 and 0 times in the last two 14-day periods. Your plan is 2–4. Switch to 1–1 per week?", and the text "0–1" is not in the card.
- **AC13 (session counting)** Given P3 contains one session with only warm-up sets, one session started 26 Sep 23:40 and ended 27 Sep 00:30 with 4 hard sets, and two separate sessions with hard sets on 20 Sep, Then P3 counts 3 completed sessions: the warm-up-only session is excluded, and the midnight session counts in P3.
- **AC14 (long absence)** Given the last app open was 2026-08-31 and P2 = 2, P3 = 0, P4 = 0, When the app opens on 2026-10-11, Then exactly one card is shown, based on P3 and P4 ("0 and 0").
- **AC15 (edit plan)** Given targets back 20, hamstrings 16, arms 12 and no priorities, When the user sets priorities to back, hamstrings and arms on UF-11.3 and saves, Then the targets become back 25, hamstrings 20 and arms 15 with `source = default`, and any pending card is withdrawn. When the user tries to select a 4th priority, Then the selection is blocked and "Pick up to 3" is shown.
- **AC16 (determinism)** Given the same history, profile and `now`, When `evaluateCheckin()` runs twice, Then both results are deep-equal (engine purity, principle 3).
- **AC17 (ceiling)** Given rhythm 6–7 (plan 12–14) and P2 = 16, P3 = 16 (> 15.4), When the app opens on 2026-09-27, Then the card reads "You trained 16 and 16 times in the last two 14-day periods. Your plan is 12–14. Step up to 7–7 per week?", and the text "7–8" is not in the card. Given rhythm 7–7 and the same history, Then no card is shown.
