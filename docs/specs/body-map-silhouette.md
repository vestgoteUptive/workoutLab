# Body figure: C-01 silhouette and the UF-04.2 exercise figure — spec

- **Idea:** the owner, GitHub #48 "overview of the muscle groups and their parts" (an ExerciseDB example with front and back figures, primary and secondary muscles shaded, and a Male/Female toggle).
- **Screens:** UF-04.2 Exercise detail (new exercise figure). C-01 Body map on UF-02.1 (compact) and UF-10.1 (full), where the silhouette replaces the D-0060 §1 tile layout. User flows v2 (D-0002). **Not** UF-08.*, UF-09.* or UF-03.*.
- **Status:** decided (D-0207). It reactivates parked **T-0315**.
- **Research:** `docs/design-research/body-map-silhouette.md` (source options, licences checked 2026-10-08).
- **Design deltas:** `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md (§ UF-04.2 Body figure)`, `Design-docs/docs/design/components/c-01-body-map.md (§ Silhouette layout)`.
- **Builds on:** D-0005 (designer-made line figures, no third-party images), D-0192 (no ExerciseDB media), D-0003 / D-0013 / D-0019 (coverage ramp, steps, legend copy), D-0060 (C-01 build defaults), D-0079 §2 (primary/secondary area lists on UF-04.2), NFR-A11Y-1/2/3/6.
- **Principles:** 3, deterministic engine: the figure only *draws* `coverageStep`, `needsAttention` and the exercise's area weights. It computes nothing. 1, one task on screen: the figure never appears on UF-09 (and not on UF-08 in v1). 5, onboarding: nothing added.

## 1. What it is

One original, token-styled SVG **body figure** (front view and back view) with exactly 9 named regions, one per area. Two components draw it, from the same asset:

| Where | What the figure shows | Interactive? |
|---|---|---|
| **UF-04.2** Exercise detail | This exercise's areas: weight 1.0 = **primary** (solid fill), weight 0.5 = **secondary** (hatched fill), the rest untouched. | No. It's a picture next to the existing text lists. |
| **C-01** on UF-02.1 / UF-10.1 | Each area's 14-day coverage: fill `coverage-<step>`, plus the 2 px `warn` outline when `needsAttention`. | `full`: yes, through the label buttons (regions forward pointer taps). `compact`: one link, as today. |

## 2. Source: an original SVG (option a)

The full comparison is in the research note. In short:
- **(a) Original figure: recommended.** It fits D-0005 as written ("simple line figures that the designer makes", "no third-party images v1"). It has no licence notice and no provenance risk, and it's drawn to our 9 areas and tokens from the start.
- **(b) MIT `react-native-body-highlighter` / `react-body-highlighter`: not now.** The licence on the code is clear MIT, but whether it covers the drawing is unconfirmed. Public issue #102 asks exactly that and has no answer from the maintainer since 2026-08-16. Wikimedia `Muscular_system.svg` is CC BY-SA 3.0, which is share-alike on our main visual. Every (b) path also needs a slug-to-area merge table and a restyle.
- **(c) Keep the tiles: no,** but the tiles survive as the accessible label layer of C-01 (§6).

## 3. The figure asset

### 3.1 Views and regions

Two views, always shown together, front on the left and back on the right. Each region is one or more `<path>` elements with `data-area="<area id>"`. Left and right sides are separate paths with the same `data-area`.

| Area | Front view | Back view | Anatomy drawn (decoration only, §5) |
|---|---|---|---|
| chest | yes | — | pectorals |
| back | — | yes | trapezius (upper, mid), lats, rhomboids, spinal erectors |
| shoulders | yes | yes | front and side delts (front view), rear delts (back view) |
| arms | yes | yes | biceps and forearm flexors (front), triceps and forearm extensors (back) |
| core | yes | — | rectus abdominis, obliques |
| glutes | — | yes | gluteus maximus and medius |
| quads | yes | — | quadriceps |
| hamstrings | — | yes | hamstrings |
| calves | — | yes | gastrocnemius, soleus |

**Neutral body (no `data-area`, never filled by data):** head, neck, hands, hip flexors and the inner thigh (adductors), knees, shins (tibialis), ankles and feet. These are drawn in the base body style so the figure reads as a whole person.

