---
id: TR-0022
status: resolved
raised_by: triage judge on T-0300 (spec check after groom)
date: 2026-09-28
---
## Conflict
- [D-0001](../decisions/D-0001-stack.md) (`decided`) fixes the `apps/web` stack: "IndexedDB (Dexie) for the offline set queue".
- The T-0300 groom ([docs/tickets/T-0300-pwa-shell.md](../../docs/tickets/T-0300-pwa-shell.md) Scope [c], "Paths you may change" dependency list, AC-C1 "a fresh `openDB`") and [D-0045](../decisions/D-0045-pwa-shell-defaults.md) build `lib/offline` on `idb` instead. No decision names this change.

Also checked, no conflict found: D-0015/D-0020 upsert, tombstones, sessions-before-sets and `session_sets_live` (AC-C1–C7, C13); the D-0034 §3 tie-break and the 56-day `pending: true` feed (AC-C14–C15); the `docs/data-model.md` `session_sets` columns; C-01 spec copy, labels, names and legend (AC-D1–D9); D-0031 guard scope (`public/` scanned, `.webmanifest` without markup exemptions); D-0023 placeholder; D-0011 (Google not wired); NFR-OFF-1/5/6, SYNC-3, PERF-1/2, A11Y-2, I18N-1, AN-1 thresholds.

A gap found alongside it (not a contract conflict): AC-B5 allows only `/welcome`, `/account` and `/auth/callback` when signed out. [D-0014](../decisions/D-0014-account-placement.md) needs UF-01.2–01.4 to work before sign-in. T-0301 adds those sub-routes later (D-0045 §2), so the guard must not block them.

## Options
1. Keep D-0001: the queue uses Dexie. The ticket's `idb` references become Dexie. Nothing is built yet, so this costs nothing to undo. Touches no contract and no other lane.
2. Supersede D-0001 (all of it, or just the storage line) to allow `idb`. It's smaller (~1 KB gzip against ~25 KB), but D-0001 is the cross-lane stack decision, and the PERF-2 budget (≤ 200 KB initial, ≤ 100 KB per chunk) fits Dexie easily, especially since `lib/offline` can be loaded after the first render.
3. Allow both. Rejected: it's ambiguous for the builder.

## Blocking
T-0300c (offline store) and the T-0300a–d `pnpm install` follow-up (the dependency list). T-0300a, b and d don't touch IndexedDB.

## Resolution
**Option 1.** Precedence 2: a `decided` decision wins over a `revisit` groom default, and nothing about the shell justifies overturning the stack decision. Recorded as [D-0045 §13](../decisions/D-0045-pwa-shell-defaults.md) (D-0045 is `revisit`, so amending it is allowed; this step may add only D-0045 and TR-0022):
- `lib/offline` uses **Dexie** (`dexie`, no `dexie-react-hooks` needed) instead of `idb`. `fake-indexeddb` stays for tests. AC-C1's "a fresh `openDB`" means "a new Dexie instance on the same database name". Every other T-0300c behaviour and AC is unchanged.
- `lib/offline` is not in the static import graph of UF-01.1, so Dexie never counts toward the first render of the welcome screen (principle 5, NFR-PERF-2).
- The D-0014 gap: the auth guard treats `/welcome` **and every path under `/welcome/`** as public, so T-0301 can nest UF-01.2–01.4 there. AC-B5 gains the case "signed out, `/welcome/goal` renders (no redirect)".

No human gate is crossed. Follow-ups: product (ticket text), orchestrator (install `dexie` instead of `idb`).
