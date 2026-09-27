---
id: TR-0001
status: resolved
raised_by: triage on T-0001 (triage#check of the product-owner spec)
date: 2026-09-27
---
## Conflict
- `docs/specs/non-functional.md` **NFR-SYNC-2** says that editing a set "means a new version keyed by the same `client_id`, and the newest `completed_at` wins".
- **D-0013** (`.squad/decisions/D-0013-balance-window-coverage.md`) says a set is in the 14-day window when "the local date of its `completed_at`" falls in it. The UF-10 ACs (AC6, AC7, AC9) and the UF-10.2 day strip rely on this.
- **NFR-SYNC-1 / D-0011** say sets are append-only, keyed by `client_id`, and that the server ignores duplicates (unique `user_id, client_id`).

These cannot all hold:
1. If an edit bumps `completed_at` so that it wins, editing an old set moves it into today's window. Its load moves to a different day, and it never drops out as D-0013 requires.
2. If an edit does not bump `completed_at`, then "newest `completed_at` wins" cannot order edits.
3. With a plain unique `(user_id, client_id)` and "ignore duplicates", a new version under the same `client_id` is dropped, so edits and soft deletes never reach the server.

T-0100 (data), T-0300 (web-shell offline queue) and T-0101/T-0200 (engine load and balance) would each pick a different reading.

## Options
1. **Idempotent upsert with a separate edit clock.** One row per `(user_id, client_id)`. `completed_at` is written once and never changed. A new client-set `edited_at` orders versions (last writer wins). Deletes are a `deleted_at` tombstone sent through the same upsert. Replaying the same version is a no-op.
2. **Strictly append-only version chain.** Every edit or delete is a new row with a new `client_id` and a `replaces_client_id`. The live set is the chain head. Load queries and the view must resolve the chains.
3. **Sets are immutable in v1.** No edit and no delete after sync. This contradicts the UF-09.4 Confirm set edit and the UF-03.1 set table, which let the user correct a set.

## Blocking
T-0100 (session_sets schema and pgTAP), T-0300 (offline queue), T-0101/T-0200 (load and balance must exclude deleted sets). T-0001 itself is not blocked.

## Resolution
**Option 1**, recorded in **D-0015** (`.squad/decisions/D-0015-set-sync-upsert.md`).

Why, in the README order:
- *Principles:* none of the options threatens a principle. Option 3 would weaken logging corrections, so it is out.
- *Contracts and decided decisions:* option 1 keeps the one-date meaning of `completed_at` that D-0013 and engine rule 3 need. It also keeps the NFR-SYNC-1 check ("same `client_id` twice gives 1 row") true.
- *Lanes:* option 1 changes one table (data) and one queue (web-shell). Option 2 also forces chain resolution into the engine's load and every metric query.
- *Reversibility:* option 1 is two nullable columns plus an upsert rule, which is cheap to change. It is marked `revisit`.

D-0011 stays in force. D-0015 only narrows its "Conflicts" bullet ("append-only" now means that sync never hard-deletes or loses a set), so D-0011 is not superseded. NFR-SYNC-2 must be reworded by the product lane to match D-0015.

Follow-ups: product (reword NFR-SYNC-2), data (T-0100 columns, upsert and pgTAP), web-shell (T-0300 queue), engine (T-0101/T-0200 exclude tombstones).
