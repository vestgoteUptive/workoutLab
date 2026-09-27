// @workoutlab/design-tokens — data only (D-0019). No functions: the UI must never derive a
// coverage step or attention state itself; the engine returns them (D-0013, principle 3).
// Colour values live only in ./tokens.json. Do not add colour literals to this file.
import raw from "./tokens.json";

export type Tokens = typeof raw;
export type ColorName = keyof Tokens["color"];
export type FontRole = keyof Tokens["font"];

/** Coverage step as returned by the engine's balance output (`coverageStep`, D-0013). */
export type CoverageStep = 0 | 1 | 2 | 3 | 4;
export type CoverageToken = `coverage-${CoverageStep}`;

export const tokens: Tokens = raw;

export const coverageTokens = [
  "coverage-0",
  "coverage-1",
  "coverage-2",
  "coverage-3",
  "coverage-4",
] as const satisfies readonly CoverageToken[];

export interface CoverageLegendEntry {
  readonly step: CoverageStep;
  readonly token: CoverageToken;
  /** Visible legend label (C-01). */
  readonly label: string;
  /** Screen-reader label (C-01). */
  readonly srLabel: string;
}

/** C-01 legend, one entry per D-0013 step (copy: D-0019). */
export const coverageLegend: readonly CoverageLegendEntry[] = [
  { step: 0, token: "coverage-0", label: "None", srLabel: "No hard sets" },
  { step: 1, token: "coverage-1", label: "Under ⅓", srLabel: "Under one third of target" },
  { step: 2, token: "coverage-2", label: "Under ⅔", srLabel: "Under two thirds of target" },
  { step: 3, token: "coverage-3", label: "Under target", srLabel: "Under target" },
  { step: 4, token: "coverage-4", label: "On target", srLabel: "On target or over" },
];

export interface AttentionLegend {
  readonly token: "warn";
  readonly style: "outline";
  readonly widthPx: 2;
  readonly label: string;
  readonly srLabel: string;
}

/** "Needs attention" is a 2 px `warn` outline, never a fill (D-0003). */
export const attentionLegend: AttentionLegend = {
  token: "warn",
  style: "outline",
  widthPx: 2,
  label: "Needs attention",
  srLabel: "Needs attention",
};
