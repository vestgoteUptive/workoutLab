---
id: D-0197
title: "Backlog groom 2026-10-06 defaults: a swap reason leads the item reason line; an authenticated empty read replaces the cache; UF-10 gets a no-data state; the profile gate's `resolved` flag and status-only ProfileGate are confirmed; web-shell gets no shared-file exemption; the gate read is bounded"
status: decided
date: 2026-10-06
by: product-owner (groom of the un-groomed todo rows)
area: web
amends: D-0106, D-0064, D-0073
builds-on: D-0171, D-0071, D-0113, D-0074
---
## Context
The human asked whether the ~49 un-groomed `todo` rows (one-line review/QA follow-ups from phases
0 to 4) are groomed properly. Several of them are not build work but open questions. Each gets a
default here, so the rows can be closed or specced against something written down. None of them
needs a human: they are web/process calls inside existing principles.

## Decision
1. **Item reason line: a `swap` reason comes first (T-0476; amends D-0106's `itemReasonLine`
   rule, resolves D-0171's follow-up).** `itemReasonLine(reasons)` takes the first non-empty
   `swap` line, then the other non-empty lines in `reasons` order, keeps at most 2 and joins them
   with " · ". With no `swap` reason the output is unchanged. The cap stays at 2 (row width on a
   phone). Why: a swap is the user's own action, and after it they must be able to see it was
   applied (UF-08.3 → UF-08.2). The engine's reason order (engine-rules 12.1) does not change; this
   is presentation only.
2. **An empty answer from an authenticated refresh replaces a non-empty cache (T-0349).** The cache
   is a mirror of the server, not a source of truth. Unsynced work lives in the queue, which a
   refresh never touches. A signed-in read that returns `[]` means the rows are gone on the server
   (deleted on another device, account reset), and keeping them would show data that no longer
   exists. An expired or invalid token gets an HTTP error from PostgREST, not `[]`, and the error
   path already keeps the cache. No code change.
3. **UF-10 has a no-data state (T-0350).** When the first cache read gives no result (no targets
   on the device) and no refresh can or will fill it (offline, or the refresh settled or hit its
   3 s cap and the cache is still empty), UF-10.1 and UF-10.2 show one `role="status"` line in place
   of the loading skeleton: "No balance on this device yet. Connect to the internet to load it."
   (copy may change without a decision). Before the first cache read settles, the skeleton stays.
4. **Profile gate (T-0328, T-0329, T-0333; amends D-0064 §9, confirms D-0073 §2 and §4).**
   - D-0073 §4 stands: `ProfileStatusProvider` exposes `resolved` beside `status`, and only the
     `/welcome/*` stand-down waits for it. No fourth status and no Suspense boundary.
   - D-0064 §9's route list is replaced by D-0071 §11's derived set, as D-0073 §2 records: every
     `protected` route in `routes.ts` plus the exact path `/session/setup`.
   - `ProfileGate` keys on `status` alone, on purpose. `unknown` (unresolved or errored) never
     redirects, so an unresolved gate fails open. The `status` reset on an account switch in
     `profile-context.tsx` is load-bearing for that. A change to what `unknown` means, or a fourth
     status, must revisit `ProfileGate` in the same ticket.
5. **No shared-file exemption for web-shell (T-0339).** A web-shell ticket that edits `routes.ts`,
   `eslint.config.mjs`, `lib/i18n/en.ts` or `lib/i18n/flows/*` lists the file under `## Paths you
   may change`, like any other lane. Those four files are the most contended in the app; the
   listing makes the overlap visible to the orchestrator when it schedules parallel work. The cost
   is one line in a ticket. check-lane-paths keeps its current behaviour.
6. **The gate's profile read is bounded (T-0351).** `resolveProfileStatus()`'s `profiles` query
   runs with no postgrest-js retry (`.retry(false)`) and an abort after 3 s (the D-0071 §8 refresh
   cap). A throwing network gives `unknown` at once; a hanging one gives `unknown` after 3 s.
7. **Spec-side checklist (T-0327).** The two lessons in T-0327 go into `docs/tickets/_template.md`
   so every spec carries them: an AC that names one value of a binary condition gets a sibling AC
   for the other value, or a line saying why it cannot exist; and a migration/upgrade AC's fixture
   carries every terminal row state (tombstoned, rejected), not only the happy path.

## Consequences
- T-0476, T-0350 and T-0351 are groomed against §1, §3 and §6.
- T-0349, T-0328, T-0329, T-0333, T-0339 and T-0327 close on the board, citing this decision.
- The orchestrator regenerates `.squad/decisions/INDEX.md` (`archive.mjs index`).
