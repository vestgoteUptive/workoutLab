// Fixture "L1+" (T-0306a): the engine L1 table (docs/engine-rules.md, 22 exercises) plus
// goblet-squat and leg-press (24), plus the 8 warm-up moves, as PostgREST rows for the
// `createSelectSpy` in `lib/offline/__tests__/select-spy.ts`. Seeded in REVERSE alphabetical
// order, so an unsorted render fails.
import type { SelectSpy } from "../../../lib/offline/__tests__/select-spy.js";

export type Row = Record<string, unknown>;
type Weights = Record<string, number>;

interface Def {
  id: string;
  name: string;
  type: "compound" | "isolation";
  level?: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  areas: Weights;
  timed?: boolean;
  durationS?: number | null;
  kind?: "exercise" | "warmup";
}

const S = { quads: 1, glutes: 1 };
const DEFS: Def[] = [
  {
    id: "back-squat",
    name: "Back squat",
    type: "compound",
    equipment: ["barbell", "rack"],
    areas: { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
  },
  {
    id: "romanian-deadlift",
    name: "Romanian deadlift",
    type: "compound",
    equipment: ["barbell"],
    areas: { hamstrings: 1, glutes: 0.5 },
  },
  {
    id: "hip-thrust",
    name: "Hip thrust",
    type: "compound",
    equipment: ["barbell", "bench"],
    areas: { glutes: 1, hamstrings: 0.5 },
  },
  {
    id: "leg-extension",
    name: "Leg extension",
    type: "isolation",
    equipment: ["machine"],
    areas: { quads: 1 },
  },
  {
    id: "leg-curl",
    name: "Leg curl",
    type: "isolation",
    equipment: ["machine"],
    areas: { hamstrings: 1 },
  },
  {
    id: "calf-raise",
    name: "Calf raise",
    type: "isolation",
    equipment: ["machine"],
    areas: { calves: 1 },
  },
  {
    id: "bench-press",
    name: "Bench press",
    type: "compound",
    equipment: ["barbell", "bench"],
    areas: { chest: 1, shoulders: 0.5, arms: 0.5 },
  },
  {
    id: "db-bench-press",
    name: "Dumbbell bench press",
    type: "compound",
    equipment: ["dumbbell", "bench"],
    areas: { chest: 1, shoulders: 0.5, arms: 0.5 },
  },
  {
    id: "push-up",
    name: "Push-up",
    type: "compound",
    equipment: [],
    areas: { chest: 1, arms: 0.5, core: 0.5 },
  },
  {
    id: "overhead-press",
    name: "Overhead press",
    type: "compound",
    equipment: ["barbell"],
    areas: { shoulders: 1, arms: 0.5, core: 0.5 },
  },
  {
    id: "lateral-raise",
    name: "Lateral raise",
    type: "isolation",
    equipment: ["dumbbell"],
    areas: { shoulders: 1 },
  },
  {
    id: "barbell-row",
    name: "Barbell row",
    type: "compound",
    equipment: ["barbell"],
    areas: { back: 1, arms: 0.5 },
  },
  {
    id: "db-row",
    name: "Dumbbell row",
    type: "compound",
    equipment: ["dumbbell", "bench"],
    areas: { back: 1, arms: 0.5 },
  },
  {
    id: "inverted-row",
    name: "Inverted row",
    type: "compound",
    equipment: ["rack"],
    areas: { back: 1, arms: 0.5, core: 0.5 },
  },
  {
    id: "lat-pulldown",
    name: "Lat pulldown",
    type: "compound",
    equipment: ["cable"],
    areas: { back: 1, arms: 0.5 },
  },
  {
    id: "seated-cable-row",
    name: "Seated cable row",
    type: "compound",
    equipment: ["cable"],
    areas: { back: 1, arms: 0.5 },
  },
  {
    id: "straight-arm-pulldown",
    name: "Straight-arm pulldown",
    type: "isolation",
    equipment: ["cable"],
    areas: { back: 1 },
  },
  {
    id: "pull-up",
    name: "Pull-up",
    type: "compound",
    level: "intermediate",
    equipment: ["pullup-bar"],
    areas: { back: 1, arms: 0.5 },
  },
  {
    id: "biceps-curl",
    name: "Biceps curl",
    type: "isolation",
    equipment: ["dumbbell"],
    areas: { arms: 1 },
  },
  {
    id: "plank",
    name: "Plank",
    type: "isolation",
    equipment: [],
    areas: { core: 1 },
    timed: true,
    durationS: 45,
  },
  { id: "dead-bug", name: "Dead bug", type: "isolation", equipment: [], areas: { core: 1 } },
  {
    id: "hanging-knee-raise",
    name: "Hanging knee raise",
    type: "isolation",
    equipment: ["pullup-bar"],
    areas: { core: 1 },
  },
  { id: "goblet-squat", name: "Goblet squat", type: "compound", equipment: ["dumbbell"], areas: S },
  {
    id: "leg-press",
    name: "Leg press",
    type: "compound",
    equipment: ["machine"],
    areas: { ...S, hamstrings: 0.5 },
  },
];

const WARMUPS: Def[] = [
  ["wu-scap-push-up", "Scap push up", { chest: 1, shoulders: 0.5 }],
  ["wu-arm-circle", "Arm circle", { shoulders: 1, chest: 0.5 }],
  ["wu-band-pull-apart", "Band pull apart", { back: 1, shoulders: 0.5 }],
  ["wu-cat-cow", "Cat cow", { core: 1, back: 0.5 }],
  ["wu-bodyweight-squat", "Bodyweight squat", { quads: 1, glutes: 1 }],
  ["wu-leg-swing", "Leg swing", { hamstrings: 1, glutes: 0.5 }],
  ["wu-jumping-jack", "Jumping jack", {}],
  ["wu-march-in-place", "March in place", {}],
].map(([id, name, areas]) => ({
  id: id as string,
  name: name as string,
  type: "isolation" as const,
  equipment: [],
  areas: areas as Weights,
  timed: true,
  durationS: 40,
  kind: "warmup" as const,
}));

export const L1_PLUS_IDS = DEFS.map((d) => d.id);
export const L1_PLUS_NAMES_SORTED = DEFS.map((d) => d.name).sort((a, b) => a.localeCompare(b));

export interface DetailOverride {
  instructions?: string[];
  mistakes?: string[];
  cue?: string | null;
  source?: string;
  license?: string;
  attribution?: string | null;
  source_url?: string | null;
}

const DETAILS: Record<string, DetailOverride> = {
  "back-squat": {
    instructions: ["Brace", "Sit down between your heels", "Drive up"],
    mistakes: ["Knees caving in"],
    cue: "Chest up",
  },
  "wu-cat-cow": {
    instructions: ["Round your back", "Arch your back"],
    mistakes: [],
    cue: "Move slowly",
  },
};

export interface SeedOptions {
  /** Per-exercise overrides of the how-to columns. */
  details?: Record<string, DetailOverride>;
  /** Extra or replaced exercise definitions (by id). */
  extra?: Def[];
  variants?: Array<[string, string]>;
  profile?: { level: string; equipment: string[] } | null;
}

export function exerciseRows(options: SeedOptions = {}): Row[] {
  const defs = [...DEFS, ...WARMUPS].map((d) => options.extra?.find((x) => x.id === d.id) ?? d);
  for (const extra of options.extra ?? [])
    if (!defs.some((d) => d.id === extra.id)) defs.push(extra);
  return defs
    .map((d): Row => {
      const detail = { ...DETAILS[d.id], ...options.details?.[d.id] };
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        level: d.level ?? "beginner",
        equipment: d.equipment,
        instructions: detail.instructions ?? ["Do the move"],
        mistakes: detail.mistakes ?? [],
        cue: detail.cue === undefined ? null : detail.cue,
        source: detail.source ?? "workoutlab",
        license: detail.license ?? "LicenseRef-workoutLab",
        attribution: detail.attribution ?? null,
        source_url: detail.source_url ?? null,
        kind: d.kind ?? "exercise",
        timed: d.timed ?? false,
        increment_kg: null,
        default_duration_s: d.durationS ?? null,
        external_load: false,
      };
    })
    .sort((a, b) => (a.id as string).localeCompare(b.id as string) * -1);
}

