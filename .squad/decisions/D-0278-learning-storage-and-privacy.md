---
id: D-0278
title: "Learning storage: counts and asked-marks stay in a device store, never synced; one new column profiles.learn_from_edits (default true) carries the opt-out; no new table, no openapi change"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow); data-modeler impact review
area: data
amends: D-0218
builds-on: D-0017, D-0020, D-0195, D-0199, D-0202, D-0265
---
## Context
Where do the counts live, and does the opt-out follow the account? Server counts would need a new table, RLS, pgTAP, export and delete entries, an offline queue and a privacy line, for a hint that is wrong at worst once. Device counts need none of it and keep behaviour data off the server.

## Decision
1. **Counts and asked-marks** are an IndexedDB store on the device (`lib/offline`, the favorites and weight-step pattern, D-0265): key `kind:from:to` or `kind:exercise`, `{count, visits, firstAt, lastAt, pending, asked}`. Never queued, never synced. Cleared by sign-out, account deletion (every `wl-` store, D-0195) and "Forget what was counted".
2. **One column:** `profiles.learn_from_edits boolean not null default true`, client-writable like `bar_kg` and `level` (an update of it alone leaves `plan_changed_at` unchanged). Included in the export with the profile row (NFR-PRIV-4) and removed with the account (cascade). Existing rows get `true`. Off means: nothing is counted, pending prompts are dropped, the device store is cleared.
3. **No provenance column** on `favorite_exercises` or `excluded_exercises` in v1; a learned preference is an ordinary row.
4. **No new table, no new RLS policy, no openapi change.** The profile is read and written through supabase-js (D-0001). The shared `Profile` row type, `database.gen.ts` and the web profile cache gain the field.
5. Accepted limit: a second device counts for itself.

## Consequences
- T-1001 (data, one migration), T-1002 (device ledger), T-1005 (UF-11.4 toggle). The pgTAP test proves another user can't read or write the column and that the default is true.
- `docs/data-model.md` profiles table gains one row and the migrations list one line.

## Revisit when
Cross-device counts or provenance are wanted (then a table `edit_signals`, with RLS and export, replaces the device store).
