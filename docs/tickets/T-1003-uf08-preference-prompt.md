---
id: T-1003
title: UF-08 learn from edits - count swaps and removals, show the one-time "Prefer X?" and "Stop suggesting X?" card on UF-08.2, yes adds a favorite or an exclusion
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-08.6]
decisions: [D-0277, D-0281, D-0280, D-0202, D-0199, D-0235]
deps: [T-0998, T-1000, T-1008]
status: todo
---
## Why
Repeated swaps and removals become preferences with one question, using the existing favorites and excluded lists (`docs/specs/learn-from-edits.md`).

## Scope
- In (`apps/web/src/features/UF-08/`, `apps/web/src/lib/i18n/flows/uf-08.ts`): call `recordSwap` on a confirmed UF-08.3 swap (reason from the sheet) and `recordRemoval` on an UF-08.6 Remove (not Not today, not the stepper); at UF-08.2 mount read `pending()` from the cached totals at once, start `flushLedger()` and `pullLedger()` (T-1008) and show one card (oldest first) per `UF-08.2.md`, which may appear after the pull (the status region is present on mount and no other content moves); "Prefer it" calls the favorites write, "Never suggest" the excluded write (existing hooks, mutual exclusion applies); "No thanks" and any answer call `markAsked` (synced, so another device does not ask again); after yes the status line with Undo (the matching delete); offline the buttons are `aria-disabled` with the existing "Connect to change …" reason and the card stays; learning off shows no card. The plan on screen is not rebuilt.
- Out: UF-09 and UF-05.1 recording (T-1004), the UF-11.4 section (T-1005), engine, data.

## Acceptance criteria
- AC1 (swap card, both values) Given 3 signals for (bench-press, db-bench-press) over 3 visits, When UF-08.2 mounts, Then "Prefer Dumbbell bench press for Chest?" with "You've swapped Bench press for it 3 times." shows; Given 2 signals, Then no card.
- AC2 (removal card) Given 2 removal signals, Then "Stop suggesting {name}?" with "You've removed it 2 times." shows; Given 1, no card.
- AC3 (yes) Given "Prefer it", Then the exercise is a favorite (cache and queue write), the status line reads "{name} is a favorite now. Undo", the card is gone, and Undo removes the favorite. Given "Never suggest", Then it is excluded, with "{name} won't be suggested. Undo".
- AC4 (no, and asked once) Given "No thanks", Then no write and the card never returns for that pair, even after more swaps. Given leaving the screen without answering, Then the card is back next mount (pending kept).
- AC5b (counts from another device) Given own 1 signal and cached rows of another device with 2 for the same pair, When UF-08.2 mounts, Then the swap card shows; Given the other device's row has `asked_at`, Then no card. Offline, the cached rows still give the card.
- AC5 (one at a time) Given two pending, Then one card; the second shows after the answer.
- AC6 (never counted) Given a swap with reason equipment taken, "Not today", the stepper Remove, Then no signal (store spy).
- AC7 (offline, both values) Given offline, Then the card shows with disabled buttons and "Connect to change favorites" or "Connect to change excluded exercises", nothing is written, and the buttons work when the connection returns without a reload. Given online, AC3.
- AC8 (learning off) Given `learn_from_edits` false, Then no signal is recorded and no card shows; Given true, AC1.
- AC9 (not in focus mode) Given UF-08.1, UF-08.4 and UF-09, Then no card renders.
- AC10 (write fails) Given a failed favorite write, Then "Couldn't save. Try again." (`role="alert"`), the card stays and the entry is not marked asked.
- AC11 (a11y) Given axe at 320 and 390 px, Then no violations, targets at least 44 px, the status region is present on mount, focus moves to Undo after yes and never to `body`.

Checklist (D-0197 §7): at/below threshold, yes/no, online/offline, learning on/off, pending/asked.

- Release hold (T-1001 security review): no deploy that contains this ticket until T-1010 (privacy notice) is merged; list it in the PR to `main`.

- From T-1008: UF-08.2 mount calls `syncLedgerNow()`; the prompt reads `pendingFromAccount(now)` (both in `lib/offline/edit-ledger-sync.ts`).

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `tests/e2e/uf-08-area-plan.spec.ts` (orchestrator grant: the T-0996 AC13 one-status-line check counts the screen's status line, not the card's own region). Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1003` and cite UF-08.2.

## Build / accept log
