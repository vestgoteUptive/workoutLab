# Triage

Raise a conflict by creating `TR-NNNN-slug.md` from the template below. The triage agent resolves the oldest open item at the start of each tick.

The triage agent decides. It doesn't escalate unless the resolution crosses a human gate (`../gates.md`). It weighs, in order:
1. Non-negotiable principles in `CLAUDE.md`.
2. Contracts and `decided` decisions (newest wins, unless the older one is more specific).
3. User flows v2 and the design system.
4. Keeping lanes separate. Prefer the option that touches fewer lanes.
5. Reversibility. When in doubt, choose the cheaper option to undo and mark it `revisit`.

Output: a new decision `D-NNNN` (superseding one if needed), follow-up tickets on the board, and `status: resolved` with a link on the TR file.

```markdown
---
id: TR-NNNN
status: open | resolved
raised_by: <agent> on T-NNNN
date: YYYY-MM-DD
---
## Conflict
<A says X (link), B says Y (link)>
## Options
1. …
2. …
## Blocking
<tickets blocked by this>
## Resolution   # filled by triage
```
