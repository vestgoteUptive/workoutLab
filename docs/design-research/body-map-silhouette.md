# Body map silhouette: source research (GitHub #48)

- **Idea:** the owner, GitHub #48 "overview of the muscle groups and their parts": "This is an example from ExerciseDB … A nice visualization of the body and respective muscle group. Could we have something like this in our app?" Their example shows two shaded anatomical figures (front and back). Primary muscles are blue, secondary muscles are green, and a Male/Female tab sits above them.
- **Checked:** 2026-10-08 by the designer. Every licence claim below was read from the live source on that date. The links are listed at the end.
- **Spec this feeds:** `docs/specs/body-map-silhouette.md`.

## Constraints we already have

| Source | What it says | Effect |
|---|---|---|
| D-0192 | No ExerciseDB data or media without written terms that allow storing and redistributing it (H-26). | The owner's example image can't be used or traced. It's a reference for the idea only. |
| D-0005 (confirmed, D-0061) | "Illustrations are simple line figures that the designer makes from a shared template; no third-party images v1." | An original figure fits D-0005 as written. A third-party figure would need D-0005 amended. |
| D-0060 §1 | The tile grid ships "until design delivers a silhouette". | The silhouette replaces §1 only. §2–§8 (data in, numbers, names, keys, loading, axe, imports) still apply. |
| D-0003, D-0019, H-12 | Lime coverage ramp and a 2 px `warn` outline. The owner reviewed it on a phone (H-12, 2026-10-04) and kept the ramp as it is. | No new colours. The silhouette reuses `coverage-0..4`, `warn` and `accent`. |
| NFR-A11Y-2/3 | 44 px targets. Coverage never relies on colour alone. | Text labels stay in C-01. Small regions (calves) aren't the tap target. |
| Data model | `exercise_areas.weight` ∈ {1.0, 0.5} on 9 areas. No sub-muscle data, and no sex or gender field anywhere. | The figure has 9 regions. Sub-muscles can only be decoration. |

## Option (a): an original SVG figure

Drawn by the designer: a front view and a back view, stylised as a chalk line figure with flat fills, and no photoreal shading.

- **Licence:** our own work (`LicenseRef-workoutLab`, the same as the library text). No attribution, no share-alike, and no third-party notice.
- **Fit:** the regions are drawn to our 9 areas from the start, so no mapping table is needed. It's styled with tokens only, through classes and no `fill` attributes, so it passes `workoutlab/no-raw-colour` and `wl-check-colours`. It matches D-0005's "line figures from a shared template", so the exercise illustrations and the body figure look like one family.
- **Cost:** two views with about 20 polygons each (left and right, plus decorative seams). A designer can draw it in one ticket (size M). There's no runtime dependency, and the inline SVG is about 6–10 kB.
- **Risk:** it's less detailed than a commercial anatomy render. That's a feature for our style. "Chalk & Iron" is flat and high-contrast, and a stylised figure reads better at 140–240 px tall than a shaded one.

## Option (b): an openly licensed muscle-map SVG

