---
id: T-0990
title: Web UF-09.5 - the rest screen shows the next exercise's name, the cue for a new exercise, and "per arm" on the load line
lane: web-feature:UF-09
screens: [UF-09.5]
decisions: [D-0273, D-0261, D-0263, D-0267, D-0118]
deps: [T-0989]
status: ready
---
## Why
The rest screen never names the exercise, and a flagged exercise reads "× 10" on rest and "× 10 per arm" on UF-09.3 (spec `docs/specs/rest-next-exercise.md`, D-0273). Rest stays the task; the added text is supporting info inside the existing "Next" block (principle 1). Built from `Design-docs/docs/design/screens/UF-09.5.md` (T-0989).

## Scope
- In (`apps/web/src/features/UF-09/`):
  - `rest.tsx`: `nextLine` returns the target exercise id and a kind (`same`, `new`, none). The Next block becomes a small child component rendered only when something follows, so its hooks are not conditional: caption, name (`ctx.library` name, id as the existing fallback), then the load line (same exercise) or the cue (new exercise). "New" uses the same item `CHECK_RESOLVED` goes to (`itemIndex + 1`).
  - The cue and flag come from `useCachedFields(exerciseId)` (`use-cue.ts`), cue = `detail.cue`, else `instructions[0]`. If `useCachedFields` does not expose `instructions`, extend it (UF-09 file). The flag comes from the T-0979 store on the first render; the cue keeps its own async read.
  - Per-side on the load line: reuse the `HeroLine` and `SrText` pieces of `current-set.tsx` (export them or move them to one shared UF-09 file; do not copy), `perSide`, `readReps` from `lib/i18n/per-side.ts`.
  - `uf-09.css`: the name line (1.5rem, 700, `--wl-ink`, wraps), the cue line (body role), the unit span in the rest state. No raw hex, no `text-overflow`, no `line-clamp`, no fixed heights.
- In, listed extra (orchestrator grant, the T-0972 precedent): `apps/web/src/lib/i18n/flows/uf-09.ts` (drop `nextItem`; the caption uses `titles.next`).
- Out: the cue in the first-frame store (web-shell), UF-09.6, rest lengths and cues, engine, data, tokens, timed hold target on rest, a cue on a same-exercise rest.

## Acceptance criteria
Fixtures: plan of `bench-press` (4 sets, 27.5 kg × 20 pre-fill), `dumbbell-row` (flagged `arm`, cue "Lead with the elbows, stop at shoulder height"), `side-plank` (flagged `side`, timed), `back-squat` (no cue, `instructions[0]` set). Test titles start `T-0990 ACn`.
- AC1 (same exercise) Given the rest after set 2 of 4 of `bench-press`, When UF-09.5 renders, Then the Next block reads, in DOM order: "Next · set 3 of 4", "Bench press", "27,5 kg × 20", and has no cue line. Back-off: the caption is "Next · back-off set".
- AC2 (new exercise) Given the rest after the last set of `bench-press` with `dumbbell-row` following, Then the block reads "Next exercise", "Dumbbell row", "Lead with the elbows, stop at shoulder height", with no load line and no "Next · Dumbbell row" text anywhere.
- AC3 (cue source) Given the next exercise has an empty `cue` and `instructions[0]` "Stand with feet shoulder width apart.", Then that line is the cue. Given both exist, Then the cue wins. Given neither (or a detail that was never cached), Then there is no cue line and nothing throws.
- AC4 (per side, both values) Given the next set is `dumbbell-row` 12 kg × 10, Then the visible load reads "12 kg" over "× 10" plus the span " per arm", a visually hidden span reads "12 kg, 10 reps per arm", and the visible lines are `aria-hidden`. Given `bench-press`, Then the text is exactly as today and there is no hidden span. A flagged bodyweight set reads "10 reps per arm"; a flagged set with no weight keeps "Set weight" over "10 reps per arm"; each unflagged sibling is unchanged.
- AC5 (timed, both values) Given the next set is a set of `side-plank`, Then the block is the caption and "Side plank" only (no load line, no "Hold"). Given a new timed exercise follows, Then name and cue.
- AC6 (nothing next) Given a rest where no set and no item follows, Then there is no Next block, no name, no empty caption, and Rest, timer, −15 s, +15 s and Skip rest render as today. Sibling: AC1 and AC2 (something follows).
- AC7 (first frame, warm and cold) Given a warm flag store, When UF-09.5 renders the flagged next set, Then in the same synchronous `render()` return, with no `await`, the name and "per arm" are present. Given a cold store, Then the first return has the name and no suffix, `loadExerciseDetail` is called once for that id, and the suffix appears after the read resolves. The cue (new exercise) is absent in the first return and present after its read; the elements above it keep their positions (`getBoundingClientRect` equal before and after).
- AC8 (online and offline) Given `navigator.onLine` false and a cached detail, Then AC2 and AC4 hold with no network call. Given online, Then the same. Given a rejected `loadExerciseDetail`, Then name and load show, no cue, no suffix, no unhandled rejection.
- AC9 (one task) Given any rest with the block, Then the screen has exactly the buttons Pause (chrome), −15 s, +15 s and Skip rest, no link, no image, the block has no `role` and no `aria-live`, `role="timer"` still belongs to the clock only, and Skip rest still has focus on mount.
- AC10 (history states) Given zero history (weight null, `first_time`), Then the name shows above "Set weight". Given a return after 10 days off (`reentry` pre-fill), Then the name and the re-entry load show. Each is unchanged from AC1 apart from those values.
- AC11 (timer unchanged) Given the existing rest tests (engine constants, ±15 s, cue at 10 s and 0, "GO" at 0, drain fill), Then they pass unchanged, and at 0 the Next block is still shown beside "GO".
- AC12 (CSS) Given `uf-09.css`, Then the new rules contain no hex colour, no `text-overflow`, no `line-clamp`, no `height`, `max-height` or `white-space: nowrap` on the name or cue, and the name is `1.5rem` and weight 700.
- AC13 (deliberate test updates) Every existing test that pinned "Next · {name}" or `nextItem` is updated with a one-line reason in the log, not weakened; `exports-and-lint` and the `jsx-no-literals` test pass.
- Planted faults (log, one line each; backup restored with `cp`): F1 render the name only for `same` (AC2 red). F2 ignore the flag store (AC4 and AC7 red). F3 drop the `instructions[0]` fallback (AC3 red). F4 render the block when nothing follows (AC6 red). F5 add `aria-live` to the block (AC9 red).

Checklist (D-0197 §7): flagged and not (AC4), warm and cold (AC7), online and offline (AC8), cue present, fallback and absent (AC3), same and new exercise (AC1, AC2), timed and reps (AC5), something next and nothing (AC6); no migration here.

## Paths you may change
Lane `web-feature:UF-09`: `apps/web/src/features/UF-09/**`; extra: `apps/web/src/lib/i18n/flows/uf-09.ts`. Not parallel with another UF-09 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0990` and cite UF-09.5.

## Build / accept log
