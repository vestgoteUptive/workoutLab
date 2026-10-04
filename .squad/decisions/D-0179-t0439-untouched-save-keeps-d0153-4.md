---
id: D-0179
title: "T-0439 closed without a change: UF-03.3's untouched Save keeps re-sending the stored ended_at (D-0153 §4 stands); a session finished on two devices is not a supported case"
status: decided
date: 2026-10-04
by: human (decision), orchestrator (record)
area: product
builds-on: D-0153 §4, D-0061, D-0015, D-0020
tickets: [T-0439]
---
## Context
T-0433's review found that an untouched Save on UF-03.3 re-queues the raw `ended_at` as `pending: true`. If the merged `loadSessions()` view holds a later `endedAt` (the same session was finished again on another device), the next flush moves the server's finish earlier. The ticket asked whether to send `max(raw, view.endedAt)` or to leave `ended_at` out of an untouched Save. It also noted that the tap-time rating can differ from the chip on screen if the view changed between mount and tap.

## Decision
- **Change nothing.** An untouched Save keeps sending `{...row, effort_rating}` with the stored `ended_at`, as D-0153 §4 decided.
- A session finished on two devices is not a use case worth code. D-0061 already confirmed that two-device editing of the same data is not real use (D-0015/D-0020). The worst outcome is a slightly earlier finish time on one session.
- The rating difference stays as D-0153 §4 decided it. It is revisited only if users report it.

## Consequences
- T-0439 is closed as won't-fix. No code, test or contract changes.

## Revisit when
Two-device finishing becomes a supported flow, or a user reports a wrong finish time or rating after a summary Save.
