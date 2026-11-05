---
id: T-0681
title: "Design: UF-11.3 screen spec with the Level radiogroup; Level fact on UF-11.2; UF-11.6 level notice with one link (neutral notice gains the 'with one link' variant); UF-08.5 and UF-01.3 copy"
lane: design
screens: [UF-11.3, UF-11.2, UF-11.6, UF-08.5, UF-01.3]
decisions: [D-0230, D-0231, D-0232, D-0233, D-0211, D-0199]
deps: []
status: ready
---
<!-- Written by product-owner 2026-11-05 (groom, editable-level idea). Flow: wl-design (agent designer). About ½ day: one new screen spec, four amendments, one prototype copy edit, docs tests. Spec: docs/specs/editable-level.md. T-0682 and T-0683a build against these specs. -->

## Why
The editable-level idea (`docs/specs/editable-level.md`) adds a Level group to UF-11.3 Edit plan, a Level fact to UF-11.2 and a level notice with a "Change level" link to UF-11.6. The check (D-0233) found that UF-11.3 has no screen spec, and that `UF-11.6.md` ("no standing notice") and `components/neutral-notice.md` ("asks for nothing") don't allow the link. D-0233 §1–§3 and §7 settle the control, the name, the copy and the link variant. This ticket writes them down so the web tickets build against a spec.

## Scope
- In:
  - **New `Design-docs/docs/design/screens/UF-11.3.md`:** the whole screen in its current order: header, Goal (`.wl-option` rows), **Level**, Rhythm (steppers), Priority areas (chips), target preview, Cancel and Save. Then the Level group in detail (D-0233 §1–§2):
    - `role="radiogroup"` named "Level", with three `.wl-option` rows on native radios: Beginner, Intermediate, Advanced.
    - Each row has a label and a caption with its hint, linked by `aria-describedby`:
      - Beginner: "Under 6 months. We start with form-first variations like the goblet squat."
      - Intermediate: "6 months to 2 years. Barbell basics plus targeted accessories."
      - Advanced: "2+ years. Adds the most demanding lifts, like the barbell deadlift."
    - Under the group, one static line linked to the radiogroup by `aria-describedby`: "Level changes which exercises we suggest, not your targets."
    - None of these is a live region.
    - Also: offline ("Connect to save", Save disabled), the save-failed alert, and the `?from=favorites` return with focus on the UF-11.6 title (D-0233 §8).
    - Tokens are named as `--wl-` variables only.
  - **`screens/UF-11.2.md`:** "Your plan" lists Goal, **Level**, Rhythm, Priority areas, in that order. The Level value is "Beginner", "Intermediate" or "Advanced".
  - **`screens/UF-11.6.md`:**
    - Replace "no standing notice" with the level notice (D-0231 §2, D-0233 §7): "Your level is {Level}. Some favorites are above it." followed by the link "Change level" to `/plan/edit?from=favorites`.
    - It is shown when at least one favorite reads "Above your level". It sits under the header.
    - It reflects the favorites list, so it stays while the search query is non-empty (groom default, see T-0683a).
  - **`components/neutral-notice.md`:** a "with one link" variant (D-0233 §7):
    - the same container and text, then one inline text link at the end of the text;
    - the link is `--wl-ink`, underlined, with a 44 px tall target and a 2 px `--wl-focus` ring;
    - at most one link per notice and one such notice per screen;
    - still standing content, never a live region, never the attention colour (D-0211 §5).
  - **`screens/UF-08.5.md`:** the reason line in row 4 becomes "Above your level. Change it in Plan › Edit plan." It is text only, with no link (D-0231 §1).
  - **`prototype/UF01-3-Experience.dc.html`:**
    - the Advanced hint becomes "2+ years. Adds the most demanding lifts, like the barbell deadlift.";
    - the line "You can change this later in Plan." goes under the level hint (D-0232 §2).
  - **Docs tests:** new cases in `packages/design-tokens/test/docs.test.ts` for the ACs below.
- Out:
  - Web code (T-0682 to T-0685).
  - `tokens.json` (no new token).
  - UF-04 and UF-09 specs (unchanged, D-0231 §3).

