---
id: T-0944
title: "Screen designs for adding an exercise during a workout: the new UF-09.10 Add exercise sheet, the \"Add exercise\" button on UF-09.9 Paused, and a refresh of the stale UF-08.5 page"
lane: design
screens: [UF-09.10, UF-09.9, UF-08.5]
decisions: [D-0243, D-0246, D-0205, D-0208, D-0211, D-0231, D-0203]
deps: []
status: ready
---
## Why
The owner wants to add an exercise mid-workout (`docs/specs/add-exercise-in-session.md`). D-0243 §9 makes screen specs a prerequisite for any UI ticket, and D-0246 §18 fixes what they contain. UF-08.5.md is also stale: its line 3 says it is never reachable from UF-09 (D-0243 amends D-0205 §1), and it still names the retired Chalk & Iron fonts and `.wl-card` rows (D-0208).

## Scope
- In: new `Design-docs/docs/design/screens/UF-09.10.md`; the UF-09.9 action and status line in `UF-09.9.md`; the UF-08.5.md fixes; no new token.
- Out: any code, any change to `tokens.json`, a "Suggested" section, "Start with this", any control on UF-09.1–.8.

## Acceptance criteria
Verified by `node .github/scripts/check-all.mjs` (screen IDs, labels) and by the reviewer against each line below.
- AC1 Given the new `UF-09.10.md`, Then it specifies a D-0211 plan sheet over focus mode whose root is `.wl-uf08[data-wl-state="plan"]` (D-0246 §16), styled on existing D-0203 classes, Familjen Grotesk via `--wl-font`, hairline rows, and every target ≥ 44 px.
- AC2 Given `UF-09.10.md`, Then the lead line is "{m} min left" with `m = floor(timeLeftS / 60)`, and "No time left" when `timeLeftS < 60` (worked values: 945 s → "15 min left", 165 s → "2 min left", 45 s → "No time left").
- AC3 Given `UF-09.10.md`, Then the empty-query order is Favorites (omitted with no favorites), then "Today's areas" in the fixed area order (skipped and done items count), the search and its no-match line "No exercises match “{query}”." follow UF-08.5 (D-0205 §2), and there is no "Suggested" section and no "Start with this".
- AC4 Given `UF-09.10.md`, Then the row states, first match wins, are exactly: "Skipped in this workout"; "In this workout" (any non-skipped item, or an exercise with a set logged this workout that is no longer an item, D-0246 §2); "Excluded"; "Not available with your equipment"; "Above your level" (no Plan pointer, D-0231); "{Area} is recovering" (measured at `started_at`). There is no "Skipping {Area} today" row. Disabled rows are `aria-disabled` with the reason in `aria-describedby`.
- AC5 Given `UF-09.10.md`, Then each addable row has one "Add" button named "Add {name}", or "Add {name}, {area}" when the exercise shows under more than one area section (D-0246 §3).
- AC6 Given `UF-09.10.md`, Then the refusal copy in the sheet's `role="status"` line is exactly "{name} doesn't fit in the {m} min left.", "{name} doesn't fit. No time left." and "This workout has 8 exercises, the most it can hold.", and a failed write shows "Couldn't add {name}. Try again." in `role="alert"`.
- AC7 Given `UF-09.10.md`, Then Close, Escape and Back close only the sheet, focus returns to "Add exercise" on UF-09.9, and the workout stays paused (D-0246 §6). A table lists how the sheet differs from UF-08.5 (the six items in D-0246 §18).
- AC8 Given `UF-09.9.md`, Then the action order is Resume · Swap · Do {name} later · Add exercise · Skip to next exercise · How-to · List view · End, in a combined action table; "Add exercise" is a 56 px row with a "+" glyph `aria-hidden`, shown in every paused phase and hidden for `resumePhase: "timeCheck"`; and it is still shown at 8 items and with no time left.
- AC9 Given `UF-09.9.md` item 7, Then Paused has one `role="status"` line, empty on mount; after a successful add it reads "{name} added after {current name}." and focus is on "Add exercise"; Paused does not remount when the sheet opens, closes or the plan changes (D-0246 §7). There is no "{name} added." variant (D-0246 §4).
- AC10 Given `UF-08.5.md`, Then line 3 points to UF-09.10 (D-0243) instead of "never reachable from UF-09", no retired font or `.wl-card` row is named, and rows are hairline rows on `--wl-font`.
- AC11 Given the change, When `node .github/scripts/check-all.mjs` runs, Then it exits 0, and `git diff --stat` shows no change to `packages/design-tokens/src/tokens.json`.

Checklist (D-0197 §7): with/without favorites (AC3); time left above/below 60 s (AC2); pause from UF-09.8 vs any other pause (AC8).

## Paths you may change
`Design-docs/docs/design/screens/UF-09.10.md` (new), `Design-docs/docs/design/screens/UF-09.9.md`, `Design-docs/docs/design/screens/UF-08.5.md`

## Contract impact
none. No new token (D-0246 §18).

## Definition of done
Every AC checked · `node .github/scripts/check-all.mjs` green · `pnpm -w format:check` green · commit messages start with `T-0944` and cite UF-09.10 / UF-09.9 / UF-08.5.
