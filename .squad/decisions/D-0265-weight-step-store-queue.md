---
id: D-0265
title: "Weight-step device store: IndexedDB v5, one queue entry per exercise replayed oldest first, last write wins decided on the device, effective library behind loadLibrary()"
status: revisit
date: 2026-11-21
by: frontend-dev (T-0954 build)
area: web
builds-on: D-0251, D-0259
---
## Context
D-0251 and D-0259 §13 want the weight step editable offline, applied at once, synced later, last write wins by `updated_at`. The server trigger sets `updated_at` itself and ignores a client value, so a replayed offline write would always look newest. T-0951's review asked for in-order replay. No existing queue covers a CRUD table (favorites are online-only).

## Decision
1. **Storage:** Dexie version 5 adds `exerciseSettings` (`key, userId`) and `exerciseSettingsQueue` (`key, userId, queuedAt`), no `.upgrade()`. T-0953 adds its own later version; the "current version" asserts in the `upgrade-v*` tests move with each bump.
2. **Queue:** one entry per (user, exercise); a later write replaces the earlier one (same key, so last write wins). `flush()` sends entries sorted by `queuedAt` (monotonic device clock), one at a time, and stops at the first network or unknown error. An entry is removed only if it is still the one that was sent.
3. **Last write wins on the device:** before sending, read the server row. If its `updated_at` is later than the entry's `queuedAt` and is not the stamp this device already knew (`seen`), another device wrote after this write: drop the entry and adopt the server value. The `seen` stamp keeps a device clock behind the server from turning the server's own earlier answer into a "newer" write. Assumption: device clocks are within normal drift; a clock a day off can mis-order two devices' writes.
4. **Rejected writes** (23514, 23502, 22P02, 23503): the entry becomes `rejected` (never retried), the device value reverts to `base` (the value before the first still-queued write). Reads revert in memory too (live query safe); `loadExerciseSteps` persists it. `useExerciseSettingErrors` lists rejections until `dismiss`.
5. **Online** a write is sent at once (best effort); offline it waits for the `online` event or the next flush.
6. **Effective library:** `loadLibrary()` now returns the library with the user's `incrementKg` for loaded, non-timed exercises (shared `hasExternalLoad`), so every existing engine caller (`suggest`, `rankSwaps`, `applySwap`, `insertItem`, UF-09's ctx and the stepper) shares one step with no change outside `lib/offline`. `loadBaseLibrary()` is the raw library (UF-04.2's "Use default"). A running workout keeps the plan it holds; the new step shows from the next computation.

## Consequences
T-0956 builds the UF-04.2 row on `setExerciseStep`, `resetExerciseStep`, `useExerciseSteps`, `useExerciseSettingErrors`, `loadBaseLibrary`. `refreshAll` also refreshes the store.

## Revisit when
Clock skew between devices causes a wrong winner in practice (move the compare to a server-side `updated_at` guard), or another per-exercise setting needs the same queue.
