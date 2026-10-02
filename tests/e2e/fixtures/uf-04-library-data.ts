// T-0306a e2e fixture: the L1+ library (engine L1 table + goblet-squat + leg-press, plus the 8
// warm-up moves) as the PostgREST rows the mocked Supabase serves. Mirrors
// apps/web/src/features/UF-04/__tests__/l1plus.ts (an e2e spec can't import from src).
type Row = Record<string, unknown>;
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

const DETAILS: Record<string, { instructions: string[]; mistakes: string[]; cue: string }> = {
  "back-squat": {
    instructions: ["Brace", "Sit down between your heels", "Drive up"],
    mistakes: ["Knees caving in"],
    cue: "Chest up",
  },
};

const ALL = [...DEFS, ...WARMUPS];

// Reverse alphabetical by id, so an unsorted render fails.
export const exercises: Row[] = ALL.map((d): Row => ({
  id: d.id,
  name: d.name,
  type: d.type,
  level: d.level ?? "beginner",
  equipment: d.equipment,
  instructions: DETAILS[d.id]?.instructions ?? ["Do the move"],
  mistakes: DETAILS[d.id]?.mistakes ?? [],
  cue: DETAILS[d.id]?.cue ?? null,
  source: "workoutlab",
  license: "LicenseRef-workoutLab",
  attribution: null,
  source_url: null,
  kind: d.kind ?? "exercise",
  timed: d.timed ?? false,
  increment_kg: null,
  default_duration_s: d.durationS ?? null,
  external_load: false,
})).sort((a, b) => (b.id as string).localeCompare(a.id as string));

export const exerciseAreas: Row[] = ALL.flatMap((d) =>
  Object.entries(d.areas).map(([area, weight]) => ({
    exercise_id: d.id,
    area_id: area,
    weight,
  })),
);

export const exerciseVariants: Row[] = [
  { exercise_id: "back-squat", variant_id: "goblet-squat" },
  { exercise_id: "back-squat", variant_id: "leg-press" },
];

export const profile = {
  goal: "build_muscle",
  level: "beginner",
  equipment: ["dumbbell", "bench", "barbell", "rack", "cable", "machine", "pullup-bar"],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

// T-0393 (D-0071 §10, additive): `exercises` row for row, with `external_load` true exactly when
// the row's equipment holds a loadable item (D-0044: external load = NOT bodyweight). No equipment,
// `rack`-only, `pullup-bar`-only and every warm-up stay false. `exercises` itself is unchanged.
const LOADABLE = new Set(["barbell", "dumbbell", "machine", "cable"]);
export const exercisesLoaded: Row[] = exercises.map((row): Row => ({
  ...row,
  external_load:
    row.kind === "exercise" && (row.equipment as string[]).some((item) => LOADABLE.has(item)),
}));
