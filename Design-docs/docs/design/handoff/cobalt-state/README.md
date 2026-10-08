# Handoff: workoutLab visual redesign ("Cobalt + state colour")

## Overview
This replaces the current "Chalk & Iron" look (charcoal background, lime accent, condensed caps, nested cards) with one rule for the whole app:

**The background colour tells you what state you are in.**

| State | Colour | Used on |
|---|---|---|
| `plan` | cobalt `#2337C6` | Everything outside a set: Today, setup, Exercises, Progress, Balance, Plan, Account, Summary, plus any decision made mid-session (Time check, Paused, swap sheets) |
| `lift` | red `#CC4225` | Get ready (fill), Warm-up, Set, Log set, Timed set, List view |
| `rest` | teal `#3F7A76` | Rest, the set-up time before the next exercise. Red rises from the bottom as time runs out (the "drain") |
| `paper` | off-white `#F4F3EE` | Panels that need an answer: the check-in card and the unsynced sign-out warning |

Behaviour, copy and flows are **unchanged**. The existing specs in `Design-docs/docs/design/screens/`, `docs/specs/` and the decisions they cite (D-xxxx) stay the source of truth for behaviour, states and copy. This handoff only changes the visual layer.

## About the design files
`Design Directions.dc.html` is a **design reference made in HTML**, not production code. Recreate it in the existing app (`apps/web`, React + Vite, `@workoutlab/design-tokens`). Follow the repo's conventions: tokens in `tokens.json`, no raw colours (`workoutlab/no-raw-colour`), and rem font sizes.

Open the file in a browser. It is a pan/zoom canvas in rounds, newest at the top. **Implement rounds 3, 4 and 5 (`#turn-3`, `#turn-4`, `#turn-5`).** Rounds 1 and 2 are exploration only. Where they disagree, round 5 > 4 > 3. One exception: round 4's Get ready and Warm-up screens were restyled to lift/rest, and that is final.

## Fidelity
**High fidelity for colour, type, layout and hierarchy.** Exact pixel values are listed below.

Three exceptions:
- **Contrast fixes** in the token table override the mockups (see "Contrast").
- **Dashed boxes** are placeholders. The body map (C-01), the body figure (D-0207) and the exercise illustrations keep their current geometry and need recolouring for the plan background. See "Assets".
- **Icons** are drawn as text glyphs (→ ✓ ✕ ? II ⌄ ⋮⋮). Swap them for the repo's 2 px stroke icon set at the same positions.

## Implementation approach (repo-standard)
1. **Tokens.** Replace `packages/design-tokens/src/tokens.json` with the shape in `tokens.proposed.json`, and extend `scripts/build-css.mjs` to emit:
   - `--wl-color-plan-bg`, `--wl-color-lift-on-action`, and so on, one variable per token;
   - the coverage ramp, interpolated in OKLCH from `coverage.from` to `coverage.to`, as `--wl-color-coverage-0..4`.

   This is a contract change. Run it under the full-gate `--force` rule, with a new decision record. Update `tokens.test.ts` and `design-system.md`, both of which pin the old values.
2. **State scopes.** Don't make each screen pick colours. Add one attribute to each screen root, `data-wl-state="plan|lift|rest"`. CSS in `main.css` maps it onto generic variables that components use:
   ```css
   [data-wl-state="plan"] { --wl-bg: var(--wl-color-plan-bg); --wl-ink: var(--wl-color-plan-ink); --wl-ink-muted: var(--wl-color-plan-ink-muted); --wl-line: var(--wl-color-plan-line); --wl-action: var(--wl-color-plan-action); --wl-on-action: var(--wl-color-plan-on-action); --wl-font: var(--wl-font-plan); }
   [data-wl-state="lift"] { … lift values … }
   [data-wl-state="rest"] { … rest values … }
   .wl-paper { … paper values … }
   ```
   Components only read `--wl-bg`, `--wl-ink` and the other generic variables, so one Button works in every state. Also set `<meta name="theme-color">` from the state.
3. **Fonts.** Swap the two self-hosted families in `fonts.css`, following `visual-foundation.md` §1 (same rules: variable woff2, latin subset, OFL files, size budget).
   - Familjen Grotesk is the plan font.
   - Bricolage Grotesque is the session font.

   Both are OFL fonts on Google Fonts. Self-host them; never use the CDN (CSP).