The mapping follows how the library weights exercises (for example `rear-delt-fly-dumbbell` is `shoulders: 1`, so rear delts sit in shoulders). Trapezius goes in back, and the lower back (erectors) goes in back, not core. Content (`data/exercises/**`) must keep weighting by these meanings. If a row seems to disagree, it's a content question, not a drawing change.

### 3.2 Style ("chalk line figure")

- Flat fills, no gradients, no shading, no photoreal detail. The proportions are androgynous and athletic (§4). About 1 : 2.4 width to height per view.
- **Body outline:** 1.5 px `text-muted` (6.8:1 on `surface`, 7.5:1 on `bg`).
- **Region borders:** 1 px `text-muted`, so every region's shape is perceivable at ≥ 3:1 whatever its fill (`coverage-0` is only 1.2:1 against `surface`).
- **Decorative seams** inside regions (sub-muscles, §5): 0.75 px `line-strong` on unfilled regions and `on-accent` on `accent` / `coverage-3` / `coverage-4` fills. They're decoration and carry no information, so the 3:1 rule doesn't apply to them.
- **Base body fill (neutral parts and untouched regions):** `surface-2`.
- **Colour by class only.** The asset has **no `fill` or `stroke` colour attributes and no hex values.** Regions get classes such as `wl-fig__region`, and colours come from `var(--wl-color-…)` in CSS. Hatching is an SVG `<pattern>` whose stripes are styled by class. This keeps `workoutlab/no-raw-colour` and `wl-check-colours` green.
- **viewBox** per view: `0 0 120 290`. Both views share one `<svg>` with `viewBox="0 0 256 290"` (8 units of gap between the views and 4 units of margin). Strokes use `vector-effect: non-scaling-stroke` so line widths stay in CSS px at every size.
- **Sizes:** UF-04.2 is 200 px tall. C-01 `full` is 240 px tall, and `compact` is 140 px tall. Width follows the viewBox.

### 3.3 Where the asset lives

- The designer's source of truth is `Design-docs/docs/design/assets/body-figure/body-figure.svg` (design lane), with a preview page and the region table above.
- web-shell turns it into one shared component, `apps/web/src/components/body-figure/` (`BodyFigure`). Its props are `{ regions: Partial<Record<Area, RegionStyle>>, highlighted?: Area, onRegionPointer?: (area) => void, size }`, where `RegionStyle` is `{ fill: "none" | "primary" | "secondary" | { coverageStep: 0|1|2|3|4 }, attention?: boolean }`. It's purely presentational, and the whole `<svg>` is `aria-hidden="true"` (§7).
- `BodyFigure` joins `components/body-map` in the D-0060 §8 `no-restricted-imports` ban for `src/features/UF-03|UF-08|UF-09/**`.

## 4. Male/Female toggle: not in v1

