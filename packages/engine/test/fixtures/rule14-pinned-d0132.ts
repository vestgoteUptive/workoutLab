// T-0221 UF-09.3 (D-0132 §1): the rule 14 lines that stay byte-identical, captured from
// main (db1b356) before the D-0132 edit. Do not edit by hand; AC3 compares rule 14 against it.
export const RULE14_PINNED = {
  heading: "## 14. Progression and pre-fill (UF-09.3, UF-09.4, D-0026)",
  lastPerformance:
    '**Last performance** is the hard sets of this exercise in the most recent session that contains it. `W` is their highest weight. `minReps` and "all at W" use the sets at `W`. `gap` = D − that session\'s local date. Ranges come from rule 7.2 (low/high). The first match wins:',
  step1:
    "1. No history: if this is a swap or shuffle and the slot's previous exercise shares a weight-1.0 area and an equipment item, carry its pre-fill weight (`carry`). Otherwise the weight is null, or 0 for bodyweight (`first_time`). Low reps.",
  step3: "3. `gap ≥ 10`: `W`, low reps (`hold_after_break`).",
  step6: "6. The last session alone with `minReps < low`: `W`, low reps (`hold`).",
  step7: "7. Otherwise: `W`, `min(high, minReps + 1)` (`add_rep`).",
  timed:
    "For timed sets, the first time uses `default_duration_s`. After that the duration is `min(last) + 5 s` (≤ 120). When `gap ≥ 10` it stays at `min(last)`, and when `gap ≥ 21` it is `max(15, floor5(0.9 × min))`. `floorInc(x) = floor(round3(x) / inc) × inc`.",
  examples: [
    "- **R14-E1** back-squat as the main lift, last on 09-24 at 100 × 8, 8, 8: 102.5 × 6 (`increase`).",
    "- **R14-E2** 100 × 8, 7, 6 on 09-24: 100 × 7 (`add_rep`).",
    "- **R14-E3 (returning after 10 days off)** 100 × 8, 8, 8 on 09-15: 100 × 6 (`hold_after_break`).",
    "- **R14-E4** 102.5 × 8, 8, 8 on 09-01: 90 × 6 (`reentry`).",
    "- **R14-E5** 100 × 5, 5, 4 on 09-20 and 100 × 5, 4, 4 on 09-24: 90 × 6 (`deload`). The 09-24 session alone: 100 × 6 (`hold`).",
    "- **R14-E6** leg-curl with no history: null × 10. push-up as an accessory: 0 × 8.",
    "- **R14-E7 (carry)** lat-pulldown pre-fill 50 → seated-cable-row with no history: 50 (shares back and cable). barbell-row 60 → db-row: null (no shared equipment).",
    "- **R14-E8** plank, last 45, 45, 40 s on 09-24: 45 s.",
    "- **R14-E9** High-energy back-off on a bench-press pre-fill of 80 × 6: 70 × 6.",
  ],
} as const;

/**
 * The D-0132 §1 text, byte for byte: steps 2, 4 and 5, the edge-case heading line and its
 * five bullets. A change to any of them (e.g. `W + 2·inc` in step 4) needs a new decision.
 * D-0137 §4 (T-0235) is one: steps 2 and 5 read `min(W, max(inc, floorInc(0.9 W)))`, and the
 * Drop floor bullet gains the cap sentence and its worked case. Nothing else here changed.
 */
