---
id: D-0281
title: "Learning counts sync through the account: a new table edit_signals with one row per device and key, written only by its own device as absolute upserts, summed on read; opt-out and a reset epoch on profiles; export and delete cover it; plain CRUD with RLS, no openapi change"
status: revisit
date: 2026-11-24
by: product-owner (owner answer), triage (supersede D-0278)
area: data
supersedes: D-0278
amends: D-0218, D-0277, D-0279
builds-on: D-0001, D-0015, D-0017, D-0020, D-0136, D-0195, D-0199, D-0202, D-0251, D-0265
---
## Context
The owner answered the second open question of the learn-from-edits spec: **the counts are not device-only. They sync through the account.** D-0278 kept them on the device because a server copy needs a table, RLS, pgTAP, export and delete entries, an offline path and a privacy line. That cost is now accepted and each item becomes work (T-1001, T-1002, T-1007, T-1008, T-1010). `profiles.learn_from_edits` stays.

Two decisions follow from "synced": how offline increments merge, and what a user's "forget" means when several devices hold counts.

Options for the merge, weighed:
- **One shared row per key, queue and upsert, last write wins.** Safe against double counting, but two devices that count while apart each write their own absolute number, and the later flush overwrites the earlier one: a signal is lost, and a stale device can lower a count.
- **One shared row per key, additive (`count = count + 1`).** supabase-js upsert cannot express an increment, so it needs an RPC or an Edge Function (against plain CRUD, D-0001), and a request that the server applied but the device never heard back about (timeout) is retried and **counted twice**. That is the double count to avoid.
- **One row per device and key.** Each device writes only its own row, as an absolute upsert; the total is the sum of the rows. A replay writes the same numbers (idempotent), no two devices ever write the same row (nothing is overwritten), and it needs only plain CRUD. **Chosen.**