export function areaRows(options: SeedOptions = {}): Row[] {
  const defs = [...DEFS, ...WARMUPS, ...(options.extra ?? [])];
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const d of [...(options.extra ?? []), ...defs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    for (const [area, weight] of Object.entries(d.areas)) {
      rows.push({ exercise_id: d.id, area_id: area, weight });
    }
  }
  return rows.reverse();
}

export function seedSpy(spy: SelectSpy, options: SeedOptions = {}): void {
  spy.setRows("exercises", exerciseRows(options));
  spy.setRows("exercise_areas", areaRows(options));
  const variants = options.variants ?? [
    ["back-squat", "goblet-squat"],
    ["back-squat", "leg-press"],
  ];
  spy.setRows(
    "exercise_variants",
    variants.map(([exercise_id, variant_id]) => ({ exercise_id, variant_id })),
  );
  for (const table of [
    "session_sets_live",
    "sessions",
    "plan_checkins",
    "routines",
    "routine_items",
    "area_targets",
  ]) {
    spy.setRows(table, []);
  }
  const profile =
    options.profile === undefined ? { level: "beginner", equipment: FULL } : options.profile;
  spy.setRows(
    "profiles",
    profile === null
      ? []
      : [
          {
            goal: "build_muscle",
            level: profile.level,
            equipment: profile.equipment,
            rhythm_min: 3,
            rhythm_max: 4,
            priority_areas: [],
            onboarded_at: "2026-09-01T00:00:00.000Z",
            plan_changed_at: "2026-09-01T00:00:00.000Z",
          },
        ],
  );
}

export const FULL = ["dumbbell", "bench", "barbell", "rack", "cable", "machine", "pullup-bar"];
export const USER = "11111111-1111-4111-8111-111111111111";
export const TZ = "Europe/Stockholm";
export const NOW = new Date("2026-09-27T12:00:00+02:00");
