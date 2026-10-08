---
id: T-0548
title: "UF-11.2 Plan rework, part 1 — .wl-page on /plan and /plan/edit, header with purpose line, \"Your plan\" card with Edit plan, Targets tile grid (no \"From your plan\"), \"See this period in Balance\" link"
lane: web-feature:UF-11
screens: [UF-11.2, UF-11.3, UF-10.1]
decisions: [D-0203, D-0204, D-0195, D-0199, D-0081, D-0002, D-0071]
deps: [T-0546]
status: review
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §3; GitHub #37). Flow: wl-build-web (agent frontend-dev). About ½ day. Part 1 of 2 (D-0204 §1); T-0549 finishes the screen. Same folder as T-0549, T-0550 and T-0540: run serially. T-0540 rebases on this ticket (D-0204 §5). -->

## Why
GitHub #37 "the Plan page is confusing": nine identical text rows, every one ending "From your plan", text against the screen edge, browser-default headings and nothing to act on. The designer's spec `Design-docs/docs/design/screens/UF-11.2.md` regroups the screen into cards that each answer one question, with one primary action. D-0203 §3 adopts it, including the new "See this period in Balance" link (an owner-overridable default). This ticket builds blocks 1, 3, 4, 5 (the slot) and 6 of the spec; T-0549 builds blocks 2, 7 and 8 and the screen-wide states.

## Scope
- In:
  - **`.wl-page` on UF-11.2 and UF-11.3.** The `data-screen-id="UF-11.2"` and `"UF-11.3"` roots get `className="wl-page"`; the old per-section margins in `plan.css` that double the gutter go.
  - **Header (block 1).** A `<header className="wl-plan__header">` holding the `h1` "Plan", the existing "Account and sign out" link restyled as the compact secondary button (2 px stroke person icon, `aria-hidden`), and the purpose line `<p>` "Your goal, rhythm and the hard sets each area aims for every 14 days. It adapts to what you actually do." The check-in card stays the header's `nextElementSibling` (T-0471 pin).
  - **"Your plan" card (block 4).** `.wl-card` with a `.wl-label` `h2` "Your plan" and a `<dl>`: Goal → goal label; Rhythm → "{min}–{max} per week" with the caption "{2·min}–{2·max} sessions per 14 days"; Priority areas → names in the fixed area order, or "None". Then **Edit plan** → `/plan/edit` as a link with the primary button class. The old bottom "Edit plan" link is removed.
  - **Slot (block 5).** Nothing is rendered between the "Your plan" card and the Targets card yet. T-0540 adds the "Excluded exercises · n" row there and the D-0202 favorites row goes directly above it (D-0204 §5). Leave a one-line code comment marking the slot.
  - **Targets card (block 6).** `.wl-card`, `.wl-label` `h2` "Targets", the caption "Hard sets per 14 days"; a `<ul aria-label="Targets, hard sets per 14 days">` grid (`repeat(auto-fill, minmax(88px, 1fr))`, gap 8 px) of nine `<li>` tiles in the fixed area order, each: area name (caption), the number (`.wl-stat`) with a visually hidden " hard sets", and at most one caption line: "Adapted {d MMM}" (adapted), "Set by you" (manual), none (default); a priority tile has a 1 px `accent` border and "Priority" (or "Priority · Adapted 3 Oct"). Under the grid the footnote "Set from your goal, rhythm and priority areas." Then a `.wl-row` link "See this period in Balance" → `/balance` with a chevron (`aria-hidden`).
  - **Next check-in line.** It moves out of the Targets section into the existing Check-ins section unchanged (T-0549 restyles that section).
  - **Copy** in `lib/i18n/flows/uf-11.ts`: the new strings above; `targetRow` and the combined rhythm string are no longer rendered on UF-11.2. `sourceLabels.default` ("From your plan") stays in the file only if another screen uses it (UF-10.2 uses its own `uf-10.ts` copy and is unchanged).
  - **Tests updated on purpose.** Every existing test that asserts "From your plan", `targetRow` or the combined rhythm string on UF-11.2 (today: `__tests__/plan.render.test.tsx`, `__tests__/offline.test.tsx`, `tests/e2e/uf-11-plan.spec.ts`) is updated to the new copy. Each one is listed in the log as "spec change (UF-11.2.md), was … now …". None is deleted or loosened.
  - New e2e checks in `tests/e2e/uf-11-plan.spec.ts` (or a new `tests/e2e/uf-11-plan-layout.spec.ts`).
- Out:
  - The check-in card restyle, the Check-ins and Routines cards, the primary/secondary switch while a proposal is pending, the loading and cold-cache layouts (T-0549).
  - UF-11.4 (T-0550). The Excluded and Favorite rows (T-0540, D-0202).
  - UF-10.2's "From your plan" source line (`uf-10.ts`): a different screen, unchanged.
  - Any route change (`/balance` already exists).