## Decision
1. **Table `public.edit_signals`** (data lane, `docs/data-model.md`):

   | column | type | null | default | notes |
   |---|---|---|---|---|
   | id | uuid | no | `gen_random_uuid()` | PK. A single unique column so the export pages in a stable order (as every other table's order key). |
   | user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
   | device_id | uuid | no | | A random id the device makes the first time it counts. Stored in the same IndexedDB store as the ledger, so both are lost together. Not derived from hardware, never shown. |
   | key | text | no | | `swap:{from}:{to}` or `removal:{exercise}`, the device ledger's own key. |
   | kind | text | no | | Check `in ('swap','removal')`. |
   | exercise_id | text | no | | FK `exercises(id)` **on delete cascade**. A swap: the exercise swapped out. A removal: the removed exercise. |
   | to_exercise_id | text | yes | | FK `exercises(id)` on delete cascade. A swap: the swap-in. Null for a removal. |
   | count | integer | no | `0` | Signals this device counted in its current window. Check between 0 and 999. |
   | window_start | timestamptz | no | | The first signal of the current window (client time). |
   | last_seen | timestamptz | no | | The latest signal (client time). Check `>= window_start`. |
   | asked_at | timestamptz | yes | | When the user answered the prompt for this key, on any device. |
   | created_at, updated_at | timestamptz | no | `now()` | Server-set. |

   - Unique `(user_id, device_id, key)` is the upsert target. Checks: `kind = 'swap'` exactly when `to_exercise_id` is not null; a swap's two ids differ; `key` equals the string built from `kind` and the ids; `count >= 1` unless `asked_at` is set (a row with count 0 is only an "asked" mark). Indexes on `exercise_id` and `to_exercise_id`.
   - Trigger `edit_signals_before_write`: insert sets both timestamps to `now()`; update keeps `user_id`, `device_id`, `key`, `kind`, both exercise ids and `created_at`, and sets `updated_at := now()`; **an update whose `last_seen` is older than the stored one is a no-op** (a late, reordered write cannot go backwards, the D-0015 rule for this table).
   - RLS: select, insert, update, delete for the owner (`authenticated`). `anon` has no privileges.
2. **How offline increments merge.**
   - The device's IndexedDB ledger (D-0278 §1, kept) is both the offline counter and the outbox. A signal is counted locally first, instantly, online or offline, and marks the entry dirty. Nothing waits for the network.
   - **Flush:** one flush at a time, per dirty entry one absolute upsert of `count`, `window_start`, `last_seen`, `asked_at` with `onConflict: 'user_id,device_id,key'`, then the entry is clean. Triggers: app start, the `online` event, UF-08.2 mount, and a short debounce after a signal. A failed flush leaves the entry dirty and retries; a replay writes the same numbers, so **it can never count twice**.
   - **Read (pull):** on UF-08.2 mount, online, one select of the user's rows, cached on the device. **Total for a key = the sum of `count` over the rows whose `window_start` is within the last 60 days**; **asked** = any row has `asked_at`. Offline, the total is the device's own entries plus the cached rows.
   - Signals counted on a device that is offline for a week reach the total when it reconnects. The failure mode is an **under-count** (a device that was wiped, a window that lapsed), which only delays a prompt. There is no path that counts one visit twice: a visit belongs to one device, and a device counts it once (D-0277 §2).
3. **The 60-day window** (D-0277 §3, made exact). A row's window starts at its first signal. A signal that arrives more than 60 days after `window_start` restarts the row at count 1. A row whose `window_start` is older than 60 days contributes 0, and any device that sees it deletes it unless `asked_at` is set (an asked mark outlives the window, so "asked for good" holds). A device keeps at most 200 entries and deletes its oldest rows beyond that. No server job. Known edge: a window restarting between signals can miss a threshold by a signal (accepted, revisit).
4. **The opt-out and a reset epoch, on `profiles`** (client-writable, neither changes `plan_changed_at`):
   - `learn_from_edits boolean not null default true` (D-0278 §2 unchanged). Off: nothing is counted, pending prompts are dropped, the device ledger is cleared, and the account's `edit_signals` rows are deleted.
   - **New:** `learn_reset_at timestamptz null`. The trigger sets it to `now()` whenever `learn_from_edits` changes or a client writes the column. Every device drops (and never pushes) ledger entries whose `last_seen` is at or before it. Without it, a device that was offline during "Forget" would bring the counts back at its next flush.
   - **Forget what was counted** deletes all of the user's `edit_signals` rows, then touches `learn_reset_at`. It needs a connection: offline the button is disabled with "Connect to change this", like the toggle.
5. **Privacy, export and delete.**
   - What is stored: which exercises were swapped or removed and how many times, with your account, in the EU region, readable only by you (RLS). No analytics view reads it (D-0017), no Edge Function reads it, and the engine never sees counts: it sees the favorites and excluded exercises that a user accepted.
   - **Export:** `edit_signals` is the 11th table of the account export (`EXPORT_TABLES`), ordered by `id`; the profile row carries both new columns. The export format stays version 1 (an added key). The e2e expectation goes from 10 to 11 tables and T-0951's drift test and list are extended.
   - **Delete:** the FK cascade removes the rows with the auth user (NFR-PRIV-5); the table joins the pgTAP `OWNED_TABLES` list and the account-delete test list. The device ledger is wiped at sign-out and account deletion with every other `wl-` store (D-0195). **Counts not yet synced at sign-out are dropped without a confirm** (hints, not workouts).
   - **Privacy notice:** the landing page's "What we store" gains one plain sentence (T-1010). The deploy that includes T-1003 or T-1004 (the first code that records a count) is held until T-1010 is merged, as D-0279 §3 holds the area view.
6. **Plain CRUD, no openapi change.** All reads and writes go through supabase-js under RLS (D-0001). No Edge Function, no RPC, no change to `api/openapi.yaml`. `database.gen.ts`, its vendored copy, the shared `Profile` row type and mapper (flag defaults to true, `learn_reset_at` to null) and the web profile cache gain the fields.
7. **Unchanged from D-0278:** no provenance column on `favorite_exercises` or `excluded_exercises`; an accepted preference is an ordinary row in one of them; the default of the flag is true; existing profile rows get true.
8. **Amends D-0277:** §8's "cross-device counts" is no longer out of scope; the counts, thresholds and "asked once" rules are as written, with totals summed across devices. **Amends D-0279:** T-1001 is the table and the profile columns, T-1002 is export and delete, T-1007 (local ledger) and T-1008 (sync) replace the old T-1002, T-1010 is the privacy notice.
9. **Known limits:** two devices can each show the same prompt before they have synced; answering twice is harmless (the favorite insert is idempotent and `asked_at` only goes from null to a value). A device with a wrong clock writes wrong `last_seen` values for its own rows. A user who never reconnects never shares counts.

## Consequences
- Tickets: T-1001 (data), T-1002 (export and delete), T-1007 and T-1008 (web-shell), T-1010 (landing privacy); T-1000, T-1003, T-1004, T-1005 and T-1006 are amended. Spec: `docs/specs/learn-from-edits.md`, updated in this commit.
- `docs/data-model.md` gains the table and two profile rows when T-1001 lands. `docs/engine-rules.md`, `api/openapi.yaml` and tokens do not change.
- The Edge Function `DELETE /account` needs no change (the cascade does the work); its integration test lists the new table.

## Revisit when
Prompts fire too early because of the window edge or two devices racing (then one row per visit, with an insert-ignore, gives an exact sliding window), the table grows large, or a learned preference should be told apart (a provenance column, which D-0278 §3 and this decision both defer).
