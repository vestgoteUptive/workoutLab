// UF-05 strings (D-0071 §1). Owned by the UF-05 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
// The equipment labels are a copy of `flows/uf-04.ts` (D-0079 §5 allows it; T-0341 moves them
// to a shared module later).
export const uf05 = {
  /** The seam button on UF-09.9 Paused and UF-09.6 Next exercise (T-0422, D-0071 §4). */
  swapAction: "Swap",
  title: (name: string) => `Replace ${name}`,
  titleFallback: "Replace exercise",
  chipsLabel: "Reason",
  chips: {
    best: "Best match",
    equipment_taken: "Equipment taken",
    discomfort: "Discomfort",
    variety: "Variety",
    short_on_time: "Short on time",
  },
  replacementLabel: "Replacement",
  muscleMatch: (percent: number) => `${percent} % muscle match`,
  minutes: (m: number) => `${m} min`,
  bodyweight: "Bodyweight",
  listSeparator: ", ",
  equipment: {
    dumbbell: "Dumbbell",
    bench: "Bench",
    barbell: "Barbell",
    rack: "Rack",
    cable: "Cable",
    machine: "Machine",
    "pullup-bar": "Pull-up bar",
    kettlebell: "Kettlebell",
    band: "Band",
  },
  tagBestMatch: "Best match",
  tagOverTime: "Over your time",
  use: (name: string) => `Use ${name}`,
  close: "Close",
  loading: "Loading alternatives…",
  empty: "No alternatives fit your equipment",
  loadFailed: "Couldn't load alternatives.",
  retry: "Try again",
  saveFailed: "Couldn't save the swap. Try again.",
  swapFailed: "Couldn't swap to that exercise.",
} as const;
