---
id: TR-0035
status: open
raised_by: frontend-dev (build) on T-0302a
date: 2026-10-02
---
## Conflict
T-0302a AC-8 and D-0071 §8 (decided) say that UF-02.1, when online, runs **one `refreshAll(now, tz)` per mount**. D-0108 §3 and T-0302a AC-14 say every `app/**` test passes unchanged. The two can't both hold for one existing shell test:

- `apps/web/src/app/__tests__/profile-gate.test.tsx:930` "QA: D-0073 §3 — a `stale` session is gated too › stale + `missing` on `/` redirects to /welcome/save" ends with `expect(spy.countFor("profiles")).toBe(1)` (line 951).
- In that test the session is `stale` (expired token, `getSession` never settles), `navigator` is `{onLine: true}`, and `/` renders while the gate resolves. The built `Today` mounts, sees `navigator.onLine`, and starts `refreshAll` → `refreshProfile` → `supabase.from("profiles")`. That's a second `profiles` read, so the count is 2.
- This is deterministic. The file fails in isolation on the T-0302a branch (88/89) and passes against main's stub `features/UF-02/index.tsx` (89/89), with nothing else changed. In the full `pnpm -w … test` run it is the only red test (1069/1070).
- `AutoSync` (`lib/offline/AutoSync.tsx`) refreshes only when `status === "signed-in"`, so the shell's own refresh never hits this case. `Today` follows the `features/UF-10/use-balance.ts` pattern, which has no auth check. UF-10 isn't at `/`, so no shell test has caught it there.

D-0108 §3 says: "If one goes red anyway, the builder raises triage. It does not edit the file." The test file has not been edited.

## Options
1. **(Recommended) Today refreshes only for a signed-in session**, the same condition `AutoSync` uses:
   - Condition: `navigator.onLine && useAuth().status === "signed-in"`, from `lib/auth/auth-context.js` (a read-only import).
   - A `stale` session (expired token, refresh not done yet) gets the cached render and no refresh. It picks one up on its next mount once signed in. AutoSync already refreshes the caches when the status turns `signed-in`.
   - Amend T-0302a AC-8 "Online" to "online **and signed in**", and add the other value: online + `stale` → 0 `refreshAll` calls after a 50 ms macrotask.
   - The UF-02 tests then need an `AuthProvider`, or a `vi.mock` of `useAuth`, because `useAuth` throws outside a provider.
   - The flag must start the refresh at most once per mount, so a `stale` → `signed-in` change during the mount doesn't count twice.
   - It needs a decision amending D-0071 §8 for UF-02 (and possibly for every Phase 3 screen, so UF-10 and UF-08 match).
2. **Grant T-0302a an edit to `profile-gate.test.tsx`** (a D-0088-style grant) that relaxes line 951 to `>= 1`, or counts the gate's read separately from the screen's refresh. This weakens the "the gate really did read" pin, and D-0108 §3 chose not to give this grant.
3. **Keep the ticket literal and accept the red test.** This isn't allowed: the DoD needs `pnpm -w test` green.

## Evidence
- Branch `t/T-0302a-today`. The code is in `apps/web/src/features/UF-02/use-today.ts`: `refreshed = navigator.onLine ? settledOrCapped(refreshAll(at, timeZone), REFRESH_CAP_MS) : null`.
- `npx vitest run src/app/__tests__/profile-gate.test.tsx` gives 1 failed / 88 passed. With `git checkout main -- src/features/UF-02/index.tsx` it gives 89 passed.
- Every other DoD item is green: the UF-02 Vitest suite, the whole e2e suite (59/59), typecheck, lint, `format:check`, `check:size` and `check-all`.

## Resolution
(triage fills this in)
