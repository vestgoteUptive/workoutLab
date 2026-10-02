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
    /** UF-01.4 heading (prototype `UF01-4-Schedule.dc.html`). */
    heading: "When can you train?",
    subtitle: "Sessions per week. A range is fine; change it any time.",
    /** The two rhythm steppers (D-0064 §4). */
    minLabel: "At least",
    maxLabel: "At most",
    perWeek: "per week",
    minUp: "One more session per week, minimum",
    minDown: "One fewer session per week, minimum",
    maxUp: "One more session per week, maximum",
    maxDown: "One fewer session per week, maximum",
    /** Read by the stepper's live region when its value changes. */
    minValueName: (n: string) => `At least ${n} sessions per week`,
    maxValueName: (n: string) => `At most ${n} sessions per week`,
    /** The plan card (D-0064 §5). */
    planTag: "Your plan",
    /** "Beginner · Full gym" under the goal. */
    planSub: (level: string, equipment: string) => `${level} · ${equipment}`,
    /** "3–4 per week · 6–8 per 14 days"; one number when min equals max. */
    rhythmLine: (min: number, max: number) =>
      min === max
        ? `${min} per week · ${2 * min} per 14 days`
        : `${min}–${max} per week · ${2 * min}–${2 * max} per 14 days`,
    targetsHeading: "Hard sets per 14 days",
    save: "Save my plan",
  },

  /** UF-01.5 Account (T-0301c). The auth texts themselves are `en.auth.*`, never copied here. */
  account: {
    /** The `<h1>` with a saveable pending plan (D-0098 §2). */
    headingSave: "Save your plan",
    /** The `<h1>` without one. */
    headingSignIn: "Sign in",
    subtitleSave: "Sign in to keep your plan. We'll email you a link and a 6-digit code.",
    subtitleSignIn: "We'll email you a link and a 6-digit code.",
    /** Accessible name of the two-tab list. */
    modesName: "How to sign in",
    or: "or",
    google: "Continue with Google",
    /** D-0064 §10. */
    privacy: "Privacy",
  },

  /** `/auth/callback`'s expired state, when a saveable plan is on this device (T-0301c AC-4). */
  callback: {
    planKept: "Your plan is still saved on this device.",
  },

  /** `/welcome/save`, screen `UF-01.5-save` (D-0100). */
  save: {
    heading: "Save your plan",
    saving: "Saving your plan…",
    offline: "Connect to save your plan",
    error: "Couldn't save your plan. Try again.",
    retry: "Retry",
    /** D-0100 §2: signed in, with no saveable plan on this device. */
    noPlanHeading: "Set up your plan",
    noPlanBody: "Your answers aren't on this device. It takes under a minute.",
    noPlanLink: "Set up my plan",
  },
} as const;
