// UF-01 strings (D-0071 §1). Owned by the UF-01 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
//
// The goal labels live here and are not shared with `flows/uf-11.ts` (T-0301b; T-0342 decides
// about sharing them later).
export const uf01 = {
  /** The app name on UF-01.1 (never "[APP NAME]"). */
  appName: "workout LAB",

  /** Back link on UF-01.2 and UF-01.3. */
  back: "Back",
  continue: "Continue",
  /** Accessible name of the step progress, e.g. "Step 1 of 3". */
  progressName: (step: string, total: string) => `Step ${step} of ${total}`,

  welcome: {
    /** The `<h1>`, shown on two lines (prototype `UF01-1-Welcome.dc.html`). */
    headingLine1: "Train with a plan.",
    headingLine2: "Log in seconds.",
    subtitle:
      "A plan built for your goal, and every exercise explained: muscles, cues and variations.",
    getStarted: "Get started",
    haveAccount: "I already have an account",
  },

  goal: {
    heading: "What's your main goal?",
    subtitle: "Sets your rep ranges. Change it any time.",
    options: {
      build_muscle: { label: "Build muscle", hint: "Hypertrophy · 6–12 reps" },
      get_stronger: { label: "Get stronger", hint: "Strength · 3–8 reps · longer rest" },
      general_fitness: { label: "General fitness", hint: "Balanced · 8–15 reps" },
    },
  },

  level: {
    heading: "Your level & equipment",
    levelLegend: "Training experience",
    levels: {
      beginner: {
        label: "Beginner",
        hint: "Under 6 months. We start with form-first variations like the goblet squat.",
      },
      intermediate: {
        label: "Intermediate",
        hint: "6 months to 2 years. Barbell basics plus targeted accessories.",
      },
      advanced: {
        label: "Advanced",
        hint: "2+ years. Higher volume and advanced progression schemes.",
      },
    },
    equipmentLegend: "Where do you train?",
    equipment: {
      bodyweight: "Bodyweight",
      dumbbells: "Dumbbells",
      "full-gym": "Full gym",
    },
    equipmentHint: "We only suggest exercises you can do with this equipment.",
  },

  schedule: {
    /** UF-01.4 placeholder heading (T-0301d builds the screen). */
    heading: "When can you train?",
  },
} as const;
