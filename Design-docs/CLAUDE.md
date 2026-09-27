# Project context for Claude Code

Fitness app (PWA): tracks hard sets per body area over a rolling 14-day window and suggests time-boxed workouts that fill the gaps.

Before working on UI or features, read:
- `docs/product/user-flows.md` — screen IDs (UF-xx.n) and behaviour. Reference IDs in commits and PRs.
- `docs/design/design-system.md` — use these tokens; don't invent colours or fonts.
- `docs/design/prototype/<ID>.dc.html` — layout, copy and timer logic for a screen.

Rules:
- During a workout (UF-09) show one task per screen. Secondary actions go behind Pause.
- The recommendation engine is deterministic and unit-tested; no LLM in core logic.
- Time budget is an input to exercise selection, not just a display.
