---
id: TR-0038
status: resolved
raised_by: frontend-dev (build) on T-0303d
date: 2026-10-02
---
## Conflict
T-0303d AC-10 ("Back after Start") says browser Back from `/session/<id>` doesn't land on any `/session/setup` URL "(the replace)". D-0110 §4 fixes the mechanism as one `navigate("/session/<id>", {replace: true})` after the write, and T-0303d AC-4 pins it (a REPLACE, once). D-0110 §4's consequence ("Back from focus mode then goes to the entry before setup (normally `/`), never to a setup step") doesn't follow from that mechanism.

The setup steps are PUSH navigations inside one route (D-0107 §1). T-0303a pins Suggest → `?step=suggested` as a PUSH, and T-0303b AC-8 pins Looks good → `?step=ready` as a PUSH. By the time Start runs, history is `[…, /session/setup, /session/setup?step=suggested, /session/setup?step=ready]`. The replace swaps only the last entry, so Back goes to `?step=suggested`. With no setup state left, the host then replaces it with `/session/setup` (T-0303a AC-1), which is UF-08.1.

## Evidence
- On `t/T-0303d-ready-and-start`, the literal e2e row (`tests/e2e/uf-08-setup.spec.ts`, "browser Back from /session/<id> doesn't land on a setup URL (the replace)") fails with `Expected pattern: not /\/session\/setup/ · Received string: "http://localhost:4173/session/setup"`.
- Every other AC-10 row passes, and so do AC-4's REPLACE asserts.

## Options
1. **Amend the AC-10 Back row to match D-0110 §4 as built.** Back from focus mode never lands on `?step=ready`, so there is no setup screen with a live Start under the workout. It can land on UF-08.1, which shows nothing stale. No code change. Recommended for v1, because the D-0110 "Revisit when" already names "users come back to setup by mistake often" as the trigger to do more.
2. **Unwind the setup entries on Start.** The host records the history index of its first entry. After the write, it goes back `n` entries (a POP), then replaces that entry with `/session/<id>`. Back then reaches the entry before setup. This needs a decision amending D-0110 §4 and T-0303d AC-4/AC-5 ("navigates once", REPLACE only). Under BrowserRouter it also needs `history.state.idx`, which MemoryRouter tests don't have. Each Start shows UF-08.1 for a frame during the POP.
3. **Make the in-setup step changes REPLACEs.** That reverses T-0303a/T-0303b's PUSH pins and the D-0107 §1 "push inside the same route" rule. Browser Back would no longer step back through setup.

## Interim state on the branch
Start ships per D-0110 §4 (one REPLACE after the write). The literal Back row is kept under `test.fail(true, "TR-0038: …")`, so the suite stays green and the conflict stays visible. Once TR-0038 is resolved, amend or remove that row.

## Blocking
T-0303d (accept).

## Resolution
Resolved 2026-10-02 by triage: [D-0123](../decisions/D-0123-back-after-start-and-back-in-focus-mode.md).
- **Option 1 for UF-08.** D-0107 §1 (setup PUSHes) and D-0110 §4 (one REPLACE after the write) stand, so T-0303d AC-4/AC-5 are unchanged. D-0110 §4's guarantee is restated: Back from focus mode never lands on `?step=ready`/UF-08.4. It may land on UF-08.1. T-0303d AC-10's Back row is amended to match. The `test.fail` row is replaced by the amended row, which also passes after T-0394.
- **Options 2 and 3 rejected.** Unwinding needs `history.state.idx` under a declarative `BrowserRouter`, flashes UF-08.1 and changes AC-4/5. Step REPLACEs reverse decided pins. Neither fixes the real issue: Back would still leave a running workout silently, one tap from a second Start.
- **The real fix goes in UF-09.** Back in a running machine state shows Pause (UF-09.9), through a same-URL history guard (principle 1; this also covers the Android system Back in the standalone PWA). Back on UF-09.9 leaves normally, so nobody is trapped. That is new ticket T-0394 (`web-feature:UF-09`, deps T-0304d, T-0303d).
- **Second session.** Accepted in v1 (NFR-SYNC-4, no data lost, the old session goes stale after 12 h). A "Resume workout" entry on Today/UF-08.1 goes to product-owner to groom (D-0123 §5).
