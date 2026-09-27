---
id: D-0015
title: Set sync — one row per (user_id, client_id), completed_at is immutable, edits ordered by edited_at, deletes are tombstones
status: revisit
date: 2026-09-27
by: triage (TR-0001, on T-0001)
area: data
---
## Context
TR-0001 found three rules that cannot all hold. NFR-SYNC-2 orders set edits by "newest `completed_at`". D-0013 dates a set in the 14-day window by `completed_at`. NFR-SYNC-1 / D-0017 dedupe on a unique `(user_id, client_id)` and ignore duplicates, so an edit sent under the same key would be dropped. This decision narrows the "Conflicts" bullet of D-0017 and replaces NFR-SYNC-2. The rest of D-0017 stands.

## Decision
- **Identity:** each set is exactly one row in `session_sets`, unique on `(user_id, client_id)`. `client_id` is a UUID generated on the client at "Done set". NFR-SYNC-1 still holds: inserting the same `client_id` twice gives 1 row.
- **`completed_at` is immutable.** The client sets it once, when the set is done. Edits never change it. It is the only date used to place a set in the window (D-0013, engine rule 3).
- **Edit clock:** a new column `edited_at timestamptz not null`, set by the client on every create, edit or delete. The server writes with `insert … on conflict (user_id, client_id) do update … where excluded.edited_at > session_sets.edited_at`. The newer edit wins, and an equal or older one is a no-op, so replays are idempotent.
- **Delete:** a new column `deleted_at timestamptz null` (the tombstone). A delete goes through the same upsert with a newer `edited_at`. Sync never hard-deletes a set. Hard deletes happen only through account deletion (NFR-PRIV-5 cascade).
- **Reads:** engine load, `balance()`, the 14-day view and the metric queries exclude rows where `deleted_at is not null`.
- **Meaning of "append-only" in D-0017:** sync never loses or hard-deletes a set. It does not mean one row per edit.
- Every other row keeps the NFR-SYNC-3 rule: server wins, with the last write decided by server timestamp.

## Consequences
- data (T-0100): add `client_id`, `edited_at` and `deleted_at` to `session_sets` in `docs/data-model.md` (this decision names that contract change), plus the upsert rule and pgTAP tests. The tests cover: a replay is a no-op, an older edit is ignored, a newer edit is applied, `completed_at` is unchanged after an edit, and a tombstoned set is excluded from the 14-day load.
- web-shell (T-0300): queue entries carry `client_id` and `edited_at`. An edit bumps `edited_at` only. A delete sends a tombstone.
- engine (T-0101/T-0200): the input sets exclude tombstones. Rule 3 states that sets are dated by `completed_at`.
- product: reword NFR-SYNC-2 in `docs/specs/non-functional.md` to cite D-0015.

## Revisit when
Clock skew between two devices causes a lost edit in testing, or set editing on two devices becomes a real use case (then switch to a server-assigned revision number).