Recommendation: **one neutral, androgynous athletic figure, with no toggle.**
- The data doesn't differ. Areas, weights, targets and the engine are the same for everyone. A toggle would change the picture but none of the meaning, and it would be one more control on UF-04.2 and C-01.
- There's nothing to read it from. The profile has no sex or gender field (data model), and adding one means personal data under NFR-PRIV for a cosmetic choice. A device-only setting would still be a new setting with a new UI.
- A two-option toggle is also a binary choice that some users won't fit. One stylised figure sidesteps that.
- It's half the art: 2 views instead of 4, and one set of region checks.
- **Revisit when** a user-facing reason appears (for example feedback that the figure doesn't read as "me"). If so, add a second figure as a **display preference in UF-11.4**, never in onboarding (principle 5).

## 5. "Their parts": sub-muscles

Our data stops at 9 areas. **v1 draws sub-muscles as decorative seam lines only. They're never named, never filled separately and never focusable.**
- Seams: the pectoral split (upper and lower chest), the three deltoid heads, the biceps and triceps outlines, the abdominal grid, the quadriceps heads, and the gastrocnemius heads. They make the figure read as anatomy without claiming per-muscle tracking.
- **No sub-muscle names in the UI in v1,** neither as labels nor as text. Naming "upper chest" next to a figure that fills the whole chest would suggest data we don't have. The text equivalent stays the 9 area names.
- **Later (not v1):** if the owner wants named parts ("Muscles worked: quadriceps, adductors, spinal erectors", as in the old `UF04-2-Detail` prototype), that's a *content* field. An optional per-exercise `muscles: string[]` of display names, shown as text on UF-04.2 under the area lists. It needs a data-model decision (a contract) and curation in `data/exercises/**`. It stays text only and never drives fills. That's follow-up F-4 below.

## 6. Where it appears

### 6.1 UF-04.2 Exercise detail (the owner's example)

The full delta is in `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md (§ UF-04.2 Body figure)`. In short: a figure card under the tagline, with primary areas solid `accent`, secondary areas `accent` hatched over `surface-2`, and all other areas `surface-2`. The existing "Primary areas" / "Secondary areas" lists (D-0079 §2) stay and become the legend, each with a visible label and a swatch ("Primary" solid, "Secondary" hatched). The figure isn't interactive.

### 6.2 C-01 on UF-02.1 and UF-10.1

The full delta is in `Design-docs/docs/design/components/c-01-body-map.md (§ Silhouette layout)`. In short: the figure sits on top, filled by `coverageStep`, with the attention outline. Under it, the D-0060 tiles stay as a compact **label grid**: 3 columns in the D-0060 order, each with a swatch, the area name and `load / target`. In `full` the labels are the 9 buttons (≥ 44 × 44), and the regions forward pointer taps to them. The legend is unchanged. `compact` stays one link. D-0060 §2–§8 still apply.

### 6.3 UF-08.2 Suggested workout: not in v1

The C-01 spec already keeps the body map off UF-08 and UF-09, and a lint rule enforces that (D-0060 §8). UF-08.2 is already dense (time-budget bar, items, notices, Removed line). The area names per item already say what the workout trains. **Default: no figure on UF-08.2 in v1.** It could come back later as a *small, static* "this workout trains" figure (the UF-04.2 primary/secondary style, combined over the plan). That would need its own decision lifting the UF-08 ban for `BodyFigure` only. It's open question Q4.

## 7. Accessibility (WCAG 2.2 AA)

- **Text equivalent everywhere.** The `<svg>` is `aria-hidden="true"` on both screens. The meaning lives in text right next to it: on UF-04.2 the Primary and Secondary area lists, and on C-01 the 9 labels (name plus `load / target`) with the D-0060 §4 accessible names. A screen reader user loses nothing by skipping the figure.
- **Pattern as well as colour.** UF-04.2: primary is solid, secondary is diagonal hatching, untouched is plain. That's distinguishable in greyscale and for every colour-vision type. C-01: the numbers in the labels are the non-colour signal for coverage (NFR-A11Y-3). The attention outline is 2 px against a 1 px region border, so it differs in *thickness* as well as hue, and the legend explains it.
- **Contrast** (computed from the tokens, on the `surface` card):

| Pair | Ratio | Needs |
|---|---|---|
| region border `text-muted` on `surface` / `surface-2` | 6.8 / 5.8 | 3.0 |
| primary `accent` on `surface` / against `surface-2` | 13.5 / 11.5 | 3.0 |
| secondary hatch stripe `accent` against its `surface-2` ground | 11.5 | 3.0 |
| attention `warn` on `surface` | 7.3 | 3.0 |
| attention `warn` against a `coverage-4` fill | **1.9** | 3.0 |

The last row is why the attention outline is drawn **outside** the region's 1 px `text-muted` border, with a 1 px `surface` gap (the same halo approach as the focus ring). So `warn` always meets `surface` or the border, never the lime fill directly.
- **Tap targets.** Small regions (calves about 10 × 30 px at 240 px, arms, the shoulders on the back view) are **never the only target**. The 44 × 44 label buttons are the controls, and region taps are a pointer shortcut that calls the same handler. That meets NFR-A11Y-2 and WCAG 2.5.8 (equivalent control).
- **Linking label and region.** Hover or focus on a label draws the 2 px `accent` focus ring (offset 2 px) around that area's regions as well. Hover on a region highlights its label the same way. Both are pointer and keyboard conveniences, not required to understand the figure.
- **Keyboard:** 9 tab stops in `full` (the labels, in DOM order = visual order, D-0060 grid order), and none inside the figure. `compact` has one link. Enter and Space work as in D-0060 §5.
- **Forced colours** (`@media (forced-colors: active)`): fills fall back to system colours. Primary is `CanvasText`, secondary hatch stripes are `CanvasText` on `Canvas`, untouched is `Canvas`, and borders are `CanvasText`. Attention uses `Highlight` at 3 px. The labels still carry everything.
- **Reduced motion:** the figure has no animation. The C-01 loading pulse (D-0060 §6) applies to the regions under the same media query.
- **Text size:** labels use rem and wrap. At 200 % zoom the label grid goes to 2 columns. The figure keeps its size and is never the place where text lives.

## 8. Acceptance criteria

Each AC names its test. `BodyFigure` tests sit in web-shell, the UF-04.2 tests in web-feature:UF-04, and C-01 in web-shell.

| # | Criterion | Test |
|---|---|---|
| AC-1 | The asset has exactly the 9 area ids as `data-area` values (each at least once), the neutral parts have none, and the views match §3.1 (chest only on front, back only on back, and so on). | Unit: parse the component's SVG, compare `data-area` sets per view with the §3.1 table and `AREAS`. |
| AC-2 | No colour literal in the asset or component: no hex, `rgb(`, `hsl(` or named colour in `fill`/`stroke`. Colours come only from `var(--wl-color-…)` (and system colours under forced colours). | The existing `workoutlab/no-raw-colour` lint, plus a unit check on the SVG string. |
| AC-3 | The `<svg>` is `aria-hidden="true"` and contains no focusable element. | Unit. |
| AC-4 | UF-04.2: weight-1.0 areas render class `primary` (solid), weight-0.5 areas `secondary` (hatch pattern), others `none`. It's driven by `exercise.areas` only. | Unit over 3 library rows (one with no secondary). |
| AC-5 | UF-04.2: the Primary/Secondary lists show a visible label and swatch. Their accessible names stay "Primary areas" / "Secondary areas", and the secondary list is absent when empty. | Unit plus the existing UF-04 tests unchanged. |
| AC-6 | C-01: each region's fill is `coverage-<coverageStep>`, straight from the engine output. An out-of-range or missing step gives the neutral `surface-2` (D-0060 §2). `needsAttention` draws the outside outline (§7). | Unit (extends the D-0060 AC tests). |
| AC-7 | C-01 `full`: 9 buttons with the D-0060 §4 names, each ≥ 44 × 44 CSS px. A pointer tap on any region of an area calls `onSelectArea(area)` and navigates once. | Unit plus a Playwright check (real tap on a calf region and on the calves label). |
| AC-8 | C-01 `compact`: one link named "Body map, last 14 days. Open all areas", with nothing focusable inside. | Unit (existing). |
| AC-9 | Every area shows its `load / target` text in C-01 in both variants (NFR-A11Y-3). | Unit (existing, kept). |
| AC-10 | axe: 0 serious or critical issues on `/library/:id` and `/balance`, and on `/` (Today). | Playwright axe (existing route checks). |
| AC-11 | Layout holds at 320 px and 390 px wide and at 200 % text zoom. Nothing overlaps or is clipped, and the label grid wraps. | Playwright screenshots at 320/390, plus a bounding-box overlap assertion. |
| AC-12 | `BodyFigure` and `BodyMap` can't be imported from `features/UF-03|UF-08|UF-09`. | Lint test (`ESLint.lintText`, extends D-0060 §8). |
| AC-13 | Forced-colours mode keeps the regions visible. | Playwright with `forcedColors: "active"`: region border computed colour ≠ transparent. |

## 9. Decisions needed

1. **New: "Body figure for C-01 and UF-04.2 (GitHub #48)"** (area: design). It records:
   - option (a), an original SVG under `LicenseRef-workoutLab` (with no D-0005 change);
   - **supersedes D-0060 §1** (layout) only, and keeps D-0060 §2–§8;
   - adds the UF-04.2 exercise figure (primary solid / secondary hatched);
   - no Male/Female toggle in v1 (§4);
   - sub-muscles as decoration only, not named (§5);
   - no figure on UF-08.2 in v1 (§6.3);
   - extends the D-0060 §8 import ban to `BodyFigure`.

   D-0060's index row then reads "§1 superseded by D-new". It doesn't touch the D-0003 ramp, and H-12 already kept it.
2. **D-0005: no amendment under option (a).** Only if the owner picks (b): amend D-0005 to "no third-party images v1, **except** an MIT-licensed anatomy outline whose maintainer has confirmed in writing that the MIT licence covers the path data. It's credited in the app's third-party notices." It's blocked until `react-native-body-highlighter` #102 is answered.
3. **No contract change.** `tokens.json`, `data-model.md`, `openapi.yaml` and `engine-rules.md` are unchanged. A later named-muscles field (§5) would be a separate data-model decision.

## 10. Tickets

| Ticket | Lane | Size | Depends on | Scope |
|---|---|---|---|---|
| **T-0315** (reactivate) Draw the body figure | design | M | decision 1 | `Design-docs/docs/design/assets/body-figure/body-figure.svg` (front and back, §3.1 regions, §3.2 style, class names), a preview HTML, and an update to `design-system.md` (figure stroke and hatch rules). It promotes the two delta files into `c-01-body-map.md` and `screens/`. |
| **T-new-a** `BodyFigure` shared component | web-shell | S | T-0315 | `apps/web/src/components/body-figure/` from the asset, the hatch `<pattern>`, forced colours, and the import ban. AC-1, 2, 3, 12, 13. |
| **T-new-b** C-01 silhouette layout | web-shell | M | T-new-a | `BodyMap` puts `BodyFigure` above the label grid, with label↔region linking, region pointer forwarding and the attention halo. D-0060 §2–§8 are unchanged. AC-6, 7, 8, 9, 11 (C-01 part). UF-02.1 and UF-10.1 need no feature change. |
| **T-new-c** UF-04.2 exercise figure | web-feature:UF-04 | S | T-new-a | The figure card, plus the visible labels and swatches on the existing lists. AC-4, 5, 11 (UF-04.2 part). |
| **T-new-d** e2e and axe for the figure | qa | S | T-new-b, T-new-c | AC-7 real tap, AC-10, AC-11 screenshots, AC-13. (It can fold into b and c if the orchestrator prefers.) |

T-new-b and T-new-c can run in parallel after T-new-a.

## 11. Open questions for the owner (each has a default)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | An original drawing (a) or an MIT library figure (b)? (b) waits on the maintainer's answer to #102 and needs a D-0005 change. | **(a) original.** |
| Q2 | A Male/Female toggle? | **No.** One neutral figure in v1 (§4). |
| Q3 | Show sub-muscle *names* ("upper chest", "rear delts")? | **No.** Decorative seams only. Named muscles become a later content field (F-4). |
| Q4 | A small "this workout trains" figure on UF-08.2? | **No in v1.** Revisit after UF-04.2 ships. |
| Q5 | On UF-04.2, does the figure replace the area pills or sit beside them? | **Beside them.** The pills become the legend and the text equivalent. |
| Q6 | Should tapping a region on UF-04.2 go somewhere (for example UF-10.2 for that area)? | **No.** It's a static picture there. Coverage lives in Balance. |
| Q7 | Look: a flat "chalk line" figure, or shaded anatomy like the example? | **Flat chalk line,** to match Chalk & Iron and stay legible at 140 px. |

## 12. Follow-ups outside this spec

- F-1 (product): add one line to `Design-docs/docs/product/user-flows.md` under UF-04.2 ("figure of primary/secondary areas") and under the C-01 note ("silhouette with label grid"), after decision 1.
- F-2 (orchestrator): unpark T-0315 on the board and add the T-new-a…d rows.
- F-3 (web-feature:UF-04 and web-shell): screen spec changed. Build from the two delta files once T-0315 promotes them.
- F-4 (product → data → content, later): an optional per-exercise named-muscles text field (§5), only if the owner asks for it after v1.