4. **Shared patterns** (below), then screens in this order: Today, the focus mode screens (UF-09.*), setup (UF-08.*), then the rest.

## Design tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| plan.bg | `#2337C6` | Plan background |
| plan.raise | `#3B50DD` | Target tiles, empty bars, selected row in the routine editor, the "filled" part of progress |
| plan.line | `#6676DA` | 1 px hairlines, outline chips, segmented control border, tab bar rule (decorative) |
| plan.ink | `#FFFFFF` | Primary text |
| plan.ink-muted | `#C9D3FF` | Secondary text, labels, captions |
| plan.action / on-action | `#FFFFFF` / `#2337C6` | Primary pill button, selected chip or segment |
| plan.attention | `#FFB3A3` | "Needs attention" outline and label (Balance), below-target bar (Progress) |
| lift.bg | `#CC4225` | Lift background |
| lift.bg-deep | `#B33520` | Top band of a timed or warm-up countdown fill |
| lift.line / progress-off | `#EE8E7B` | Hairlines, unfinished progress segments (decorative) |
| lift.action / on-action | `#FFFFFF` / `#B33520` | Done, Save · start rest, Skip, Finish |
| rest.bg | `#3F7A76` | Rest background |
| rest.line / progress-off | `#7FA8A4` | Unfinished progress segments |
| rest.action / on-action | `#FFFFFF` / `#2C5754` | Skip rest (on the rest screen the button sits on the red drain, so it uses `#B33520` text) |
| paper.bg / ink / ink-muted / line | `#F4F3EE` / `#1A2266` / `#4A5290` / `#D6D6E4` | Check-in card, unsynced notice, blue-over-paper sheets |
| paper.action / on-action | `#2337C6` / `#FFFFFF` | Accept (check-in) |

### Contrast (WCAG 2.2 AA, measured)
- **Text pairs:**
  - white on plan.bg 8.6
  - ink-muted on plan.bg 5.9
  - white on plan.raise 6.2
  - `#DDE3FF` on raise 4.9
  - white on lift `#CC4225` 4.8
  - white on rest 4.9
  - `#B33520` on white 6.1
  - `#2C5754` on white 8.1
  - paper ink 12.9, paper ink-muted 6.5
  - attention on plan.bg 5.0
- **Fixes applied versus the mockups** (implement these, not the mockups):
  - lift `#D9472B` → `#CC4225`. White on the old value was 4.3.
  - Inactive tab labels `#9AA8F0` (3.8) → ink-muted `#C9D3FF`. The active tab is white plus a 2 px underline.
  - The "Previous" column in List view `#FBD9D1` (3.3) → white.
  - Rest-day labels in the week row and the 2b-style lists `#7E8EE8` (2.8) → ink-muted, with the word "rest" spelled out.
  - "Needs attention" `#FF9A85` (4.2) → `#FFB3A3`.
- Lift and rest have almost the same luminance (1.03:1), so they are told apart by hue only. Every session screen therefore names its state in text: "Lifting", "Rest", "Get ready", "Warm-up". Keep those labels; they are the colour-blind fallback.

### Type
Planning screens use Familjen Grotesk. Session screens (lift, rest) use Bricolage Grotesque. No uppercase transforms anywhere; sentence case only. Big titles end with a full stop ("Lower A.", "Progress.").

| Role | Plan (Familjen) | Session (Bricolage) |
|---|---|---|
| Hero number | — | 150 px (single-line digits, e.g. "100 kg", "×8", "2:29"), 300 px for single-digit countdowns; weight 800, line-height .85, tracking −.06em |
| Hero title | 96–112 px, weight 700, line-height .88, tracking −.05em ("Lower A." on Today) | — |
| Page title | 56 px, weight 700, tracking −.04em, line-height 1 | 44 px, weight 800, tracking −.03em (exercise name) |
| Section title | 44–48 px, weight 700, tracking −.04em | 64 px, weight 800 (next exercise name) |
| Stat | 34 px, weight 700, tracking −.03em | 56–72 px, weight 800 |
| Row title | 17–18 px, weight 600 | 17 px, weight 800 |
| Body | 17 px / 1.45 | 17 px / 1.45 |
| Label / caption | 14–15 px, weight 400, ink-muted | 15 px, weight 600 |
| Button | 22 px, weight 700 | 24 px, weight 800 |
| Tab label | 14 px, weight 600 | — |