## Acceptance criteria
Each AC is a `docs.test.ts` case titled `T-0681 ACn`.
- **AC1 (UF-11.3 spec, spec AC1)**
  - Given `screens/UF-11.3.md`, Then it contains:
    - the name "Level";
    - the three labels;
    - the three hint strings above, verbatim;
    - the line "Level changes which exercises we suggest, not your targets.";
    - the words `aria-describedby`, `radiogroup` and `.wl-option`.
  - It cites D-0230 and D-0233.
  - Its section order lists Goal before Level and Level before Rhythm.
  - It names no hex value and no Chalk & Iron token name.
  - Planted fault: delete "Level" from the order list, and the test goes red (log).
- **AC2 (UF-11.2 fact, spec AC7)** Given `UF-11.2.md`, Then its "Your plan" facts read Goal, Level, Rhythm, Priority areas, in that order.
- **AC3 (UF-11.6 notice, spec AC8)** Given `UF-11.6.md`, Then:
  - it contains "Your level is {Level}. Some favorites are above it.", "Change level" and `/plan/edit?from=favorites`;
  - it cites D-0231 and D-0233;
  - it no longer contains "no standing notice".
- **AC4 (link variant)** Given `components/neutral-notice.md`, Then:
  - it has a "with one link" section that names `--wl-ink`, `--wl-focus`, 44 px and "one link";
  - it says the notice is not a live region and never uses the attention colour;
  - the existing T-0590 neutral-notice tests stay green.
- **AC5 (UF-08.5 copy, spec AC10)** Given `UF-08.5.md`, Then row 4 reads "Above your level. Change it in Plan › Edit plan." and the file contains no `/plan/edit` link.
- **AC6 (UF-01.3 prototype, spec AC14)** Given `UF01-3-Experience.dc.html`, Then:
  - it contains "2+ years. Adds the most demanding lifts, like the barbell deadlift." and "You can change this later in Plan.";
  - it no longer contains "Higher volume and advanced progression schemes".
- **AC7 (principle 1)** The existing "no spec adds a UF-09 control" test stays green, and no `screens/UF-09.*.md` file changes in this diff.

Binary-condition check (D-0197 §7):
- Notice present and absent: AC3 covers the shown case. The spec text states when it is absent: no row is above level.
- Online and offline: both are in the UF-11.3 spec (AC1 covers the offline line in the text).

## Paths you may change
- `Design-docs/docs/design/**`, `packages/design-tokens/**` (lane; `tokens.json` stays as is)
- `docs/tickets/T-0681-editable-level-screen-specs.md` (log)

## Contract impact
none (`tokens.json` unchanged).

## Definition of done
- Tests for every AC pass.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- Commits start `T-0681 UF-11.3:`.

## Build / accept log
- 2026-11-05 designer (build). Base d2cb3ddc, tree clean at start. New `screens/UF-11.3.md` (whole screen, order Header, Goal, Level, Rhythm, Priority areas, Target preview, alert/offline, Cancel and Save; Level radiogroup of `.wl-option` rows with hint captions and the level note, all `aria-describedby`, no live region; offline, save-failed, `?from=favorites` return with focus on the UF-11.6 title). Amended `UF-11.2.md` (Level fact), `UF-11.6.md` (level notice, shown/absent, stays with a query, `h1 tabindex="-1"`), `UF-08.5.md` (row 4 text only), `components/neutral-notice.md` ("Variant: with one link"), UF-01.3 prototype copy. Caption on hover uses `--wl-ink-on-raise` (ink-muted on raise is 4.2:1). No token change.
  - AC1 → `T-0681 AC1 UF-11.3 spec…` + `T-0681 AC1 planted fault…`; AC2 → `T-0681 AC2 …`; AC3 → `T-0681 AC3 …`; AC4 → `T-0681 AC4 …` (T-0590 neutral-notice tests still green); AC5 → `T-0681 AC5 …`; AC6 → `T-0681 AC6 …`; AC7 → existing "no spec adds a UF-09 control" green + `T-0681 AC7 …`; no `screens/UF-09.*` file in the diff. All in `packages/design-tokens/test/docs.test.ts`.
  - Red on unfixed docs (HEAD copies of the five files, UF-11.3.md removed, restored with `cp`): 8/8 T-0681 cases red.
  - Planted fault: line "3. **Level**" deleted from UF-11.3.md (backup copy, restored with `cp`): AC1 red ("Level in the order list: expected -1 to be greater than 1").
  - Gate: design-tokens vitest 192/192, lint, typecheck green; `-w format:check` green. `-w check:repo` reports `ticket-not-on-base` because this worktree has no local `main` and `origin/main` (3d91948c) predates the ticket commit d2cb3ddc; see handback.
