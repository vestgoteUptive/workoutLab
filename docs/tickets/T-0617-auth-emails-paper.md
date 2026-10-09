---
id: T-0617
title: "Auth email templates (magic link, confirmation) in the paper palette with a paper.action button and the code in paper.ink; auth-templates.test BRAND reads the paper tokens; prod changes only through the human-run PATCH (H-35)"
lane: infra
screens: [UF-01.5]
decisions: [D-0208, D-0210, D-0211, D-0185, D-0012]
deps: []
status: done
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-infra (agent devops). About ¼ day. No deps; second wave. The repo change merges normally. Prod mail changes only when the owner runs the keys-only PATCH (H-35, D-0185 §4); until then the drift check reports the templates as changed, which is expected and noted in infra/auth/README.md. -->
## Why
The sign-in emails carry Chalk & Iron hex values, and `auth-templates.test.mjs` pins them as `BRAND`. T-0625 removes those tokens, so the templates move first. Paper (light) is safer than cobalt in mail clients that force light mode.

## Scope
- **In:**
  - `infra/auth/templates/*.html`: a `paper.bg` background, `paper.ink` text, `paper.ink-muted` secondary text, and a `paper.action` button with `paper.on-action` text. The 6-digit code (`{{ .Token }}`) is in `paper.ink`.
  - `.github/scripts/auth-templates.test.mjs`: `BRAND` = `[paper.bg, paper.ink, paper.ink-muted, paper.action, paper.on-action]`, read from tokens.json. The other AC-1 rules are unchanged.
  - `infra/auth/README.md`: a note that the PATCH is pending (H-35).
  - `infra/auth/expected-auth.json`: only if its derived values need the new template hash.
- **Out:**
  - Subject lines and copy, SMTP settings, and running the PATCH.

## Acceptance criteria
- **AC1 (template rules).** **Given** each template **when** `templateProblems` runs **then** it finds nothing: one ConfirmationURL in the button href, one `{{ .Token }}`, nothing remote, no `<style>`, and < 50 KB. Every hex is a tokens.json value, and each of the five paper `BRAND` colours appears.
- **AC2 (no legacy).** No template contains a flat-key hex value (`#121210`, `#D4F25A`, …). The test reads these from tokens.json, not typed.
- **AC3 (contrast).** The test computes `paper.ink` on `paper.bg` ≥ 12.9 and `paper.on-action` on `paper.action` ≥ 8.6 (at one decimal, D-0209 §1) from the tokens the template uses.
- **AC4 (suite).** `node --test .github/scripts/auth-templates.test.mjs .github/scripts/auth-patch.test.mjs .github/scripts/auth-drift-check.test.mjs` passes. A planted `#D4F25A` in a template fails AC2 (log).

Checklist (D-0197 §7):
- Both templates (magic link and confirmation) are covered. Light-mode and dark-mode clients aren't testable here; the log notes this, and it's why paper was chosen.
- No migration fixture: not applicable.

## Paths you may change
- `infra/auth/**`, `.github/scripts/auth-templates.test.mjs` (lane)
- `docs/tickets/T-0617-auth-emails-paper.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w test:repo-checks` green · commit messages start with `T-0617` and cite UF-01.5.

## Build / accept log
Archived in `docs/tickets/log/T-0617.md` (D-0157).