### Edge cases that are in scope
- **No priority areas:** `dd` "None"; no tile has the Priority treatment; footnote unchanged (AC4).
- **Every target default:** no tile has a source line (AC3).
- **Offline:** the card renders from the cache as today, plus the existing `OfflineStatus` line; the Balance link and Edit plan still navigate (AC8).
- **Zero history / returning after 10 days off:** nothing special; targets come from the plan.
- **Narrow screens:** 320 px → two tile columns, the header link wraps under the title, no horizontal scroll (AC6).

## Acceptance criteria
Fixtures: F-profile (goal "Build muscle", rhythm 3–5, priority areas [chest, shoulders]), tz Europe/Stockholm, targets chest 29 manual, back 20 default, shoulders 16 adapted 2026-10-03, the other six default.

- **AC1 (header, spec AC1)** Given UF-11.2 ready, Then a `<header>` contains the `h1` "Plan", the link "Account and sign out" (`href="/plan/account"`) and the purpose line text exactly. Given a pending proposal, Then the header's `nextElementSibling` is the check-in card (the T-0471 assertion still passes).
- **AC2 ("Your plan" card)** Given the fixtures, Then the card's `h2` is "Your plan" and its `dl` reads, in order: Goal "Build muscle"; Rhythm "3–5 per week" and "6–10 sessions per 14 days"; Priority areas "Chest, Shoulders". Given no priority areas, Then the Priority areas `dd` is "None". The card contains the "Edit plan" link to `/plan/edit` with the primary button class, and no other "Edit plan" link exists on the screen.
- **AC3 (sources, spec AC3)** Given the fixtures, Then the text "From your plan" appears nowhere in the UF-11.2 root; the shoulders tile shows "Adapted 3 Oct"; the chest tile shows "Set by you"; the back tile has no caption line beyond its name and number. Given every target `default`, Then no tile has a source caption and the footnote "Set from your goal, rhythm and priority areas." appears exactly once.
- **AC4 (tiles, spec AC4)** Given the fixtures, Then the list labelled "Targets, hard sets per 14 days" has exactly nine `li`s in the order chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves; each `li`'s whitespace-normalised text content matches `/^{Area} \d+ hard sets/` (for example "Chest 29 hard sets"; the markup puts a space between the name, the number and the hidden suffix so a screen reader doesn't read "Chest29"); the chest tile contains "Priority" and the shoulders tile contains "Priority · Adapted 3 Oct"; no other tile contains "Priority".
- **AC5 (Balance link)** Given UF-11.2 ready, Then the Targets card's last element is a link named "See this period in Balance" with `href="/balance"`. In Playwright, tapping it lands on `[data-screen-id="UF-10.1"]`.
- **AC6 (layout, spec AC7 + visual-foundation, Playwright)** Given `/plan` with the fixtures:
  - at 390 × 844 (T-1, G-2, T-2): the `h1` computed font family starts with `"Big Shoulders Display"`, weight 800, uppercase, 32–40 px; the screen root's `padding-left` and `padding-right` are `20px`; each card label `h2` ("Your plan", "Targets") is 12 px, uppercase, colour equal to the `text-muted` token; body text is 16 px;
  - at 360 × 740 (G-1): the `h1` left edge ≥ 16 px, every visible text and control right edge ≤ 344 px, `scrollWidth` ≤ 360; the first three tiles share one `top`;
  - at 320 × 640 (G-4): no horizontal scroll, the tiles form 2 columns, and the `h1` has `scrollWidth` ≤ `clientWidth`;
  - at 1024 × 768 (G-3): the root is ≤ 640 px wide and its left and right space differ by ≤ 1 px;
  - with `html { font-size: 32px }` injected at 390 px (T-3): the `h1` and body font sizes are double their default values and there is no horizontal scroll.
- **AC7 (/plan/edit gutter)** Given `/plan/edit` at 360 × 740, Then G-1 holds and the root's computed `padding-left`/`padding-right` are `20px`. Every existing `edit-plan.test.tsx` and UF-11.3 e2e test passes unchanged.
- **AC8 (offline)** Given `navigator.onLine` false and a warm cache, Then AC2–AC5 still render from the cache, the offline line shows, and the Edit plan and Balance links are enabled links (not disabled).
- **AC9 (updated tests, spec AC9)** The log lists every test edited for copy (file, test name, old → new). `git diff main` on those files changes only the asserted strings and selectors, never removes an `expect`.

Checklist (D-0197 §7): priority areas empty/non-empty (AC2, AC4); every-default vs mixed sources (AC3); online/offline (AC8 vs AC1–AC6).

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `tests/e2e/uf-11-plan.spec.ts` (copy updates and the new layout checks)
- `tests/e2e/uf-11-plan-layout.spec.ts` (new file, if the layout checks go in their own spec)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · the UF-11 e2e specs green (`uf-11-plan.spec.ts`, `uf-11-account.spec.ts`, plus any new one); the full suite only if the diff leaves the UF-11 folder · contracts unchanged · commits start with `T-0548:` and cite UF-11.2.

## Build / accept log
Archived in `docs/tickets/log/T-0548.md` (D-0157).
