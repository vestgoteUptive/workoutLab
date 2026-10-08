---
id: T-0549
title: "UF-11.2 Plan rework, part 2 — check-in card restyle, Check-ins and Routines cards, one accent action (Edit plan goes secondary while a proposal is pending), loading and cold-cache states"
lane: web-feature:UF-11
screens: [UF-11.1, UF-11.2, UF-02.1]
decisions: [D-0203, D-0204, D-0018, D-0070, D-0081, D-0195, D-0002]
deps: [T-0548]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §3; GitHub #37). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Part 2 of 2 (D-0204 §1). Same folder as T-0548, T-0550, T-0540: run serially. The check-in card is also mounted on UF-02.1 (UF-02 slots.tsx), so the UF-02 e2e spec runs too. -->

## Why
Finishes the GitHub #37 rework of UF-11.2 per `Design-docs/docs/design/screens/UF-11.2.md` blocks 2, 7 and 8, the "Primary action" rule and the "States" table (D-0203 §3). Behaviour, copy and writes of the check-in (UF-11.1, `docs/specs/uf-11-plan-checkin.md`) don't change; only the presentation does.

## Scope
- In:
  - **Check-in card (block 2).** `CheckinCard` renders as a `.wl-card` with a `.wl-label` `h2` "Check-in"; the copy in body text; the before → after preview as rows (`{Area}` left, `{current} → {next}` right, numbers DM Sans 700); **Accept** with the primary button class and **Keep current** with the secondary class, stacked full width. Offline: both disabled as today.
  - **Primary action rule.** While the check-in card shows a pending proposal, the "Edit plan" link in the "Your plan" card (T-0548) uses the secondary class instead of the primary class, same place, same label. Exactly one element with the primary class is on the screen in every ready state.
  - **Check-ins card (block 7).** `.wl-card`, `.wl-label` `h2` "Check-ins"; the caption "First check-in" (D-0081: before any period has ended and with no check-ins) or "Next check-in", then the date `{d MMM}` as `.wl-stat`; the explanation in `.wl-muted`: "Every 14 days we compare your sessions with your rhythm. If you're under or over two periods in a row, we suggest a new rhythm. Nothing changes until you accept."; the last 3 check-ins newest first, each two lines: "{d MMM} · {from} → {to} per week" (weight 500) and "{n} sessions · {answer}" (caption); "No check-ins yet" when there are none.
  - **Routines card (block 8).** `.wl-card`, `.wl-label` `h2` "Routines"; one `.wl-row` per routine linking to `/plan/routines/{id}` with the name (wraps), the caption "{n} exercises", a chevron (`aria-hidden`), accessible name "{name}, {n} exercises"; "No routines yet" when empty; **New routine** → `/plan/routines/new` as the secondary button with a plus icon (`aria-hidden`).
  - **States.** Loading: the header only plus `role="status"` "Loading your plan" (caption), no cards. Cold cache: the header, then the neutral notice pattern with "Your plan isn't on this device yet. Connect to load it.", no cards.
  - **Copy** in `lib/i18n/flows/uf-11.ts`: the new strings; `checkinRow` and the "First check-in on {date}" / "Next check-in: {date}" sentences split into caption + date. Existing tests asserting the old combined strings are updated on purpose and listed in the log.
- Out:
  - Any change to check-in logic, writes or the D-0018 evaluation.
  - The UF-02.1 layout around the card (only the card itself changes).
  - UF-11.4 (T-0550).

### Edge cases that are in scope
- **Check-in pending vs not** (AC1, AC2).
- **First period** (no check-ins, no ended period): "First check-in" and "No check-ins yet" (AC3).
- **More than 3 check-ins:** only the newest 3 (AC3).
- **No routines** (AC4).
- **Offline:** the card's Accept and Keep current are disabled; every link still navigates (AC6).
- **Cold cache offline** and **loading** (AC5).
- **Returning after 10 days off:** a pending proposal (two under periods) shows the card; covered by AC1's fixture.

## Acceptance criteria
Fixtures: F-profile (rhythm 3–5), tz Europe/Stockholm, `now` 2026-10-07T09:00 local; check-ins as listed per AC.

- **AC1 (headings, spec AC2)** Given a pending proposal, Then the UF-11.2 root has exactly five `h2`s in the order "Check-in", "Your plan", "Targets", "Check-ins", "Routines". Given no pending proposal, Then exactly four, without "Check-in".
- **AC2 (one primary, spec AC5)** Given no pending proposal, Then the "Edit plan" link has the primary class and exactly one element in the root has the primary class. Given a pending proposal, Then "Edit plan" has the secondary class, "Accept" has the primary class, and exactly one element has the primary class.
- **AC3 (Check-ins card)** Given no check-ins and no ended period, Then the card shows the caption "First check-in", the date, and "No check-ins yet", and no list. Given 4 check-ins proposed 2026-08-12 (kept), 2026-08-26 (accepted, 3–5 → 2–4, 1 session), 2026-09-09 (withdrawn), 2026-09-23 (pending, 4 sessions, 3–5 → 4–6), Then the caption is "Next check-in" and the list has 3 items, newest first; the first reads "23 Sep · 3–5 → 4–6 per week" and "4 sessions · Waiting for you"; 12 Aug is absent.
- **AC4 (Routines card)** Given routines "Legs A" (7 items) and "Push" (1 item), Then two links to `/plan/routines/{id}` with accessible names "Legs A, 7 exercises" and "Push, 1 exercise" (the existing singular rule), and a "New routine" link to `/plan/routines/new` with the secondary class. Given none, Then "No routines yet" and the New routine link.
- **AC5 (loading and cold cache)** Given the first read pending, Then the root holds the header and one `role="status"` with "Loading your plan" and no `h2`. Given no plan on the device and offline, Then the header and the cold-cache line, and no `h2`.
- **AC6 (offline)** Given `navigator.onLine` false, a warm cache and a pending proposal, Then Accept and Keep current are disabled (as today), Edit plan is secondary and still a link, and the routine and New routine links are links.
- **AC7 (touch targets, spec AC8, Playwright)** Given `/plan` at 390 × 844 with a pending proposal and 2 routines, Then every visible `a`, `button` and `[role=button]` in the root has a bounding box ≥ 44 px tall.
- **AC8 (behaviour unchanged)** Every existing `checkin-card.test.tsx`, `checkin-mount.test.tsx`, `checkin-reread.test.tsx`, `checkin-writes.test.tsx`, UF-02 `checkin-answered.test.tsx` and the UF-02.1 / UF-11.2 e2e check-in tests pass, with only copy and class selectors updated and each update listed in the log.
- **AC9 (UF-02.1 still holds the card)** Given UF-02.1 with a pending proposal at 390 × 844, Then the card renders with the "Check-in" label and both buttons, and no horizontal scroll.

Checklist (D-0197 §7): pending/not pending (AC1, AC2); empty/non-empty check-ins (AC3) and routines (AC4); online/offline (AC6 vs AC1–AC4); loading vs ready (AC5).

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `apps/web/src/features/UF-02/__tests__/**` (selector or copy updates for the card, listed in the log)
- `tests/e2e/uf-11-plan.spec.ts` (copy and class updates, AC7)
- `tests/e2e/uf-02-today.spec.ts` (copy and class updates for the card, AC9)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · e2e: `uf-11-plan.spec.ts`, `uf-11-account.spec.ts`, `uf-02-today.spec.ts` green · contracts unchanged · commits start with `T-0549:` and cite UF-11.2 / UF-11.1.

## Build / accept log
Archived in `docs/tickets/log/T-0549.md` (D-0157).
