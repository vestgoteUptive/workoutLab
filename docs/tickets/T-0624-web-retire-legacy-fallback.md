---
id: T-0624
title: "Web: retire the Chalk & Iron fallback once every route root carries a state: :root generic variables point at plan, the unscoped legacy .wl-* rules go, and no file in apps/web reads a flat legacy colour key or --wl-font-display/body"
lane: web-shell
screens: []
decisions: [D-0208, D-0210, D-0211, D-0213]
deps: [T-0595, T-0596, T-0597, T-0598, T-0599, T-0600, T-0601, T-0602, T-0603, T-0604, T-0605, T-0606, T-0607, T-0608, T-0609, T-0610, T-0611, T-0612, T-0613, T-0615, T-0616]
status: doing
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
- `apps/web/src/features/UF-09/uf-09.css` (orchestrator grant 2026-10-12: its 31 remaining flat reads, mapped to the generic `--wl-*` variables, no layout change) and any test pinning those exact flat names
- Orchestrator grant 2026-10-12 (no-state assertions now expect plan, D-0210 end state; colour/font/gutter assertions only, never role/name/order/focus/offline): `tests/e2e/body-figure-v2.spec.ts`, `tests/e2e/body-map-figure.spec.ts`, `tests/e2e/cobalt-controls.spec.ts`, `tests/e2e/cobalt-surfaces.spec.ts`, `tests/e2e/fonts.spec.ts`, `tests/e2e/uf-04-figure.spec.ts`, `tests/e2e/visual-foundation.spec.ts`, `apps/web/src/features/UF-06/BalanceCard.tsx`, `apps/web/src/features/UF-06/__tests__/screens.test.tsx`
- `docs/tickets/T-0624-web-retire-legacy-fallback.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · full web e2e suite green · commit messages start with `T-0624`.

## Build / accept log

### T-0624 build (frontend-dev, base a646ef4, tree clean)
- Mapped every flat read to the generic variables (bg/surface/surface-2/text/text-muted/line/line-strong/accent/on-accent/warn/fonts -> --wl-bg/raise/ink/ink-muted/line/action/on-action/attention/font) in main.css, checkbox.css, excluded-areas-notice.css, offline-status.css, RouteBoundary.tsx, UF-09/uf-09.css. `:root` now shares the plan block (`:root, [data-wl-state="plan"]`); the 20 px default gutter is the plan value (the <360 px override stays).
- Unscoped legacy rules (.wl-card, buttons, .wl-row, .wl-input, h1/h2, .wl-label ...) are NOT deleted: grep shows each class is used by 8-32 non-test files, and the state-scoped rules do not restate every property. They now read the generic variables. Deviation from "legacy rules go", deliberate.
- UF-09.css `accent-hover` (saving primary) has no generic equivalent; it now reads --wl-action (no visible hover tint).
- AC1: `src/app/__tests__/no-flat-reads.test.ts` (also catches a dynamic `--wl-color-coverage-${`). Planted `var(--wl-color-text-muted)` in offline-status.css: red, restored from backup. Allow-list: features/UF-06/BalanceCard.tsx:49 (feature lane, follow-up).
- AC2: cobalt-state.spec.ts "AC6 every route root carries data-wl-state" (welcome steps, /account, all tab/plan/library/balance/progress routes, routine editor, setup, UF-09.3, rest, List view, summary). Planted: removed data-wl-state from UF-03 summary root: red; restored.
- AC3: inverted T-0589 AC3 (no state now resolves to plan.bg/ink, body bg, plan font). Planted `:root-x`: red, restored. AC4 gutter pin "no state 20" -> 28 at 390 px (340 px still 20).
- Legacy pins changed deliberately (main-css.test.ts): h1/h2/body font names; .wl-input border; .wl-button--primary colours + focus outline; T-0589 AC1 ":root keeps Chalk & Iron" replaced by ":root is plan"; T-0592 AC8 "legacy rules read no generic variable" narrowed to radius/space/selected/focus; T-0593 .wl-input legacy border name; account-deleted base surface. Also Checkbox.test, checkbox-cobalt.test, ExcludedAreasNotice tests, OfflineStatus.test, build.test.ts (body reads --wl-bg/--wl-ink): colour names only.
- Found: UF-09/seams.tsx:131 seam loading placeholder carries data-screen-id UF-03.1/UF-05.1 with no data-wl-state (transient). Follow-up for UF-09 lane.

### T-0624 rework (grants for specs and UF-06; main merged)
- UF-06/BalanceCard.tsx:49 now `var(--wl-coverage-N)`; screens.test.tsx pins (lines 207, 257, 261, 335) updated; allow-list in no-flat-reads.test.ts emptied.
- 16 e2e assertions moved to the plan look (colour, font, gutter only; no role/name/order/focus/offline pin touched): body-figure-v2 351 and 368 (--wl-color-bg/text -> plan-bg/plan-ink); body-map-figure 363 (bg/text/warn -> plan-bg/plan-ink/plan-attention); cobalt-controls 69 (primary bg flat.accent -> plan.action, font DM Sans -> Familjen Grotesk), 85 (secondary bg flat surface-2 -> plan.raise, font -> Familjen Grotesk), 337 (no-state card fill flat.surface -> plan.raise); cobalt-surfaces 162 (checkbox border/fill -> plan.ink-muted/plan.action), 442 (notice bg/colour -> plan.raise/plan.ink-muted), 467 (offline text -> plan.ink-muted), 481 (account-deleted bg/button -> plan.raise/plan.action); fonts 104 (no-state h1 -> Familjen Grotesk); uf-04-figure 128 (no-state host fill -> plan-ink); visual-foundation 122 x3 (body font -> Familjen Grotesk) and 129 (no-state h1 family and body -> Familjen Grotesk).
