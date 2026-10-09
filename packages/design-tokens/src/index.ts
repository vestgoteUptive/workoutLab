// @workoutlab/design-tokens — data only (D-0019). No functions: the UI must never derive a
// coverage step or attention state itself; the engine returns them (D-0013, principle 3).
// Colour values live only in ./tokens.json. Do not add colour literals to this file.
import raw from "./tokens.json";

export type Tokens = typeof raw;
type ColorGroup = Tokens["color"];
/** Flat Chalk & Iron colour names (`--wl-color-<name>`), in use until the app screens migrate. */
export type ColorName = {
  [K in keyof ColorGroup]: ColorGroup[K] extends string ? K : never;
}[keyof ColorGroup];
export type FontRole = keyof Tokens["font"];

/** D-0208 state groups: each screen root carries `data-wl-state` = one of the session states. */
export type ColorState = "plan" | "lift" | "rest" | "paper";
export type SessionState = (typeof raw.meta.states)[number];
/** `--wl-color-<state>-<name>` names for one state group (D-0208). */
export type StateColorName<S extends ColorState> = `${S}-${keyof ColorGroup[S] & string}`;
export type RadiusName = keyof Tokens["radius"];
export type SpaceName = keyof Tokens["space"];

/** Coverage step as returned by the engine's balance output (`coverageStep`, D-0013). */
export type CoverageStep = 0 | 1 | 2 | 3 | 4;
export type CoverageToken = `coverage-${CoverageStep}`;

export const tokens: Tokens = raw;

/** The four D-0208 colour groups, in tokens.json order. */
export const colorStates = [
  "plan",
  "lift",
  "rest",
  "paper",
] as const satisfies readonly ColorState[];

/**
 * `meta.planCoverage[n]` (D-0211 §1): `requiresLabel` is true when plan coverage step n is below
 * 3:1 on `plan.bg`, so the step must carry a text label. Precomputed data, checked by the tests.
 */
export type PlanCoverageMeta = Tokens["meta"]["planCoverage"][number];

/** Plan coverage step token (`--wl-color-plan-coverage-<n>`, D-0208); same steps as D-0013. */
export type PlanCoverageToken = `plan-coverage-${CoverageStep}`;

/**
 * D-0208 coverage ramp tokens, built in OKLCH from `color.coverage.from` to `.to` by
 * scripts/build-css.mjs. Names only: the UI reads the CSS variables, never computes a colour.
 */
export const planCoverageTokens = [
  "plan-coverage-0",
  "plan-coverage-1",
  "plan-coverage-2",
  "plan-coverage-3",
  "plan-coverage-4",
] as const satisfies readonly PlanCoverageToken[];

export const coverageTokens = [
  "coverage-0",
  "coverage-1",
  "coverage-2",
  "coverage-3",
  "coverage-4",
] as const satisfies readonly CoverageToken[];

export interface CoverageLegendEntry {
  readonly step: CoverageStep;
  /** Plan token name (D-0208). Draw it via `var(--wl-coverage-N)`, never `--wl-color-plan-*` (D-0210 §2). */
  readonly token: PlanCoverageToken;
  /** Visible legend label (C-01). */
  readonly label: string;
  /** Screen-reader label (C-01). */
  readonly srLabel: string;
}

/** C-01 legend, one entry per D-0013 step (copy: D-0019). */
export const coverageLegend: readonly CoverageLegendEntry[] = [
  { step: 0, token: "plan-coverage-0", label: "None", srLabel: "No hard sets" },
  { step: 1, token: "plan-coverage-1", label: "Under ⅓", srLabel: "Under one third of target" },
  { step: 2, token: "plan-coverage-2", label: "Under ⅔", srLabel: "Under two thirds of target" },
  { step: 3, token: "plan-coverage-3", label: "Under target", srLabel: "Under target" },
  { step: 4, token: "plan-coverage-4", label: "On target", srLabel: "On target or over" },
];

export interface AttentionLegend {
  /** Draw it via `var(--wl-attention)`, never `--wl-color-plan-attention` (D-0210 §2). */
  readonly token: "plan-attention";
  readonly style: "outline";
  readonly widthPx: 2;
  readonly label: string;
  readonly srLabel: string;
}

/** "Needs attention" is a 2 px `plan.attention` outline, never a fill (D-0003, D-0208). */
export const attentionLegend: AttentionLegend = {
  token: "plan-attention",
  style: "outline",
  widthPx: 2,
  label: "Needs attention",
  srLabel: "Needs attention",
};
