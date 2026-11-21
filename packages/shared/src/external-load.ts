// T-0954 (D-0251, D-0259 §13): the one "does this exercise take an external load" rule. The UI
// (the UF-04.2 weight-step row, the UF-09.4 stepper) and the effective-library builder both ask
// it, so they cannot disagree about which exercises can have an own weight step.
//
// A timed exercise has no weight to step, and a bodyweight exercise (`externalLoad: false`, a
// null `incrementKg`) has none either. Only a loaded, rep-counted exercise does.
export interface ExternalLoadFields {
  timed: boolean;
  externalLoad: boolean;
}

export function hasExternalLoad(exercise: ExternalLoadFields): boolean {
  return !exercise.timed && exercise.externalLoad;
}
