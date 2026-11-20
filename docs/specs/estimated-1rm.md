# Estimated 1RM per exercise, with a chart over time — spec

- **Idea:** the owner, 2026-11-20, inspired by the open-source app wger: an estimated one-rep max (e1RM) per exercise, and a chart of it over time.
- **Screens:** UF-06.2 Exercise history (the home of the feature). UF-04.2 Exercise detail already links to it ("My history"); nothing changes there. User flows v2 (D-0002).
- **Decisions:** D-0254 (which sets and which formula), D-0255 (a pure engine function, rule 16), D-0256 (the UF-06.2 card, chart and table), D-0257 (scope cuts, and how this amends D-0068 and D-0219). Builds on D-0219 (rule 15 records, Epley), D-0068 (UF-06 scope), D-0079 (UF-06 build defaults), D-0208 (Cobalt), D-0015/D-0024 (history rows, warm-ups).
- **Principles:** 3, deterministic engine: the number comes from a pure function, never from an LLM, and `suggest` never reads it. 1: nothing on UF-08 or UF-09 (no number, no chart, no link while a workout runs). 2, 4 and 5: untouched. The e1RM never changes a target, a suggestion or a pre-fill (rule 14 keeps its own progression).

## Problem
The app shows what you lifted ("Best set 100 kg × 8", "Heaviest 100 kg", "Latest PR") but not whether you are getting stronger. A 100 × 8 on Monday and a 90 × 10 two weeks later look unrelated, though the second is the better effort. The estimate puts sets of different weights and reps on one scale, so one line over time answers "am I progressing on this lift?". Rule 15 already ranks records by Epley e1RM (H-36) but deliberately never shows the number. This feature shows it, labelled as an estimate, in one place.

## What it is
On UF-06.2, for a loaded exercise, one stat card "Est. 1RM about 124 kg" and a line chart of the best estimate per session over the cached history, with a table alternative. Computed on the device from the history the screen already loads. No new table, no new endpoint, no setting.

## Rules (decided in D-0254; details are for the engine ticket)
**Formula.** Epley, the same one rule 15 uses: `e1rm = weightKg × (1 + reps / 30)`. With one rep it is `weight × 1.0333` (plain Epley at every rep count; no 1-rep special case, D-0258 §1). Ties are compared on `weightKg × (30 + reps)`, dividing only when the point is built. Not Brzycki: it diverges to infinity at 37 reps and gives nearly the same numbers in the 1–10 range; one formula across rules 15 and 16 means a record and a chart peak never disagree.

**Valid rep range: 1 to 10.** Epley and every other formula drift above about 10 reps (fatigue and conditioning dominate, not strength). A set with 11 or more reps is **ignored for the estimate** (it still counts for rule 15 records and for load, unchanged). So 20 × 15 never makes the chart jump. Zero reps and null reps are ignored.

**Which sets.** `normalizeHistory` (rule 0), then only hard sets (rule 2) of exercises in the library with `kind = "exercise"`, `timed = false` and `externalLoad = true`, with `weightKg > 0` and `reps` 1–10. Warm-up sets, tombstones, warm-up moves and unknown exercises never count. Back-off sets count if they are hard sets, but a back-off is lighter by construction so it never wins the session.

**One point per session.** Per (`exerciseId`, `sessionId`), the highest e1RM among the valid sets. Its date is the local date of that set's `completedAt` (a session crossing midnight takes the date of its best set). Ties go to the earlier `completedAt`, then the smaller `clientId` (as rule 15). Two sessions on the same local date keep both points, drawn at the same x, with one table row each (D-0258 §5).

**RIR is not used in v1.** The "RIR-adjusted" form (`reps + rir`) is more accurate for a set left short of failure, but `rir` is optional (often null), and mixing adjusted and unadjusted sessions would put steps in the line that are not strength. The estimate is "from the reps you did". Open question 1.

**Excluded kinds.**
- **Timed** (plank): no weight or reps, no estimate.
- **Bodyweight** (`externalLoad: false`, or weight 0/null on every set): no load to estimate from. The card and chart are replaced by one line (see states). Weighted pull-ups logged with a weight on an `externalLoad: true` exercise work as any loaded lift; a bodyweight exercise with added weight is out of scope in v1 (open question 3).
- **Warm-up moves** (kind `warmup`): UF-06.2 already redirects them (D-0079 §4).

**Rounding.** The engine returns an unrounded number. The UI shows the nearest whole kg (`formatWeight`, existing), prefixed with the word "about". The estimate is never shown with a decimal and never as an exact figure.

## Where it shows
| Screen | What | Notes |
|---|---|---|
| UF-06.2 Exercise history | The "Est. 1RM" card as a fourth stat, then the chart, then the table toggle, above the existing session rows | The only new surface |
| UF-04.2 Exercise detail | No change | "My history" already leads to UF-06.2 |
| UF-02.1 Today "Latest PR" | No change | Still the actual set, never the e1RM number (D-0219 H-36) |
| UF-03.3 Summary | No change in v1 | The mock row 10 stays deferred (open question 4) |
| UF-08, UF-09 | Never | Principle 1 |

