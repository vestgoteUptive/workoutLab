---
id: T-0624
title: "Web: retire the Chalk & Iron fallback once every route root carries a state: :root generic variables point at plan, the unscoped legacy .wl-* rules go, and no file in apps/web reads a flat legacy colour key or --wl-font-display/body"
lane: web-shell
screens: []
decisions: [D-0208, D-0210, D-0211, D-0213]
deps: [T-0595, T-0596, T-0597, T-0598, T-0599, T-0600, T-0601, T-0602, T-0603, T-0604, T-0605, T-0606, T-0607, T-0608, T-0609, T-0610, T-0611, T-0612, T-0613, T-0615, T-0616]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Full web e2e suite. If a feature folder still reads a legacy token, list it as a follow-up for that feature lane instead of editing it here. -->
## Why
D-0210 §6 retires the flat tokens only after nothing reads them. This ticket proves that for `apps/web` and removes the migration-only CSS: the `:root` legacy mapping, and the unscoped Chalk & Iron rules for `.wl-card`, the buttons and so on.

## Scope
- **In:**
  - `main.css`: the `:root` generic variables map to the plan group, the default state. The legacy unscoped rules that D-0210 §3 kept are removed, and the 20 px default `--wl-gutter` becomes the plan value.
  - Any `apps/web/src/components/**` or `app/**` leftovers.
  - A repo test listing every flat-key use in `apps/web/src/**` and `apps/web/*.{ts,mjs}`; it must find none.
  - `main-css.test.ts` legacy pins are removed deliberately, because they test CSS that no longer exists. The log lists each one.
- **Out:**
  - Feature folders (follow-ups if found).
  - `packages/design-tokens` (T-0625).

## Acceptance criteria
- **AC1 (no flat reads).** A grep test over `apps/web/src/**` and `apps/web/*.{ts,mjs}` finds no `--wl-color-(bg|bg-focus|surface|surface-2|line|line-strong|text|text-muted|accent|accent-hover|warn|on-accent|coverage-[0-4])\b` and no `--wl-font-(display|body)`. A planted use fails (log).
- **AC2 (every root has a state).** A Playwright walk finds `data-wl-state` on the `data-screen-id` element of each of these:
  - `/`, `/?view=preview`
  - `/library`, `/library/:id`, the compare route
  - `/progress`, the history route
  - `/balance`, `/balance/:area`
  - `/plan`, `/plan/edit`, `/plan/account`, `/plan/excluded`, `/plan/favorites`
  - the routine editor
  - `/welcome` and its steps, `/account`
  - `/session/setup`, a seeded `/session/<id>` at UF-09.3 and in rest
  - the List view and the summary
- **AC3 (the default is plan).** An element outside any state now resolves `--wl-bg` to `plan.bg` (the inverse of T-0589's AC3, logged).
- **AC4 (suite).** The full web e2e suite passes, and no test that pins behaviour (role, name, order, focus, offline) changes here.

Checklist (D-0197 §7):
- Inside and outside a state (AC3), and every route (AC2).
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/main.css` (listed extra), `apps/web/src/app/**`, `apps/web/src/components/**`, `apps/web/*.*` (lane)
- `tests/e2e/cobalt-state.spec.ts` (listed extra)
- `docs/tickets/T-0624-web-retire-legacy-fallback.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0624`.

## Build / accept log