| Candidate | Licence (as read) | Attribution | Provenance of the art | Fit to our 9 areas |
|---|---|---|---|---|
| `react-native-body-highlighter` (HichamELBSI), npm | MIT, "Copyright (c) 2022 ELABBASSI Hicham". The repo was last pushed 2026-09-17 and isn't archived. | MIT requires the copyright and permission notice in "all copies or substantial portions", so a third-party notices entry is needed. | **Unconfirmed.** The README doesn't credit an artist or a source. Issue #102 "Licence question about the anatomy path data" (opened 2026-08-16) asks the maintainer two things: is the path data original work, and does the MIT licence cover the artwork? It's still open with no answer from the maintainer. The only comment is another user asking whether an answer came. | It has 24 slugs (trapezius, deltoids, biceps, triceps, forearm, chest, abs, obliques, upper-back, lower-back, gluteal, abductors, adductors, quadriceps, hamstring, calves, tibialis, plus head, neck, hands, feet, knees, ankles, hair). It needs a merge table to our areas. Adductors, abductors and tibialis have no clear home. It has male and female bodies. The README says per-part accessibility "would require a deeper refactor". |
| `react-body-highlighter` (giavinh79), npm | MIT, "Copyright (c) 2020 GV79". Last pushed 2026-09-20. | The same MIT notice. | The README says: "The SVG polygons were leveraged from … react-native-body-highlighter". So it has **the same open provenance question** as the row above. | 20 muscle ids, the same merge problem. Its default colours are hard-coded hex props, which we'd override. Male only. |
| Wikimedia `File:Muscular_system.svg` / `Muscular_system-back.svg` (also bundled by wger, see `wger/core/static/images/muscles/SOURCES`) | **CC BY-SA 3.0 Unported.** Author Termininja. Derived from `Pectoralis major.png` and `Tibial anterior.png`. | Credit, a licence link and "indicate if changes were made". **Share-alike:** our edited figure would have to ship under CC BY-SA too. | Documented. | Anatomically detailed and shaded. Recolouring it to the coverage ramp and splitting it into 9 regions is a full redraw anyway, and the redraw is still share-alike. |

**Summary for (b):** the two MIT packages are the obvious candidates, and their licence on the code is clear. Whether that licence covers the *drawing* is the open question, and someone else has already asked it publicly without an answer for about 7 weeks. D-0192 set the bar at written terms before we store third-party media, and these packages don't meet it today. The Wikimedia art is properly licensed, but share-alike on our main visual is a heavier obligation than D-0005 accepted for text, and we'd redraw it anyway. Every (b) path also needs a merge table to 9 areas and token restyling, so the saving over (a) is smaller than it looks.

## Option (c): keep the D-0060 tile grid

- It already ships, and it's tested, accessible and token-only.
- It doesn't answer #48. The owner asked for "a nice visualization of the body". The tile grid is the accessible *layer* we keep under the figure (see the spec), but on its own it isn't the picture they asked for.

## Recommendation

**(a) An original SVG figure,** with the D-0060 tiles kept as the text and control layer under it. It meets D-0005 as written, needs no D-0005 change and no third-party notice, has no open provenance risk, and is drawn to our 9 areas and tokens from the start.

If the owner prefers (b) for speed, it's conditional: the maintainer must answer #102 in writing (original work, MIT covers the path data) before any path is copied, and D-0005 must be amended. The draft wording is in the spec's "Decisions needed".

## The owner's example, element by element

| Element in the ExerciseDB example | Do we copy it? | Why |
|---|---|---|
| Front and back figures side by side | Yes | It's the core of the idea. Every area is visible somewhere. |
| Primary and secondary in two hues (blue and green) | Yes, but as **solid versus hatched lime**, not two hues | We have one accent (Chalk & Iron), and colour can't be the only signal. Solid versus hatched reads in greyscale and for colour-blind users. |
| Shaded, photoreal muscles | No | Off-style, heavy, and not ours to use. A flat chalk-line figure instead. |
| Named sub-muscles drawn separately (three deltoid heads, upper and lower pecs) | Only as decorative seam lines | We have 9 areas of data. Separate fills would imply tracking we don't do. |
| Male/Female toggle | No (v1) | See spec §4. |

## Sources (opened 2026-10-08)

- https://github.com/HichamELBSI/react-native-body-highlighter: `LICENSE` (MIT), the README body-part table, and the `gender` prop
- https://github.com/HichamELBSI/react-native-body-highlighter/issues/102: the provenance question, open and unanswered by the maintainer
- https://github.com/giavinh79/react-body-highlighter: `LICENSE` (MIT), and the README line "The SVG polygons were leveraged from … react-native-body-highlighter"
- https://commons.wikimedia.org/wiki/File:Muscular_system.svg: CC BY-SA 3.0, author Termininja, a derived work
- https://github.com/wger-project/wger: `wger/core/static/images/muscles/SOURCES` points at the two Wikimedia files above
