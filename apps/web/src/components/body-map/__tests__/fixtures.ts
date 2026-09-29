// C-01 test fixtures (T-0300d). Each area carries an explicit engine `coverageStep`; several are
// deliberately inconsistent with load/target so a UI that derives the step would show it.
import { AREAS, type Area } from "@workoutlab/shared";
import type { BodyMapArea } from "../BodyMap.js";

export const TARGETS: Record<Area, number> = {
  chest: 16,
  back: 20,
  shoulders: 16,
  arms: 14,
  core: 12,
  glutes: 16,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};

/** Zero history: every area 0 / target, step 0, no attention (AC-D8). */
export const zeroFixture: BodyMapArea[] = AREAS.map((area) => ({
  area,
  load: 0,
  target: TARGETS[area],
  coverageStep: 0,
  needsAttention: false,
}));

/** Every step 0–4 present, plus the fractional labels of AC-D3. */
export const mixedFixture: BodyMapArea[] = [
  { area: "chest", load: 0, target: 16, coverageStep: 0, needsAttention: false },
  { area: "back", load: 7.5, target: 20, coverageStep: 2, needsAttention: false },
  { area: "shoulders", load: 8, target: 20, coverageStep: 2, needsAttention: false },
  { area: "arms", load: 7.25, target: 20, coverageStep: 2, needsAttention: false },
  { area: "core", load: 0, target: 16, coverageStep: 0, needsAttention: false },
  { area: "glutes", load: 16, target: 16, coverageStep: 4, needsAttention: false },
  { area: "quads", load: 3, target: 20, coverageStep: 1, needsAttention: false },
  // Engine says step 1 at r = 0.995: the UI must not turn this into step 3.
  { area: "hamstrings", load: 19.9, target: 20, coverageStep: 1, needsAttention: false },
  { area: "calves", load: 10, target: 12, coverageStep: 3, needsAttention: false },
];

/** Attention on step 0, 3 and 4 (AC-D2, AC-D4). */
export const attentionFixture: BodyMapArea[] = AREAS.map((area) => {
  switch (area) {
    case "chest":
      return { area, load: 0, target: 16, coverageStep: 0, needsAttention: true };
    case "hamstrings":
      return { area, load: 12, target: 16, coverageStep: 3, needsAttention: true };
    case "glutes":
      return { area, load: 18, target: 16, coverageStep: 4, needsAttention: true };
    default:
      return { area, load: 4, target: TARGETS[area], coverageStep: 1, needsAttention: false };
  }
});

export function withArea(base: BodyMapArea[], patch: BodyMapArea): BodyMapArea[] {
  return base.map((a) => (a.area === patch.area ? patch : a));
}
