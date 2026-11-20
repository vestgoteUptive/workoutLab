---
id: D-0258
title: "Estimated 1RM: impact-review rulings (plain Epley at 1 rep, --wl-* tokens, table and chart spec, same-day sessions, card hidden with no valid point) and the owner's open-question defaults accepted"
status: decided
date: 2026-11-20
by: triage
area: product
amends: D-0254, D-0255, D-0256
builds-on: D-0257, D-0219, D-0211
---
## Context
The designer and engine impact reviews of `docs/specs/estimated-1rm.md` found gaps. The owner asked to build the feature and accepts every open-question default in the spec. D-0254 to D-0257 are now `decided`. Where this decision and those differ, this one wins.

## Decision
1. **Plain Epley at every rep count.** `e1rm = weightKg x (30 + reps) / 30`. Drop the `reps = 1` special case from D-0254 §1. Rule 15 keys 100 x 1 as 103.333, so the special case would let a record and a chart peak disagree. AC1 now reads: 100 x 1 gives 103.333. The chart peak and the rule 15 session-best key agree at every rep count.
2. **Ties compare `weightKg x (30 + reps)`** (no float division); divide only when building the point. The point is unrounded.
3. **Valid sets (engine):** weightKg finite and > 0, integer reps 1..10. Output sorted by `completedAt`, then `clientId`. Unknown, timed and bodyweight exercises give `[]`. No `Date.now()` or `new Date()` in the module.
4. **Point date** is `localDate(completedAt, tz)` of the best set, applied in the web. A session that crosses midnight takes the date of its best set.
5. **Two sessions on the same local date:** keep both points, drawn at the same x (a vertical step). The table has one row each. The delta compares the last point with the first point in the window.
6. **Tokens (D-0211 §2) replace the legacy names** in the spec and D-0256: accent is `--wl-action`, line is `--wl-line`, text-muted is `--wl-ink-muted`, the dot ring (surface) is `--wl-bg`. No new token, colour or font.
7. **Contrast line.** Gridlines are decorative (2.1:1, D-0211 §4). All text is at least 4.5:1. The chart line and dots are at least 3:1 against `--wl-bg`.
8. **Chart layout.** On the plan background, no card fill. Line 2 px, dots 6 px with a 2 px `--wl-bg` ring, 1 px gridlines. Height 160 px, viewBox width equal to the container width, `vector-effect: non-scaling-stroke`. y runs from a rounded floor to a rounded ceiling with 2 or 3 gridlines labelled "N kg". x is time-proportional with only the first and last dates, "d MMM". The latest label is `text-anchor: end` near the right edge and flips below the dot if it would collide. At 320 px reserve about 36 px left and 16 px right.
9. **Chart a11y.** The SVG is `role="img"` with the `aria-label` summary; its inner text is `aria-hidden`. The delta line is a plain paragraph, not a live region.
10. **Table.** The toggle is a `<button>` with `aria-expanded` and `aria-controls`, at least 44 px tall, labelled "Show as table" or "Hide table". The table is rendered only when expanded, with caption "Estimated 1RM per session". Columns: Date (`scope="row"`), Best set ("100 kg x 8"), Est. 1RM ("about 127 kg"). Oldest first. The chart stays visible. Focus stays on the toggle.
11. **No valid point:** the Est. 1RM card is hidden (no "-" placeholder). The "No estimate yet" line shows in place of the chart. The same applies to bodyweight and timed exercises.
12. **Rule 15 text.** T-0961 narrows rule 15's "never the e1RM number" to "never on Today", in the same ticket as rule 16 (D-0257).
13. **Tests (T-0961).** Extend the isolation test ("no core module imports `records.ts`") to `e1rm.ts`, and check that `suggest` and the other engine outputs do not import it. Seeded properties of at least 200 cases use an inline mulberry32 PRNG (no fast-check dependency). Plus: determinism (shuffle, duplicate), the 5 simulated histories plus an offline-merged one, session-best agreement with rule 15, and R15-E12 (bench 7 points, back-squat 7, dead-bug `[]`).
14. **Vendoring.** T-0961 re-vendors `supabase/functions/_shared/vendor/**` (`vendor.mjs --check` must pass). No data-model, openapi or export change.
15. **Design.** T-0962 creates `screens/UF-06.2.md` (UF-06.2 is plan state) and notes that the prototype `UF06-2-History.dc.html` (Brzycki, "+19 kg in 12 weeks") is superseded. Layout order: title, caption, offline line, stat cards (Best set, Heaviest, Sessions, Est. 1RM), delta line, chart, table toggle, explanation, session rows, how-to link. This is the first chart in the app, so the chart rules go in that file as the pattern.
16. **Open questions 1 to 9 of the spec are resolved at their stated defaults** (reps only, 1-10, bodyweight-with-load excluded, UF-06.2 only, 56 days, no change to Today, delta against the first point, kg only, hand-written SVG).

## Consequences
- The spec is amended in place. D-0254 §1 (1-rep special case) and the legacy token names in D-0256 §2 are overridden by this decision.
- Board rows T-0961 to T-0965 move from `idea` to `todo`. T-0963 also depends on T-0962 and T-0961 (already so). T-0965 depends on T-0963.
- Nothing needs a human gate.

## Revisit when
- Users report the estimate is off at 1 to 3 reps, or two same-day points read as noise.