## The chart (UF-06.2)
- **Window:** the 56 cached local days the screen already uses, caption "Last 8 weeks" (existing). No range switch in v1.
- **Points:** one per session, at its local date (time-proportional x axis, so a 10-day gap looks like a gap). Joined by a straight line when there are two or more. A 24 px minimum hit area is not needed (points are not interactive in v1); each point is a 6 px dot with a 2 px `surface` ring.
- **Axes:** y in kg, from a rounded floor below the lowest point to a rounded ceiling above the highest, not from zero (the trend is the point). Two or three horizontal gridlines at `line`, labelled in kg. x labels: the first and last dates, `d MMM`.
- **Tokens (D-0211 §2, D-0258 §6):** line and dots `--wl-action`; dot ring `--wl-bg`; gridlines `--wl-line`; labels `--wl-ink-muted`; no new colour or font. Numbers in the stat font, labels in the label role (existing UF-06.2 classes).
- **Contrast:** gridlines are decorative (2.1:1, D-0211 §4); all text at least 4.5:1; line and dots at least 3:1 against `--wl-bg`.
- **Layout and drawing (D-0258 §8):** on the plan background, no card fill; line 2 px, 1 px gridlines; viewBox width equals the container width with `vector-effect: non-scaling-stroke`; the latest label is `text-anchor: end` near the right edge and flips below the dot on collision; at 320 px reserve about 36 px left and 16 px right. Page order: title, caption, offline line, stat cards (Best set, Heaviest, Sessions, Est. 1RM), delta line, chart, table toggle, explanation, session rows, how-to link.
- **Never colour only.** The latest point has a text label ("about 124 kg") next to it; the card says the same and a delta in words.
- **Delta line** under the card value, with two or more points: "Up 3 kg since 12 Oct", "Down 2 kg since 12 Oct", "Same as 12 Oct" (rounded kg, compared with the first point in the window). Words carry direction, not colour or an arrow alone.
- **Accessibility:** the SVG is `role="img"` with an `aria-label` summary: "Estimated one-rep max, 5 sessions, from about 118 kg on 12 Oct to about 124 kg on 18 Nov." The text inside the SVG is `aria-hidden`; the delta line is a plain paragraph, not a live region. Directly below, a `<button>` "Show as table" / "Hide table" (`aria-expanded`, `aria-controls`, at least 44 px tall) reveals a real `<table>` with caption "Estimated 1RM per session", columns Date (`scope="row"`), Best set ("100 kg × 8"), Est. 1RM ("about 127 kg"), one row per point, oldest first. The table is rendered only when expanded, and the chart stays visible. The `aria-label` summary and the existing session rows already give a screen-reader user the raw sets. Focus stays on the toggle. Reduced motion: no animation either way (the chart draws once).
- **Responsive:** full width of the page column; height 160 px; at 320 px labels stay inside the viewBox; text at 200 % zoom wraps in the card and table, the chart scales.

| State | What shows |
|---|---|
| Zero history / no sessions of this exercise | The existing "no sets" line; no card, no chart |
| Sets, none valid (all above 10 reps, or all weight 0) | Existing cards and rows; the Est. 1RM card is hidden (no placeholder); in place of the chart one line: "No estimate yet. Estimates need a weighted set of 1–10 reps." |
| Bodyweight or timed exercise | One line: "Estimated 1RM is for weighted lifts." Existing cards unchanged |
| One valid point | The card with its value; the chart shows one dot with its label and no line; line under it: "One session so far. Log it again to see a trend." No delta |
| Two or more points | Card, delta line, chart, table toggle |
| Returning after 10 days off | Nothing special: the gap is visible on the x axis, and a lower point after a break is shown as is |
| Offline | Identical; it reads the cache and queue like the rest of UF-06.2 (the existing offline status line stays) |
| Time running out | Not applicable (not reachable in a workout) |
| Partial cache (D-0079) | As existing: the chart waits with the cards; no skeleton |

## Where it is computed
On the device, in `packages/engine` as a pure, display-only function (rule 16, D-0255): `estimatedOneRepMax(history, library, exerciseId) → E1rmPoint[]` with `E1rmPoint { sessionId, clientId, completedAt, weightKg, reps, e1rm }`, oldest first. The web (`features/UF-06`) passes the same history it already loads and applies the 56-day window and the local-date placement with the engine's `localDate`. Nothing is stored: no column, no migration, no openapi change, no export change (the sets are already exported). Nothing is cached separately: a recomputation over at most 56 days of one exercise is cheap.

