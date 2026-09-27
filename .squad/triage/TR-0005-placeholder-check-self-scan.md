---
id: TR-0005
status: resolved
raised_by: triage on T-0004 (spec review)
date: 2026-09-27
---
## Conflict
The T-0004 spec (`docs/tickets/T-0004-ci-repo-hygiene-checks.md`) and D-0023 rule 4 can't both
hold:
- D-0023 rule 4 and AC17 say any "test file" with a literal assertion (`expect(true)`, `expect(1)`,
  …) and no marker fails. AC20 excludes only `node_modules/`.
- The spec puts the checker's own `node:test` files and fixtures in `.github/scripts/`
  (`*.test.mjs`, `__fixtures__/`). To test AC14–AC20 they must contain `expect(true)` and
  `@placeholder T-9999` / `@placeholder T-0309` text, as strings or fixture files.
- AC21 requires `pnpm check:repo` to exit 0 on the real repo, and the Out list forbids "an
  allowlist entry" or "a weaker rule".
- A marker can't fix this either. `@placeholder T-0004` fails on branch `t/T-0004-*` (rule 4b).

So with the rules as written, AC21 can't pass. D-0023 also never defines "test file". A related
risk: `node --test .github/scripts/` depends on how the Node version resolves directory
arguments, and it may run `*.test.mjs` files inside `__fixtures__/` as real tests.

No contract or `decided` decision is contradicted. D-0002 and D-0016 agree with the spec.
Tagging the four bootstrap tests is within D-0016's consequence that owning lanes replace
scaffolding, and the ticket's "Paths you may change" list covers it (CLAUDE.md lane rule).

## Options
1. Define the scan scope. The placeholder check scans only workspace test files, meaning
   Vitest-style `*.test.*` / `*.spec.*` under `apps/**` and `packages/**`. It excludes
   `node_modules/`, `dist/` and `.github/scripts/**`. This is a definition of scope, not an
   allowlist, because D-0016 placeholders exist only in workspaces.
2. Keep the rule repo-wide and make the checker's tests hide the literals (string
   concatenation, fixtures generated at runtime). This is brittle, and a future test author
   would trip over it.
3. Add an allowlist file. The spec forbids this, and it would also invite silencing real
   findings.

## Blocking
T-0004 (AC17, AC20, AC21 as written).

## Resolution
**Option 1.** It follows precedence 4 and 5: it touches only infra and process paths and is
cheap to widen later. D-0023 is `revisit`, not `decided`, and TR-0005 may only use that number,
so D-0023 is amended in place (rule 4a and rule 6, with the change noted). It is not superseded.
- The placeholder check scans `apps/**` and `packages/**` files matching
  `*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}`. It skips `node_modules/`, `dist/`, `build/` and
  `coverage/`. `.github/**` is out of scope for rule 4.
- `test:repo-checks` is `node --test ".github/scripts/*.test.mjs"` (explicit glob). It is not a
  directory argument, so fixtures under `__fixtures__/` never run as tests. Fixture files must
  not be named `*.test.mjs`.
- "Board status done" means the status cell of the ticket's row in `.squad/board.md`, trimmed,
  where the first word is `done`. So `todo (needs H-06)` is not done.

Follow-ups: product adds ACs for these three points to the T-0004 ticket (AC24–AC26). Infra
builds to amended D-0023. Decision: [D-0023](../decisions/D-0023-repo-hygiene-checks.md).
