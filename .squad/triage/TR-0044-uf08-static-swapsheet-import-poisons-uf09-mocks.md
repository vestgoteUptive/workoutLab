---
id: TR-0044
status: open
raised_by: frontend-dev (gate) on T-0303c
date: 2026-10-03
---
## Conflict
T-0303c UF-08.3 (commit cfe3fff) adds a static top-level `import { SwapSheet } from
"../UF-05/index.js";` to `apps/web/src/features/UF-08/SessionSetup.tsx`, per the ticket's explicit
instruction ("`SwapSheet` is imported statically from `../UF-05/index.js`", Scope › In). That one
line breaks three pre-existing, unrelated UF-09 tests and is the direct cause of the `-w
typecheck lint test` gate hanging (reported twice; see T-0303c's log).

### The chain
`apps/web/src/features/UF-09/device.ts` imports `readFocusPrefs`/`writeFocusPrefs` from the
`UF-08` barrel (`features/UF-08/index.tsx`, pre-existing since T-0304g, long before T-0303c).
`index.tsx` also does `export { SessionSetup } from "./SessionSetup.js"`. ESM barrel semantics
mean importing any name from `index.tsx` evaluates every `export … from` line, so `device.ts`
always forced `SessionSetup.tsx`'s module body to run, even though it only wants the prefs
functions. That was harmless until `SessionSetup.tsx` itself gained a static import of
`../UF-05/index.js`.

Three UF-09 test files hoist `vi.mock("../../UF-05/index.js", factory)` with a factory that
throws (simulating a stale-deploy chunk 404): `t0422.lazy-reject.test.tsx`,
`t0451.next-open.test.tsx`, `t0451.next-entry.test.tsx` (likely `t0451.try-again.test.tsx` too,
not yet isolated). None of them render `SessionSetup`; they render `SessionHost`
(`UF-09/host.tsx`), which imports `device.ts`, which imports the `UF-08` barrel, which now also
evaluates `SessionSetup.tsx`'s new `UF-05` import — landing inside the same mocked, throwing
module. Vitest's mocker reports the error as if it originated at
`SessionSetup.tsx:27:1`, the file "collects 0 test", and under the full `-w test` run's worker
pool this manifests as a hang (zero CPU, a worker stuck in `ep_poll`) rather than a clean failure
— reproducible from a one-line diff against `main` in a disposable clone (confirmed: adding just
that import line, nothing else, turns the previously-green `t0422.lazy-reject.test.tsx` red).

### Evidence
- Disposable clone of `main` + only `SessionSetup.tsx`'s diff from `t/T-0303c-swap-before-starting`
  cherry-picked: `npx vitest run src/features/UF-09/__tests__/t0422.lazy-reject.test.tsx` goes
  from 1 passed (on plain `main`) to "0 test" / mocker error (with the one-line diff applied).
- Full `apps/web` `vitest run` (via `scripts/locked.sh heavy … -w typecheck lint test
  --concurrency=1`) hung twice at the 1800 s timeout; the last test file to print a completion
  line both times was immediately before this group of UF-09 seam-retry specs in the reporter's
  stream.
- `apps/web/src/features/UF-09/__tests__/t0422.lazy-reject.test.tsx`,
  `t0451.next-open.test.tsx`, `t0451.next-entry.test.tsx`: each shows "(0 test)" when run in
  isolation against T-0303c's branch; each passes on `main`.
- `git show <T-0303c commit>:apps/web/src/features/UF-08/SessionSetup.tsx` vs its parent: the only
  structural addition relevant here is the one `import { SwapSheet } from "../UF-05/index.js";`
  line (ticket-mandated).

### Why this can't be fixed inside one lane
- `web-feature:UF-08` (T-0303c's lane) owns `apps/web/src/features/UF-08/**` only. The ticket
  explicitly requires the static import; swapping it for the lazy `retryableLazy` pattern already
  used in `UF-09/seams.tsx` (D-0142 §8) would fix this but contradicts the groomed ticket's Scope
  › In, so frontend-dev did not make that change unilaterally.
- The barrel coupling that makes `device.ts` evaluate `SessionSetup.tsx` for two unrelated prefs
  functions lives in `UF-09/device.ts`, outside `web-feature:UF-08`'s grant.
- Precedent: D-0156 (resolving TR-0043) already named this exact class of problem — "no mount of
  `SwapSheet` can avoid this, whether from T-0422, T-0418 or T-0303c" (conflict 2, the entry-chunk
  sentinel) — and folded a cross-cutting fix into T-0422 as a named exception to D-0144 §5. This is
  the same shape of issue, one layer earlier (module evaluation, not bundling).

### Options
1. **Recommended (web-feature:UF-09, small).** `device.ts` imports `readFocusPrefs` /
   `writeFocusPrefs` / `FocusPrefs` directly from `../UF-08/focus-prefs.js` instead of the
   `../UF-08/index.js` barrel. This is a read-only import already granted to other lanes elsewhere
   in the codebase (T-0303c's own ticket grants read-only imports of UF-05 by path, not by barrel,
   for the same reason). Breaks the transitive chain with no behaviour change; `UF-08/index.tsx`
   keeps exporting the same three names (AC-8 of T-0303c is unaffected). Needs a one-line import
   change plus confirming `UF-08/index.tsx`'s own "exports exactly …" test still passes.
2. Revert T-0303c's `SwapSheet` import to the lazy `retryableLazy` pattern (amends the ticket's
   Scope › In). Fixes the hang without touching UF-09, but contradicts a groomed, explicit
   instruction and changes UF-08.3's loading behaviour (first Swap click would show a loading
   step); needs product-owner sign-off since it's a product-facing change, not just internal
   wiring.
3. Change the three UF-09 mock factories to not throw synchronously (tried: making the factory
   `async` did not fix it — the poisoning happens at barrel-evaluation time, before the factory's
   sync/async shape matters). Not viable; listed only because it was tested and ruled out.

## Blocking
- T-0303c (merge only; its own build, AC and e2e proof is otherwise complete and already recorded
  in its ticket log). The cached `-w typecheck lint test` gate cannot go green while this stands,
  because the three poisoned UF-09 files are collected in the same run.
- Any other ticket whose full gate run includes both a `UF-08` static `UF-05` import and these
  three UF-09 test files (today, only T-0303c; future UF-08 work that touches `SessionSetup.tsx`
  should check this triage first).

## Resolution
(pending — triage agent to pick an option and record a decision)