Write the sizes in rem (16 px = 1 rem), following the repo rule.

### Spacing, radius, shape
- **Phone frame:** 390 × 844. Top padding 72 (status bar), bottom 44 (home indicator). Use `env(safe-area-inset-*)` instead of the fixed values.
- **Gutters:** plan 28 px, session 26 px. This replaces the 20 px `.wl-page` gutter; keep the 640 px max width.
- **No cards.** Structure comes from 1 px hairlines (`line`) between rows, and from type size. The one exception is the plan.raise tiles in Plan → Targets.
- **Radius:**
  - Pill buttons, chips and segmented controls 999.
  - Session buttons 22.
  - Sheets 28 (top corners only).
  - Selected option rows 16.
  - Tiles and inputs 12.
  - Progress segments 2.
- **Shadows:** none.

## Shared patterns
- **Primary button (plan):** full width, `action` fill, `on-action` text, 22/700, padding 20 px 28 px, pill. The label is left-aligned and the arrow or ✓ right-aligned. It is pinned to the bottom of the screen (`margin-top:auto`). Use one per screen.
- **Secondary button:** 1.5 px `ink` outline, transparent, 18/600, 16 px vertical padding, pill.
- **Text button:** `ink`, underlined with a 4 px offset, at least 44 × 44 hit area.
- **Session button:** the same as primary but radius 22, padding 24 px 26 px, 24/800. Outline variants are used for "−15 s", "+15 s", "Restart" and "Next".
- **Row:** 12 px vertical padding, 1 px `line` bottom border. Title 17/600, optional caption 14 ink-muted, optional trailing value or chevron.
- **Selected option row** (goal, swap and time-check options): the row becomes a white block with radius 16 that bleeds 18 px past the gutter, with plan.bg-coloured text. Unselected rows are plain rows. This replaces radio circles; keep the radio semantics (`role="radio"`).
- **Segmented control:** 1 px `line` border, pill, 4 px inner padding. The selected segment is a white pill with plan.bg text.
- **Chip:** 8 px × 14 px padding, pill. Off: 1 px `line` outline. On: white fill. Multi-select chips show "✓ " before the label, so the state isn't shown by fill alone.
- **Checkbox:** 22 px, radius 6. Off: 1.5 px ink-muted border. On: white fill with a plan.bg tick.
- **Toggle:** 48 × 28 pill. On: white with a plan.bg knob. Off: 1.5 px ink-muted outline with an ink-muted knob.
- **Week row (Today):** letters 22/600, 14 px gap. Done days are white, rest days ink-muted, today underlined.
- **Session progress:** a 44 px circular pause button (1.5 px outline), then N segments (4 px high, gap 4) filled white for done and progress-off for the rest, then a counter ("2 / 5", `white-space:nowrap`).
- **Drain fill** (Get ready, Rest, Next exercise, List view rest): the background is `linear-gradient(to top, lift.bg X%, rest.bg X%)`, where X = elapsed ÷ total. Step it once per second, or with a 1 s linear transition. Under `prefers-reduced-motion`, jump without the transition. At X = 100 the screen is fully lift-coloured, which is the moment the set starts. Timed sets and Warm-up use the same idea, with lift.bg-deep over lift.bg.
- **Sheet (swaps):** a full-height sheet from y = 150, plan.bg, radius 28, with a 40 × 4 grabber in plan.line. The screen behind is dimmed with `#0E1652` at 45 %. Swap sheets are plan-coloured even when opened from a lift screen.
- **Paper panel:** full-bleed (it bleeds past the gutters), paper.bg, padding 18–22 px 28 px, no radius.
- **Tab bar:** a 4-column grid with a 1 px `line` top rule, padding 14 px 12 px 32 px, 14/600. Text only, until icons are chosen.

## Screens
"Section" means the canvas section in `Design Directions.dc.html`. Copy and behaviour come from the spec files listed.

