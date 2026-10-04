---
id: D-0177
title: "T-0471's slots.tsx mount breaks four UF-02 unit test files not in its listed extras: mock the check-in slot to null in each, the same shape slot.test.tsx already uses"
status: revisit
date: 2026-10-04
by: frontend-dev (T-0471, web-feature:UF-11)
area: web
builds-on: D-0174 §3
---
## Context
T-0471's listed-extra change to `apps/web/src/features/UF-02/slots.tsx` makes `todayCheckinSlot`
a real lazy `CheckinCard` instead of `null` (D-0174 §1). Three `apps/web/src/features/UF-02/
__tests__/*.test.tsx` files predate T-0308c/T-0471 and never mocked `slots.js`, because the slot
was always `null` on main: `today.test.tsx`, `reads.test.tsx` and `real.test.tsx`. Each seeds (via
a direct mock or a real, signed-in IndexedDB cache) a profile/history fixture that, read by the
real `evaluatePlanCheckin` `CheckinCard` now runs on mount, yields a genuine step-down proposal —
not a mock gap; `loadSessions`/`loadCheckins` are real and empty in every case, and a proposal
still forms from history/library/profile alone. 6 cases across the three files went red as a
direct, mechanical result: the card rendered where a test expected the attention line, C-01, or a
steady `loadEngineHistory`/`loadProfile` call count (`real.test.tsx` would also have made the real
`CheckinCard` run its online-only write effect against the real, test-configured
`lib/auth/client.js`, an unrelated hazard this file was never built to carry).

A fourth file, `resume-slot.test.tsx` (T-0395 AC6, the `todayResumeSlot`/`ResumeCard` mount), was
found the same way once the full `-w test` gate ran: its own `PROFILE` fixture is the same
proposal-bearing one, so the real `CheckinCard` mounted there too, hanging its first ("ready")
case's `waitFor(() => expect(resume()).not.toBeNull())` past the 5 s timeout — the check-in card's
own markup replaced where the resume card was expected. Unlike the other three, this file's own
subject IS a `slots.js` export (`todayResumeSlot`), so a blanket `() => ({ todayCheckinSlot: null,
todayResumeSlot: null })` factory would silence the very thing under test. Its fix is a *partial*
mock instead: `vi.mock("../slots.js", async (importOriginal) => ({ ...(await importOriginal()),
todayCheckinSlot: null }))`, keeping `todayResumeSlot` at its real, lazy value.

None of these four files is one of T-0471's listed extra paths (only `slots.tsx` and
`source.test.ts` are, per the ticket and D-0174 §1); they sit in the `web-feature:UF-02` lane, not
`web-feature:UF-11` (T-0471's lane). D-0174 §3 anticipates the analogous e2e fallout and allows a
narrow fix in the shared e2e mock; it is silent on vitest, but the same reasoning applies: a spec
outside the grant going red only because the card now shows is fixed at the narrowest point that
restores its own, unrelated assertions, never by changing what it asserts.

## Decision
Each of the first three files gets one `vi.mock("../slots.js", () => ({ todayCheckinSlot: null,
todayResumeSlot: null }))` (the same shape `slot.test.tsx` already uses for its own "AC-5 null"
cases), so their existing, unrelated assertions run exactly as they did on main. `resume-slot.
test.tsx` gets the partial-mock form above instead, since it needs the real `todayResumeSlot` to
stay real. No assertion in any of the four files changes. This is the narrowest fix: one new mock
block per file, in files this ticket doesn't formally list, to repair a break the ticket's own,
approved change causes.

## Consequences
- Four UF-02-lane test files get a one-mock addition from a UF-11-lane ticket. Flagged in
  T-0471's handback as a deviation from its literal "paths you may change" list, for the
  orchestrator/QA to ratify or correct.
- `slot.test.tsx` already covers the real lazy-slot behaviour (an injected component, DOM order,
  a never-resolving lazy import) — T-0471 adds its own AC-2 case there/in UF-11's own tests for
  the real `CheckinCard`-through-the-real-slot path, so none of the four files needs new
  coverage, only its old coverage kept working.
- The targeted `-w typecheck lint test` run on named files doesn't catch this kind of break
  (the two slots are independent, and `resume-slot.test.tsx` isn't in the UF-11 or the other three
  UF-02 files' own import graphs); only the full `-w test` gate across the whole `apps/web`
  workspace surfaced it. The ticket's own instruction to run the full gate once before hand-back
  (D-0158) is what caught this.

## Revisit when
- A product-owner groom wants this folded into T-0471's or a follow-up's listed extras instead of
  standing as a decision.
- A fifth UF-02 test file is found to need the same mock later: fold the convention into
  `helpers.tsx` instead of repeating the block a fifth time.
