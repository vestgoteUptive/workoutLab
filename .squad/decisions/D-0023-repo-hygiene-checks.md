---
id: D-0023
title: Repo hygiene checks (T-0004) — valid screen IDs, v1 labels, decision ids, placeholder markers
status: decided
date: 2026-09-27
by: product-owner
area: process
---
## Context
T-0004 adds three CI checks: screen IDs in product docs must exist in user flows v2 (D-0002),
no two decision files may share a D-number, and the placeholder tests from the T-0002 bootstrap
(D-0016) must not outlive the tickets that replace them. The board line leaves open:
what counts as a valid ID, what counts as a v1 label, how a check tells that a placeholder's
ticket has landed, and where the scripts live.

## Decision
1. **Valid screen IDs** come from the "Flow index" table in
   `Design-docs/docs/product/user-flows.md` only. Each row gives a flow ID `UF-NN` and its step
   numbers (`.1 … · .2 …`, or a range such as `.1–.9`). Valid references are `UF-NN`,
   `UF-NN.n` for a listed step, and `UF-NN.*`. The example text in the file's intro is not a
   source. A new screen becomes valid when it is added to the index table.
2. **v1 labels** are a v1 flow ID followed by its v1 name where v2 gives that ID a different
   name: `UF-01 Sign up`, `UF-02 Onboarding`, `UF-03 Today`, `UF-04 Start workout`,
   `UF-05 Exercise guide`, `UF-06 Logging`, `UF-07 Summary`, `UF-08 Balance`, `UF-09 Plan`
   (the T-0001 AC1 list, plus v1's UF-01). Matching is case-insensitive and allows a space,
   `:`, `—`, `-` or `·` between the ID and the name. The label check skips inline code and fenced
   code blocks, because a quoted label is a literal and not a use, and it skips an ID written
   directly after `v1 ` (a history note such as "was v1 UF-08"). The ID-existence check skips
   nothing.
3. **Decision ids:** a file's D-number is the `D-NNNN` prefix of its filename. The check fails
   when two files share that number, or when a file's frontmatter `id:` is missing or differs
   from its filename.
4. **Placeholder tests** carry a comment `@placeholder T-NNNN`, naming the ticket that replaces
   them. A tagged file fails the check when (a) `.squad/board.md` shows T-NNNN as `done`, or
   (b) the branch being checked is `t/T-NNNN-*`, so the replacing ticket can't pass CI with
   the placeholder still in it. A test file with a literal assertion (`expect(true)`,
   `expect(1)`, `expect("x")`, `expect(null)`, `expect(undefined)`) and no marker fails as an
   untagged placeholder. A marker naming a ticket that isn't on the board fails.
   Initial tags (D-0016): `apps/web` → T-0300, `apps/landing` → T-0309,
   `packages/engine` → T-0200, `packages/shared` → T-0102.
   4a. *(Amended by triage, TR-0005.)* A "test file" is a file under `apps/**` or `packages/**`
   that matches `*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}`. Files under `node_modules/`, `dist/`,
   `build/` or `coverage/` are skipped. `.github/**`, which holds the checker's own `node:test`
   files and fixtures, is out of scope for rule 4. This defines the scope and is not an
   allowlist. A ticket is "done" when the trimmed status cell of its `.squad/board.md` row has
   `done` as its first word.
5. **Location:** the scripts and their tests go in `.github/scripts/` (infra lane), as
   dependency-free Node ESM that runs offline. They run in the CI `checks` job and in
   `pnpm -w test`.
6. *(Amended by triage, TR-0005.)* The checker tests run with an explicit glob,
   `node --test ".github/scripts/*.test.mjs"`, not a directory argument. Fixture files under
   `.github/scripts/__fixtures__/` must not be named `*.test.mjs`.

## Consequences
- The product-owner adds new screens to the flow index before citing them in the PRD, specs or
  tickets.
- The owning lanes delete the `@placeholder` test (or replace it with a real test and drop the
  marker) in their own ticket. T-0004 adds only the marker comment to the four bootstrap tests.
- Board status is the source of truth for "landed", which matches `.squad/README.md` ("the only
  backlog").

## Revisit when
- Triage ids (TR-NNNN) collide as well. Then extend rule 3 to `.squad/triage/`.
- Screen IDs start appearing in code or commit messages that should also be checked.
- The board format changes (the check parses its table rows).

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
