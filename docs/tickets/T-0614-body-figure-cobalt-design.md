---
id: T-0614
title: "Design check and spec for the body figure and C-01 on cobalt: silhouette plan.raise with an ink-muted stroke, the plan coverage ramp, primary white and secondary white hatch, attention in plan.attention with the 1 px bg gap; cobalt preview, check-figure, and the legend token fields"
lane: design
screens: [UF-02.1, UF-10.1, UF-04.2]
decisions: [D-0208, D-0210, D-0211, D-0207, D-0013, D-0019]
deps: [T-0590]
status: done
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-design (agent designer). About ½ day. The owner chose (H-31, 2026-10-08) to ship the tokens first and the figure in its own ticket with a design check: the designer makes the recolour and a preview, and the reviewer checks it against the README "Assets" rules. There are no exercise illustrations to recolour (D-0192). -->
## Why
D-0207's figure and C-01 are drawn in Chalk & Iron tokens (`surface-2`, lime, the `warn` halo). The handoff gives the cobalt mapping in README "Assets" but didn't mock it, so it needs a design check.

## Scope
- **In:**
  - **The `design-system.md` "Body figure" table**, rewritten on the generic variables:
    - silhouette: a `--wl-raise` fill with a 1.5 px `--wl-ink-muted` stroke (4.2:1 non-text on raise);
    - C-01 regions: `--wl-coverage-0..4`;
    - UF-04.2 primary: `--wl-ink`; secondary: an `--wl-ink` stripe hatch on `--wl-raise`;
    - neutral parts: `--wl-raise` with a 0.75 px `--wl-line` stroke;
    - attention: a 1 px region border, then a 1 px `--wl-bg` gap, then 2 px `--wl-attention`;
    - the highlight ring: 2 px `--wl-focus`.

    Forced colours are unchanged.
  - A contrast table: `ink-muted` on raise 4.2, white on raise 6.2, attention on `plan.bg` 5.0, and attention on white 1.7 (which is why the gap exists).
  - **`components/c-01-body-map.md`:** the legend and outline wording on the plan tokens. Numeric labels stay; `requiresLabel` now comes from `meta.planCoverage` (T-0587).
  - **`assets/body-figure/preview.html`:** a cobalt section (C-01 at steps 0–4, one area with attention, and UF-04.2 primary and secondary). The legacy section stays until T-0625, and `check-figure.mjs` accepts both.
  - **`packages/design-tokens/src/index.ts`:** `coverageLegend[n].token` → `"plan-coverage-N"` and `attentionLegend.token` → `"plan-attention"`, as typed literals with the legend copy unchanged. `test/tokens.test.ts` (legend AC) and `test/body-figure.test.ts` are updated deliberately.
- **Out:**
  - Web CSS (T-0615).
  - Geometry, regions and copy.

## Acceptance criteria
- **AC1 (docs test).** **Given** design-system.md **then** the body-figure table names only `--wl-` generic variables and no Chalk & Iron name (`surface-2`, `accent`, `warn`, `text-muted`). A planted `accent` row fails (log).
- **AC2 (legend data).** `coverageLegend` has 5 entries with tokens `plan-coverage-0..4` and the D-0019 labels unchanged. `attentionLegend` is `{ token: "plan-attention", style: "outline", widthPx: 2, label: "Needs attention", srLabel: "Needs attention" }`.
- **AC3 (contrast).** A test asserts:
  - `plan.ink-muted` on `plan.raise` ≥ 3 (non-text);
  - `plan.ink` on `plan.raise` ≥ 3;
  - `plan.attention` on `plan.bg` ≥ 3;
  - `plan.attention` on `#FFFFFF` < 3. This is the reason for the gap; the test keeps it failing as documented.
- **AC4 (asset unchanged).** `body-figure.svg` is byte-identical to main. `check-figure` passes on the asset and on both preview sections. `wl-check-colours` finds no raw colour.
- **AC5 (design check prepared).**
  - The log links the preview path and a 390 px screenshot of the cobalt section.
  - The reviewer records a verdict against README "Assets": silhouette `plan.raise` with an `ink-muted` stroke; the coverage ramp from `plan.raise` to white; primary areas white, secondary a white hatch; the attention halo in `plan.attention`.

Checklist (D-0197 §7):
- Attention on and off, primary and secondary, and steps 0 and 4 are all in the preview and the tests.
- No migration fixture: not applicable.

## Paths you may change
- `Design-docs/docs/design/**`, `packages/design-tokens/**` (lane)
- `docs/tickets/T-0614-body-figure-cobalt-design.md` (log only)

## Contract impact
none to `tokens.json`. The typed legend fields in `src/index.ts` change, as named by D-0211 and D-0213. T-0615 consumes them and depends on this ticket.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · check-all green · commit messages start with `T-0614`.

## Build / accept log
- 2026-10-09 designer (build). Start: clean, HEAD 2df82a8.
  - Changed: `design-system.md` § Body figure on the generic `--wl-*` variables, with the plan contrast table; `c-01-body-map.md` legend, outline, labels and states on the plan tokens and `meta.planCoverage`; `preview.html` has a Cobalt section (`data-preview="cobalt"`, `data-wl-state="plan"`, `#wl-fig-css-cobalt`) ahead of the legacy one; `check-figure.mjs --preview` checks both; `serve-preview.mjs` opens it. Defaults: D-0215 (draft for the orchestrator to file; `.squad/` is outside this lane).
  - AC1 → `body-figure-cobalt.test.ts` "AC1" (table cells are `--wl-` only; planted `accent` row throws).
  - AC2 → **not done: TR-0048 (draft for the orchestrator to file).** Repointing `coverageLegend`/`attentionLegend.token` breaks `apps/web` typecheck (4 TS errors in BodyMap.tsx, UF-10/format.ts; tried on a backup, restored) and the web tests that pin `var(--wl-color-coverage-N)`/`warn`. `index.ts` and `tokens.test.ts` are unchanged.
  - AC3 → `body-figure-cobalt.test.ts` "AC3" (ink-muted/raise 4.2, ink/raise 6.2, attention/bg 5.0, attention/raise 3.6, ink/bg 8.6; attention/white 1.7 < 3).
  - AC4 → `body-figure.svg` untouched; `body-figure.test.ts` (asset + wl-check-colours) and `body-figure-cobalt.test.ts` "AC4" (both sections pass; 10 planted preview faults fail).
  - AC5 → preview `Design-docs/docs/design/assets/body-figure/preview.html` (open with `node Design-docs/docs/design/assets/body-figure/serve-preview.mjs`); 390 px screenshot of the Cobalt section: scratchpad `t0614-figure.png` (orchestrator session). Reviewer verdict pending.
  - Red runs: AC1 tests on the HEAD `design-system.md`: 4 failed. `check-figure --preview` on the HEAD preview: 5 problems, exit 1. docs.test AC16 on the HEAD `c-01-body-map.md` with the moved pin: 2 failed. Pin moved: AC16 `` `warn` `` → `` `--wl-attention` `` + `1 px `--wl-bg` gap` (old value D-0003, new D-0211 §5).
  - Seen in the preview: the highlight ring around an inner area (core) is hidden under the silhouette, because the ring draws first in its view (the same order as `BodyFigure`). Follow-up for T-0615.

- 2026-10-09 orchestrator: AC2 moved to T-0615 (TR-0048 resolved, option 1). D-0215 filed. The preview screenshot was checked by eye: coverage steps, halo, hatch and greyscale all read correctly. The owner check (H-31) is still open and non-blocking. Accepted without AC2.