## Explanation text
A line under the chart, `text-muted`: "Estimated from your best weighted set of 1–10 reps each session. It's a guide, not a tested max." The word "estimated" is also in the card label ("Est. 1RM") and the chart's `aria-label`. No LLM text (principle 3); fixed copy in `lib/i18n/flows/uf-06.ts` (or the existing file for the feature).

## Out of scope for v1
Brzycki or a formula switch; RIR-adjusted estimates; a range switch (4/8/12 weeks, all time) and a history longer than the 56-day cache (needs a server read, H-37); the e1RM on UF-03.3, UF-06.1 or Today; targets and weights suggested from the e1RM ("train at 75 %"); a percentage table; per-area strength; bodyweight-plus-load exercises; lb; tapping a point; sharing or export of the chart; any change to rules 7, 14 or 15.

## Acceptance criteria (for the tickets; each needs an automated test)
1. **AC1 (formula).** Given back-squat 100 × 8 in a hard set, When the estimate is computed, Then e1rm = 126.667 (100 × (1 + 8/30)). 100 × 1 gives 100 exactly. 90 × 10 gives 120.
2. **AC2 (range).** Given a session with 60 × 15 only, Then no point for that session. Given 100 × 10 and 60 × 15, Then the point is 100 × 10 (133.333). 100 × 0 and null reps are ignored.
3. **AC3 (sets).** Given a warm-up set 130 × 1, a tombstoned 120 × 5 and a live 100 × 8 in one session, Then the point is 100 × 8. A set of an unknown exercise, a timed exercise or a bodyweight exercise (`externalLoad: false`) gives no points.
4. **AC4 (best per session).** Given S1 100 × 8 and 105 × 5 (126.667 and 122.5), Then one point for S1: 100 × 8. Given S2 with two equal sets at 10:00 and 10:05, Then the 10:00 one.
5. **AC5 (determinism).** Shuffled input order and a duplicated replayed row (same `clientId`, older `editedAt`) give the same output. Rule 15's `records` and every other engine output are unchanged.
6. **AC6 (card).** Given points 118, 121, 124 (nearest kg) on 12 Oct, 4 Nov, 18 Nov, Then UF-06.2 shows "Est. 1RM" "about 124 kg" and "Up 6 kg since 12 Oct".
7. **AC7 (one point).** Given one valid session, Then the card shows its value, the chart has one dot and no line, the line "One session so far. Log it again to see a trend." shows, and there is no delta.
8. **AC8 (empty states).** Given only 60 × 15 sets, Then "No estimate yet. Estimates need a weighted set of 1–10 reps." and no chart. Given plank or push-up (bodyweight), Then "Estimated 1RM is for weighted lifts." Given no sets, Then the existing empty line only.
9. **AC9 (chart a11y).** The SVG has `role="img"` and an `aria-label` with the count and the first and last values and dates. "Show as table" toggles `aria-expanded`, the table has a caption and one row per point, focus stays on the toggle. axe has no violations; the toggle is at least 44 px tall.
10. **AC10 (time axis).** Given sessions on 2026-10-12 and 2026-11-18, the points are placed in proportion to the days between them, not evenly.
11. **AC11 (offline and window).** Offline with a warm cache, the card and chart show and match the online values. A session 57 days old is not plotted.
12. **AC12 (scope).** The card, chart and link text appear on UF-06.2 only: not on UF-08, UF-09, UF-02.1 or UF-04.2. Today's "Latest PR" line still shows the actual set.

## Open questions, each with a recommended default (D-0254..D-0257 record the defaults)
1. **RIR-adjusted estimate?** Default: no, reps only in v1 (D-0254). Revisit when most logged sets have an `rir`.
2. **Valid rep range?** Default: 1–10 (D-0254). Alternative: 1–12 (matches rule 15's "counts above 12" spirit, but less accurate) or 1–8.
3. **Bodyweight exercises with added load (weighted pull-up logged on a bodyweight exercise)?** Default: excluded in v1 (D-0254). A later version could add bodyweight to the load; the app has no body weight setting.
4. **Show the estimate on UF-03.3 (workout summary, "Est. 1RM about 124 kg, up 3 kg") and UF-06.1?** Default: no, UF-06.2 only (D-0257).
5. **Longer than 8 weeks and a range switch?** Default: no, the cached 56 days (D-0256). Strength trends want months; that needs a server read and a new baseline decision (H-37).
6. **Show the number on Today's "Latest PR"?** Default: no, the actual set stays (D-0257, D-0219 H-36).
7. **Delta against the first point or against the previous session?** Default: against the first point in the window ("since 12 Oct"), the long view (D-0256).
8. **Pounds?** Default: no, kg only, as everywhere (D-0217 H-38).
9. **Chart library?** Default: none. A hand-written SVG in the feature, about 80 lines (no dependency, no bundle cost, deterministic output for tests, D-0256).
