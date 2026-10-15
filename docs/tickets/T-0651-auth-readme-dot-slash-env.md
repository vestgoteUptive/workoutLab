---
id: T-0651
title: "infra/auth/README.md: source `./.env.local` (zsh-safe), and mark the paper-template PATCH applied 2026-10-09 (H-35 done)"
lane: infra
screens: [UF-01.5]
decisions: [D-0185, D-0208]
deps: []
status: ready
---
## Why
The README's two PATCH lines (`infra/auth/README.md:38` preview, `:56` apply) begin
`set -a; . .env.local; set +a;`. In zsh, `.` with a slash-free name searches `$PATH`, so the owner
got "no such file" running them (H-35). `. ./.env.local` works in both sh and zsh. Lines 13–14
(`. <repo>/.env.local`) already contain a slash and are fine. The `## Paper-palette templates`
section (`:75–80`) still says "PATCH pending (H-35)" and "Prod still sends the old Chalk & Iron
mail". The owner applied it on 2026-10-09 15:58 (`.squad/needs-human.md`, H-35): the live
template hashes match `main`, `others_sha256` is unchanged, and the drift check exits 0 (17 keys).

## Scope
- In:
  - `infra/auth/README.md:38` and `:56`: change `. .env.local` to `. ./.env.local`. Leave the rest
    of each line byte-identical.
  - `infra/auth/README.md:75–80`: heading becomes `## Paper-palette templates (T-0617, D-0208): applied 2026-10-09 (H-35)`.
    The body states the templates use the paper tokens, that the owner applied the keys-only
    PATCH on 2026-10-09, and that the drift check exits 0 since then (17 keys). Drop the "still
    sends the old Chalk & Iron mail" and "expected drift" sentences.
  - `.github/scripts/auth-patch.test.mjs:270–271`: the two expected prefixes follow the README
    (`"set -a; . ./.env.local; set +a;"` and `` `set -a; . ./.env.local; set +a; CONFIRM_PROD_AUTH=${REF}` ``).
    This test reads the README's sh blocks, so it must move in the same commit.
- Out: any live auth change (none is needed; the drift check is already green), and
  `expected-auth.json`. Older tickets' wording (`T-0404b`) is history.

## Acceptance criteria
Docs ticket. The README prefix is held by the existing test, and the rest are checks in the log.
- **AC1 (prefix, existing test).** Given the updated README, When
  `node --test .github/scripts/auth-patch.test.mjs` runs, Then
  "T-0404b AC-2 the README's preview and apply lines are the same argument list" passes with the
  `./.env.local` prefixes, and the `--apply` argv test still passes.
  - Planted fault: on a backup copy of the README, put `:38` back to `. .env.local`. The AC-2 test
    goes red. Restore with `cp`, and it is green.
- **AC2 (no slash-free form left).** `grep -n '\. \.env\.local' infra/auth/README.md .github/scripts/auth-patch.test.mjs`
  prints nothing. Log the empty output.
- **AC3 (H-35 recorded).** `grep -n 'pending\|Chalk' infra/auth/README.md` prints nothing, and
  `grep -n '2026-10-09' infra/auth/README.md` prints the heading line. Log both.
- Binary-condition check: sh/zsh. `. ./.env.local` is the one form both accept, so there is no
  second variant to test. Online/offline does not apply.

## Paths you may change
- `infra/auth/README.md`
- `.github/scripts/auth-patch.test.mjs` (lines 270–271 only)

## Contract impact
none

## Definition of done
- AC1 test green. AC1's planted fault, AC2 and AC3 are in the log.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green. `-w typecheck lint test --concurrency=1` is also green (nothing in a package changes, so turbo replays from cache). No e2e.
- Commits start `T-0651 UF-01.5:`.

## Build / accept log
- Start: clean, HEAD 49cd97ce. Edited README :38/:56 to `. ./.env.local`, Paper-palette section marked applied 2026-10-09 (H-35), test.mjs :270-271 prefixes.
- AC1: `node --test .github/scripts/auth-patch.test.mjs` 23 pass / 0 fail. Planted fault (README :38 back to `. .env.local`, backup restored with cp): 22 pass / 1 fail (AC-2 test red); restored: 23 pass.
- AC2: grep `\. \.env\.local` on README and test prints nothing.
- AC3: grep `pending\|Chalk` prints nothing; grep `2026-10-09` prints only line 75 (heading) and line 79 (body).
- Gate: -w typecheck lint test --concurrency=1 exit 0 (19/19 cached); test:repo-checks exit 0; format:check exit 0; check-all.mjs exit 0. No e2e.
