---
id: D-0139
title: "Resume workout" is a card on Today (UF-02.1) only, for the newest unfinished, non-stale session of this user that has a focus state on this device; it is a UF-09 component mounted through features/UF-02/slots.tsx
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0395)
area: product
builds-on: D-0123 §4 §5, D-0111 §6 §7, D-0071 §3, D-0106 (slots.tsx), D-0067 §4
---
## Context
D-0123 §5: a PWA reopens at its start URL (`/`, UF-02.1 Today). The D-0111 §7 restore runs only when `/session/<id>` is opened, so after a cold start (app killed mid-workout, phone restarted, Back on UF-09.9) the user has no way back into the workout. D-0123 §4 accepts a second unfinished session, but the user should not have to start one to keep training. The board row (T-0395) asks to pick Today and/or UF-08.1.

Options:
1. **Today only.** Today is where every cold start lands, so one entry covers the case. UF-08 stays untouched (D-0123 §1).
2. **UF-08.1 only.** The user has to tap Start first, and only then sees that a workout is running. Wrong order.
3. **Both.** Two places to build and test. UF-08.1 would also need its own rule for "Start while one is running", which D-0123 §4 chose not to add.

## Decision
1. **Today (UF-02.1) only.** A "Workout in progress" card. UF-08.1 is unchanged (D-0123 §1 and §4 stand).
2. **When the card shows.** There is a resumable session when all of these hold:
   - an `offlineDb().sessions` row with `userId === currentUserId()`;
   - `row.ended_at` is null;
   - `now − started_at ≤ 12 h` (the D-0111 §7 stale bound, `STALE_AFTER_MS`, inclusive: exactly 12 h still shows);
   - `parseSessionPlan(row.plan)` is `ok` with a non-null plan;
   - `localStorage["wl-focus:<id>"]` holds a value (`FOCUS_KEY_PREFIX`). This is what "on this device" means: UF-09 writes it on the first load (`load.ts`), so a session pulled from another device that was never opened here doesn't show.
   With several, the newest `started_at` wins (a tie: the smaller `id`). Only one card shows.
   The stored focus state is only checked for presence, never validated here. The host's restore (D-0111 §7) still decides what to do with it.
3. **What the card shows.** `data-part="resume"`, after the header and before the compact C-01:
   - title `en.uf09.resumeTitle` = "Workout in progress";
   - one line `en.uf09.resumeLine(time, done, total)` = "Started {HH:MM} · {done} of {total} sets". `time` is `started_at` in the device locale and time zone. `done` is the number of `loggedSets` in the stored focus state (0 when it doesn't parse). `total` is the sum of `sets + (backoff ? 1 : 0)` over the plan's items;
   - one link, `en.uf09.resumeAction` = "Resume workout", to `/session/<id>` (a PUSH, so Back from focus mode lands on Today).
   - "Start workout" stays as it is. Starting a second workout is still allowed (D-0123 §4).
4. **Who owns it.** The card is a UF-09 component, `ResumeCard`, exported from `features/UF-09/index.tsx` (D-0071 §3). UF-02 mounts it through `features/UF-02/slots.tsx` (`todayResumeSlot`, a `React.lazy` import), the same way the check-in card is mounted (D-0106). Today renders the slot inside `Suspense` with a `null` fallback, so Today never waits for it, and nothing else on Today moves while it loads.
5. **Offline and failure.** It reads only IndexedDB and `localStorage`, so offline it shows the same. An IndexedDB or storage error renders no card and never throws (D-0111 §7).
6. **Stale sessions show nothing.** A session older than 12 h gets no card. Coming back after 10 days off, Today looks exactly as it does today. Opening the stale session's URL still shows the D-0111 §7 stale state.
7. **Principle 1** is untouched: the card is on Today, never in UF-09. **Principle 2** is untouched: Resume continues a session that already went through UF-08.1. It never starts a new one.
8. **User flows v2** gets a short UF-02 section that describes the card (no new screen ID: it is part of UF-02.1).

## Consequences
- T-0395 becomes a build ticket in lane `web-feature:UF-09` (flow `wl-build-web`), with listed extras in `features/UF-02/` (`slots.tsx`, `Today.tsx`, their tests) and `lib/i18n/flows/uf-09.ts`.
- The UF-09 export pin (`__tests__/exports-and-lint.test.ts`) gains `ResumeCard`.
- T-0308c also edits `features/UF-02/slots.tsx` and `Today.tsx`. The two run one after the other.

## Revisit when
- Users want to resume a session older than 12 h. Then the stale state's "Resume anyway" (D-0111 Revisit) and this card change together.
- Second unfinished sessions turn out common (D-0123 Revisit). Then UF-08.1 gets an in-progress guard that links to the same session.
