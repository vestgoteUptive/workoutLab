import base from "../../eslint.config.mjs";
import react from "eslint-plugin-react";

/**
 * D-0071 §9 import bans, tested with `ESLint.lintText` (the D-0060 §8 pattern) in
 * `src/app/__tests__/import-bans.test.ts` and `src/components/body-map/__tests__/`.
 *
 * `no-restricted-imports` matches the import **specifier as written**, not the resolved
 * file, so every pattern here has to accept both the relative form a sibling feature is
 * reached by (`../UF-11/index.js`, `../../UF-11/index.js`) and the fully spelled-out form
 * (`../../features/UF-11/index.js`). `FEATURE_PREFIX` is that shared head: a path boundary,
 * then an optional `features/` segment.
 *
 * The dynamic-`import()` form of each of these is T-0313's job (it reuses
 * `FEATURE_ENTRY_SOURCE` for the entry rule); `no-restricted-imports`
 * covers static `import` and `export … from` only.
 */
const FEATURE_PREFIX = "(^|/)(features/)?";

/**
 * The one place that says what a feature entry is (D-0170 §1, D-0071 §3): after the
 * `UF-NN/` segment the specifier is exactly `index.js` or a leaf entry `index.<topic>.js`,
 * `<topic>` being lower-case letters only. T-0313's `ImportExpression` rule reuses this
 * source and allows `index.<topic>.js` the same way. It is matched case-sensitively.
 */
const FEATURE_ENTRY_SOURCE = "index(\\.[a-z]+)?\\.js$";

/**
 * A cross-feature import must name the target's entry (D-0071 §3, D-0170 §1):
 * `features/UF-08/index.js` and `features/UF-08/index.prefs.js` are fine,
 * `features/UF-08/focus-prefs.js`, `index-x.js`, `index.Prefs.js` and `index/x.js` are not.
 * A feature's own modules are reached as `./focus-prefs.js` or `./sub/x.js`, which has no
 * `UF-NN/` segment, so own-folder imports are never matched.
 *
 * ESLint compiles `regex` with the `i` flag unless `caseSensitive: true`, so the entry name
 * would silently accept `Index.js`. The `UF` token is spelled `[Uu][Ff]` to keep a
 * lower-case `uf-08/` banned, as before.
 */
const INDEX_ONLY_PATTERN = {
  regex: `${FEATURE_PREFIX}[Uu][Ff]-\\d\\d/(?!${FEATURE_ENTRY_SOURCE})`,
  caseSensitive: true,
  message:
    "Import another feature only through its entry (`../UF-NN/index.js` or `index.<topic>.js`): deep imports are banned (D-0071 §3, D-0170 §1).",
};

const BODY_MAP_PATTERN = {
  regex: "(^|/)components/body-map(/|$)",
  message:
    "C-01 Body map is not allowed in UF-03/UF-04/UF-05/UF-08/UF-09 (principle 1: one task on screen during a workout, D-0045 §4, D-0071 §9).",
};

/**
 * D-0207 §3: the shared BodyFigure joins C-01 in the ban, but only for the flows that render
 * during a workout and have no figure (UF-03, UF-08, UF-09). UF-04.2 draws it, so UF-04 and
 * UF-05 are not in this ban. `no-restricted-imports` misses `import()`, so the same source is
 * also a `no-restricted-syntax` selector.
 */
const BODY_FIGURE_SOURCE = "(^|/)components/body-figure(/|$)";
const BODY_FIGURE_MESSAGE =
  "The body figure is not allowed in UF-03/UF-08/UF-09 (principle 1: one task on screen during a workout, D-0207 §3, D-0060 §8).";
const BODY_FIGURE_PATTERN = { regex: BODY_FIGURE_SOURCE, message: BODY_FIGURE_MESSAGE };

/**
 * The flows that never render during a workout. UF-04 and UF-05 are importers in the block
 * below, never targets: the how-to sheet and the swap sheet do mount inside the UF-09 host,
 * so no block needs a self-exception.
 */
const OUT_OF_WORKOUT_FLOWS = ["UF-02", "UF-06", "UF-07", "UF-10", "UF-11"];

/** Matches `../UF-02`, `../UF-02/index.js`, `../../features/UF-02/x.js`, … */
const OUT_OF_WORKOUT_FEATURE_PATTERN = {
  regex: `${FEATURE_PREFIX}(${OUT_OF_WORKOUT_FLOWS.join("|")})(/|$)`,
  message:
    "Out-of-workout flows (UF-02 Today, UF-06 Progress, UF-07 Routines, UF-10 Balance, UF-11 Plan check-in) may not be imported into a flow that renders during a workout (principle 1, D-0018, D-0071 §9).",
};

export default [
  ...base,
  {
    // The build/CLI scripts (check-bundle-size) are plain Node, not browser code.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", Buffer: "readonly" },
    },
  },
  {
    // Every user-facing string comes from `src/lib/i18n/en.ts` (NFR-I18N-1, D-0045 §12).
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/*.spec.tsx"],
    plugins: { react },
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: ["·", "×", "/", "–", "−", "+", "%"],
          ignoreProps: true,
        },
      ],
    },
  },
  {
    // Cross-feature imports go through the target feature's `index` only (D-0071 §3).
    // A deep import (`features/UF-08/focus-prefs.js`) is an error; a feature's own folder is
    // reached relatively (`./focus-prefs.js`), which this pattern never matches.
    //
    // `no-restricted-imports` is not merged across flat-config objects: a later object with
    // the same rule replaces this one entirely. So the workout-flow block below repeats this
    // pattern rather than relying on a cascade that flat config does not do.
    files: ["src/features/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [INDEX_ONLY_PATTERN] }] },
  },
  {
    // Principle 1 (one task on screen during a workout), D-0018, D-0045 §4, D-0071 §9.
    // UF-03, UF-04, UF-05, UF-08 and UF-09 all render during a workout (UF-04's how-to sheet
    // and UF-05's swap sheet mount inside the UF-09 host), so none of them may pull in
    // Today (UF-02), Progress (UF-06), Routines (UF-07), Balance (UF-10), the plan check-in
    // (UF-11) or C-01 Body map (the former AC-D11 rule, now extended to UF-04 and UF-05).
    files: [
      "src/features/UF-03/**",
      "src/features/UF-04/**",
      "src/features/UF-05/**",
      "src/features/UF-08/**",
      "src/features/UF-09/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [INDEX_ONLY_PATTERN, BODY_MAP_PATTERN, OUT_OF_WORKOUT_FEATURE_PATTERN],
        },
      ],
    },
  },
  {
    // D-0207 §3 / T-0556: UF-03, UF-08 and UF-09 may not import the BodyFigure (static, re-export
    // or dynamic). Repeats the block above's patterns: flat config replaces, not merges.
    files: ["src/features/UF-03/**", "src/features/UF-08/**", "src/features/UF-09/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            INDEX_ONLY_PATTERN,
            BODY_MAP_PATTERN,
            OUT_OF_WORKOUT_FEATURE_PATTERN,
            BODY_FIGURE_PATTERN,
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/components\\/body-figure(\\/|$)/]",
          message: BODY_FIGURE_MESSAGE,
        },
      ],
    },
  },
];
