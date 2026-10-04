---
id: T-0493
title: "D-0084: annotate the OfflineStatus `hour: \"numeric\"` Consequences bullet as resolved by T-0355 (D-0045 §9) and pinned by T-0449"
lane: process
screens: [UF-06.1]
decisions: [D-0045, D-0084]
deps: [T-0449]
status: ready
groomed: 2026-10-04
---
<!-- Written by product-owner 2026-10-04 (groom mode). Build flow: process lane (triage agent) or the orchestrator, docs only. About 10 minutes. The board row says lane `product`, but `.squad/decisions/**` belongs to the `process` lane in `.squad/ownership.yaml`; the orchestrator should update the row's lane to `process`. -->

## Why
`.squad/decisions/D-0084-progress-date-abbreviation-and-unsynced-balance.md` (status `revisit`)
has one Consequences bullet that describes code that no longer exists:

> - Follow-up (web-shell): `OfflineStatus` formats with `hour: "numeric"`, which renders `8:10`
>   for `en-GB` on this ICU. T-0307b AC-12 wrote `08:10`. The test accepts both spellings. If
>   `08:10` is wanted, `formatTime` needs `hour: "2-digit"` (lane: web-shell).

T-0355 changed `formatTime` (`apps/web/src/lib/format/intl.ts`) to `timeStyle: "short"`, as
D-0045 §9 decides, so `en-GB` renders `08:10`. T-0449 pinned it in `OfflineStatus`'s tests with a
binary pair and rejected `hour: "2-digit"`, which would render `08:05 AM` in `en-US`. A reader
who trusts the bullet today would reintroduce `hour: "2-digit"`. The note must say so plainly.

## Scope
- In: D-0084's `## Consequences` section only. Keep the original bullet text (decisions are a
  record) and add one indented sub-bullet under it, worded like this:

  ```
    - **Resolved (2026-10-04).** T-0355 made `formatTime` use `timeStyle: "short"`, as D-0045 §9
      decides, so `en-GB` renders `08:10` and `en-US` keeps `8:05 AM`. Do **not** switch to
      `hour: "2-digit"`: it renders `08:05 AM` in `en-US`. T-0449 pins this in
      `components/offline-status/__tests__/OfflineStatus.test.tsx`; T-0491 (UF-06) and T-0492
      (UF-11) tighten the feature tests to the literal `08:10`.
  ```
- Out:
  - D-0084's front matter (`status: revisit` stays: §1-§3 are still live defaults), title,
    Context, Decision §1-§3 and "Revisit when".
  - `.squad/decisions/INDEX.md`: the title does not change, so the index row stays as it is.
  - Any code or test file.

## Acceptance criteria
- **AC1 (annotation present)** Given the edited D-0084, Then its Consequences section holds the
  original bullet unchanged plus one sub-bullet that names T-0355, D-0045 §9, T-0449,
  `timeStyle: "short"` and the rejected `hour: "2-digit"`. Check: `grep -c "T-0355\|T-0449"` on
  the file is ≥ 2, and `git diff` shows only added lines (no `-` lines).
- **AC2 (nothing else moved)** `git diff --stat` lists only D-0084 and this ticket file;
  `.squad/decisions/INDEX.md` is unchanged.
- **AC3 (checks)** `node .github/scripts/check-all.mjs` exits 0 (decision front matter and ID
  checks still pass).

## Paths you may change
- `.squad/decisions/D-0084-progress-date-abbreviation-and-unsynced-balance.md` (lane `process`)
- `docs/tickets/T-0493-d0084-consequence-resolved-note.md` (log only)

No overlap with T-0490 (ticket files), T-0491 (UF-06 test) or any in-flight ticket.

## Contract impact
none

## Definition of done
AC1-AC3 hold and are recorded in the log · `node .github/scripts/check-all.mjs` green ·
contracts unchanged · commit message starts `T-0493` and cites UF-06.1.

## Build / accept log
- 2026-10-04 (build): Added one indented sub-bullet under D-0084's existing `OfflineStatus`
  Consequences bullet, worded exactly per Scope: names T-0355, D-0045 §9, T-0449,
  `timeStyle: "short"`, and explicitly rejects `hour: "2-digit"`. Original bullet text, front
  matter, title, Context, Decision §1-§3 and "Revisit when" untouched; `.squad/decisions/INDEX.md`
  untouched.
- AC1: `grep -c "T-0355\|T-0449"` on the D-0084 file = 2 (≥ 2, pass). `git diff` vs. parent
  commit `bd9c02d` shows only `+` lines (no `-` lines) — pass.
- AC2: `git diff bd9c02d --stat` lists only the D-0084 file (plus this ticket file's own log
  entry, written after); `.squad/decisions/INDEX.md` unchanged — pass.
- AC3: `node .github/scripts/check-all.mjs` exit 0 — pass.
- Note: build was briefly disrupted by a dispatch collision (T-0493 and T-0490 both told to work
  directly in the shared main checkout without a worktree); the content edit itself was correct
  throughout and was recovered intact onto this isolated worktree (`t/T-0493-d0084-note` off
  `bd9c02d`) with no loss or mixing with T-0490's changes. See `.squad/state.md` for the
  incident note.
