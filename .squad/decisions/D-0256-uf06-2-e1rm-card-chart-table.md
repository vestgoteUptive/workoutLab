---
id: D-0256
title: "UF-06.2 shows an Est. 1RM card, a hand-written SVG line chart (one point per session, 56 cached days) and a Show-as-table toggle; five empty states; words carry direction"
status: revisit
date: 2026-11-20
by: product-owner (spec, proposed for design and web lanes)
area: product
builds-on: D-0254, D-0255, D-0079, D-0208
---
## Context
UF-06.2 Exercise history shows Best set, Heaviest, Sessions and the session rows over 56 cached days. The design docs define no chart conventions yet, so this is the first chart in the app.

## Decision
1. **Where:** UF-06.2 only, a fourth stat "Est. 1RM about N kg" (nearest kg, always "about"), then the chart, a "Show as table" toggle and a one-line explanation, above the session rows. No change to UF-04.2, UF-02.1, UF-03, UF-06.1, UF-08 or UF-09.
2. **Chart:** one point per session on a time-proportional x axis, a straight line from two points, y from a rounded floor to a rounded ceiling (not zero), 2–3 gridlines, first and last dates. Hand-written SVG in the feature, no library. Tokens only: `accent`, `line`, `text-muted`, `surface`. No new token or font.
3. **Not colour only:** the latest point is labelled in text; a delta line says "Up/Down N kg since {date}" or "Same as {date}" against the first point.
4. **Accessibility:** `role="img"` with an `aria-label` (count, first and last value and date); a "Show as table" button (`aria-expanded`, `aria-controls`, 44 px) reveals a captioned table (Date, Best set, Est. 1RM); focus stays on the toggle. No animation.
5. **States:** no sets (existing line); no valid set ("No estimate yet. Estimates need a weighted set of 1–10 reps."); bodyweight or timed ("Estimated 1RM is for weighted lifts."); one point (dot, no line, "One session so far. Log it again to see a trend."); two or more (full). Offline identical (reads the cache).
6. **Explanation line:** "Estimated from your best weighted set of 1–10 reps each session. It's a guide, not a tested max."

## Consequences
- A design ticket (T-0962) writes the screen spec first; the web ticket (T-0963) builds it.
- Defaults the owner may change: 8 weeks only, delta against the first point, no library.

## Revisit when
- Users want 3, 6 or 12 months (needs a longer baseline, H-37), or a second chart appears and a shared chart component is worth extracting.