| UF | Screen | State | Section | Behaviour spec |
|---|---|---|---|---|
| UF-01.1–01.4 | Welcome, Goal, Level & equipment, Schedule | plan | turn-4 → Onboarding | T-0301b |
| UF-01.5 | Sign in / Save your plan | plan | turn-5 → Account | T-0301c, `lib/i18n/flows/uf-01.ts` |
| UF-02.1 | Today (+ check-in pending) | plan / paper | turn-3, turn-5 | T-0302a, uf-11-plan-checkin.md |
| UF-02.2 | Workout preview | plan | turn-5 | T-0302b |
| UF-08.1 | Time and energy | plan | turn-3 | UF-08.x tickets |
| UF-08.2 | Your workout | plan | turn-3 | screens/UF-08.2.md |
| UF-08.3 | Swap before starting | plan sheet | turn-5 | screens/UF-08.3-UF-05.1.md |
| UF-08.4 | Ready | plan | turn-5 | T-0303d |
| UF-09.1 | Get ready | rest → lift drain | turn-4 | T-0304f |
| UF-09.2 | Warm-up | lift (deep fill) | turn-4 | T-0304c |
| UF-09.3 | Set | lift | turn-3 | T-0304b |
| UF-09.4 | Log set | lift | turn-5 | T-0304b |
| UF-09.5 | Rest | rest → lift drain | turn-3 | T-0304f |
| UF-09.6 | Next exercise | rest → lift drain | turn-4 | T-0304f |
| UF-09.7 | Timed set | lift (deep fill) | turn-4 | T-0304c |
| UF-09.8 | Time check | plan | turn-4 | T-0304d |
| UF-09.9 | Paused | plan (Resume is the lift colour) | turn-4 | screens/UF-09.9.md |
| UF-03.1 / 03.2 | List view, List view rest | lift / drain | turn-5 | T-0305 |
| UF-03.3 | Summary | plan (PR band is lift) | turn-3 | T-0305 |
| UF-04.1 / 04.2 / 04.3 | Exercises, Detail, Compare | plan | turn-3, turn-5 | screens/UF-04.1-UF-04.2.md |
| UF-05.1 | Swap mid-workout | plan sheet over lift | turn-5 | screens/UF-08.3-UF-05.1.md |
| UF-06.1 / 06.2 | Progress, History | plan | turn-3, turn-5 | T-0307b |
| UF-07.1 | Edit routine | plan | turn-3 | T-0308a |
| UF-10.1 / 10.2 | Balance, Area detail | plan | turn-5 | uf-10-balance.md |
| UF-11.2 | Plan | plan | turn-5 | screens/UF-11.2.md |
| UF-11.4 | Account (+ delete open, unsynced) | plan / paper | turn-4, turn-5 | screens/UF-11.4.md |

Not drawn, so apply the same patterns: UF-11.3 Edit plan (reuse the Goal and Schedule screens), UF-11.5 Excluded, UF-11.6 Favorites, the offline line, and the empty and error states listed in each spec.

## Interactions
- State changes swap `data-wl-state` on the screen root. Cross-fade the background over 200 ms ease-out; no other motion. Under reduced motion, change instantly.
- Every other interaction (pre-fill, auto-save countdown, wake lock, sound cues, swap ranking, time check) is unchanged; see the specs.
- Destructive actions (Delete account, End workout) are never the white primary button. They use the secondary outline and sit last on the screen.

## Assets
- The body figure (`assets/body-figure/body-figure.svg`) and C-01 body map keep their geometry. Recolour them for plan.bg:
  - silhouette fill plan.raise, stroke ink-muted;
  - coverage ramp from plan.raise to white;
  - primary areas white, secondary areas a white hatch;
  - attention halo plan.attention.

  This needs a design check: it was not mocked.
- Exercise illustrations: same treatment, white line art on plan.raise.
- Fonts: Familjen Grotesk and Bricolage Grotesque (OFL, Google Fonts / Fontsource).
- No other images.

## Open decisions (raise as D-xxxx before building)
1. Two font families split by state, or one family for both? The design uses two. One (Familjen) would be simpler and lighter.
2. The 28 px gutter replaces the 20 px gutter from `visual-foundation.md` §2.
3. The new token shape (state groups) replaces the flat `color.*` tokens; `warn` and `accent` are retired.
4. "See this period in Balance" and the other navigation links still need product sign-off, as already noted in UF-11.2.md.

## Files
- `Design Directions.dc.html`: the design canvas. Open it in a browser next to `support.js`.
- `support.js`: the runtime the canvas needs to render. Not app code.
- `ref/today.png`: the current Today screen, shown in round 1 for comparison.
- `tokens.proposed.json`: the proposed `tokens.json`, in the repo's format.
