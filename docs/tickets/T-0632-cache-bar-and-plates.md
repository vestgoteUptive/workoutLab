---
id: T-0632
title: "lib/offline: cache bar_kg and plates_kg with the profile (toBarbell) and add loadBarbell(), defaults 20 kg and 25/20/15/10/5/2.5/1.25 when no row or an older row"
lane: web-shell
screens: [UF-09.3, UF-11.4]
decisions: [D-0218, D-0217, D-0034, D-0045]
deps: [T-0631]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1, D-0218). Flow: wl-build-web (agent frontend-dev). About ¼ day. Spec: docs/specs/cobalt-mock-behaviour.md §3.1. No Dexie version bump: the new field isn't indexed. -->

## Why
UF-09.3 must show the plate line offline (NFR-OFF-2), and UF-11.4 must pre-fill the settings from the device. Both read the profile cache, which today holds only an `EngineProfile`.

## Scope
- **In:**
  - `CachedProfile` (`lib/offline/db.ts`) gains an optional `barbell?: { barKg: number; platesKg: number[] }`.
  - `refreshProfile` writes `barbell: toBarbell(row)` next to `profile`, under the same `cacheWriteAllowed(gen)` guard.
  - `loadBarbell(): Promise<Barbell>` in `lib/offline` (exported from the index): the cached value for the current user, else `DEFAULT_BARBELL = { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] }`. Never rejects (an IndexedDB failure gives the default).
- **Out:** any UI (T-0633, T-0634); any write to `profiles`.

## Acceptance criteria
- **AC1 (refresh writes it).** Given a mocked `profiles` read returning `bar_kg 15`, `plates_kg [20, 10]`, When `refreshProfile` runs, Then the cached row has `barbell = { barKg: 15, platesKg: [20, 10] }` and `profile` is unchanged from today's mapping.
- **AC2 (read).** Then `loadBarbell()` returns `{ barKg: 15, platesKg: [20, 10] }`.
- **AC3 (defaults).** `loadBarbell()` returns `DEFAULT_BARBELL` when (a) no user is signed in, (b) no profile row is cached, (c) the cached row has no `barbell` field (a row written by an older build), and (d) the IndexedDB read throws. Four cases.
- **AC4 (empty plates kept).** A cached `platesKg: []` reads back as `[]`, not the default.
- **AC5 (user scoping).** User B's `loadBarbell()` never returns user A's cached value (two users in one database).
- **AC6 (sign-out).** After the existing sign-out wipe, `loadBarbell()` returns the default.
- **AC7 (stale generation).** A refresh whose generation is stale (`cacheWriteAllowed` false) writes neither `profile` nor `barbell`.

Checklist (D-0197 §7):
- Cached and not cached, old row and new row, signed in and out, and empty and non-empty plates are all covered.

## Paths you may change
- `apps/web/src/lib/offline/**` (lane)
- `docs/tickets/T-0632-cache-bar-and-plates.md` (log only)

## Contract impact
none (reads the D-0218 columns T-0631 adds)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · commit messages start with `T-0632` and cite UF-09.3.

## Build / accept log