export const RULE14_D0132 = {
  step2:
    "2. `gap ≥ 21`: `min(W, max(inc, floorInc(0.9 W)))` (0 when `W = 0`), low reps (`reentry`).",
  step4:
    "4. Every set at W has reps ≥ high: `W + inc`, low reps (`increase`) (bodyweight: 0 at high reps, `increase`).",
  step5:
    "5. The last two sessions both at W with `minReps < low`: `min(W, max(inc, floorInc(0.9 W)))` (0 when `W = 0`), low reps (`deload`).",
  edgeCases: "**Edge cases (D-0057, D-0062, D-0132):**",
  bullets: [
    '- **Bodyweight (D-0057 §2):** for `externalLoad: false`, `W` is 0 and the weight stays 0 in every branch. Every set with non-null reps counts as "at W", whatever weight was logged (D-0057 §2). Step 4 gives 0 at high reps (`increase`). `floorInc` is never applied.',
    "- **Usable sets (D-0057 §3, D-0062 §2, §3):** `W` is the highest non-null weight among the session's hard sets, including sets whose reps are null. Sets whose reps are null are ignored for `minReps` and \"all at W\". If the most recent session containing the exercise has no usable set (no non-null weight on a loaded lift, no non-null reps at `W`, or no non-null `durationS` when timed), step 1 applies. The engine never falls back to an older session. Step 5's second session must be usable too, or step 5 does not match.",
    "- **Drop floor (D-0057 §4, D-0062 §4):** `inc = incrementKg ?? 2.5`. Steps 2 and 5 never give less than one increment when `W > 0`. The drop is capped at `W`, so when `0 < W < inc` steps 2 and 5 give `W` (D-0137): bench-press 2 × 6, 6, 6 on 09-01: 2 × 6 (`reentry`), never 2.5. A loaded lift logged at 0 kg has `W = 0`, a recorded weight: steps 2, 3, 5, 6 and 7 give 0, and step 4 gives `0 + inc`.",
    '- **Carry (D-0062 §1):** step 1 carries only when the previous weight is > 0, the exercise is non-timed with `externalLoad: true`, and the previous exercise is a library row of kind `exercise` sharing a weight-1.0 area and an equipment item (`[]` ≡ `["none"]`, D-0040 §1). The carried weight is rounded to 3 decimals. Otherwise step 1 is `first_time`.',
    "- **Timed (D-0057 §6, D-0062 §5):** `min(last)` is the minimum non-null `durationS` over that session's hard sets. Weight and reps are null. Every non-first-time result is clamped to [15, 120] s: `gap ≥ 21` → `clamp(max(15, floor5(0.9 × min)))` (`reentry`); `gap` 10–20 → `clamp(min)` (`hold_after_break`); otherwise `clamp(min + 5)`, which is `add_rep` when greater than `min` and `hold` when not. `floor5(x) = floor(round3(x) / 5) × 5`. The first time is `defaultDurationS`, unclamped.",
  ],
} as const;

/** Rule 14: the text from `\n## 14.` up to `\n## Required tests` (null when either is missing). */
export function rule14Section(doc: string): string | null {
  const start = doc.indexOf("\n## 14.");
  if (start === -1) return null;
  const end = doc.indexOf("\n## Required tests", start);
  return end === -1 ? null : doc.slice(start + 1, end);
}

/**
 * D-0132 §2: the rule 14 lines the T-0205 guard still compares with main. They are the
 * `## 14.` heading, the "Last performance" paragraph and the `- **R14-E…` example lines.
 * Everything else in rule 14 is pinned positively by t0221-rule-14-text.test.ts.
 */
export function rule14GuardedLines(doc: string): string[] {
  const section = rule14Section(doc);
  if (section === null) return [];
  return section
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("## 14.") || l.startsWith("**Last performance**") || l.startsWith("- **R14-E"),
    );
}

/** Pure D-0132 §2 comparison: the guarded lines of `current` that differ from `main`. */
export function rule14GuardDiff(current: string, main: string): string[] {
  const now = rule14GuardedLines(current);
  const before = rule14GuardedLines(main);
  if (before.length === 0) return ["rule 14 is missing on main"];
  const out: string[] = [];
  const n = Math.max(now.length, before.length);
  for (let i = 0; i < n; i++) {
    if (now[i] !== before[i])
      out.push(`line ${i}: ${JSON.stringify(now[i])} ≠ ${JSON.stringify(before[i])}`);
  }
  return out;
}
