// The `/welcome/*` splat (D-0071 §2, D-0097 §1, D-0100 §1): UF-01.1 at the index and for every
// unknown sub-path, UF-01.2–.4 at `goal`, `level` and `schedule`, and `UF-01.5-save` at `save`.
// UF-01.1 is static, so it is in this chunk and renders on the first commit; the later steps
// load through `React.lazy` (principle 5).
//
// The lazy steps receive `pending-plan.ts` as a `store` prop and import it as a type only. A
// value import would make the bundler hoist the module into this chunk and export it from
// here, and the chunk would then lose its `features/UF-01/index.tsx` manifest entry (the shell's
// AC-A6 build test). The stylesheet is imported here for the same reason: every step renders
// inside this splat, so it is always loaded.
import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import * as pendingPlan from "./pending-plan.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import "./uf-01.css";

export type PendingPlanStore = typeof pendingPlan;

const GoalScreen = lazy(() => import("./GoalScreen.js").then((m) => ({ default: m.GoalScreen })));
const LevelScreen = lazy(() =>
  import("./LevelScreen.js").then((m) => ({ default: m.LevelScreen })),
);
// UF-01.4 is the only step that imports the engine (`deriveTargets`), so the engine stays out of
// this chunk too (principle 5).
const ScheduleScreen = lazy(() =>
  import("./ScheduleScreen.js").then((m) => ({ default: m.ScheduleScreen })),
);

// `/welcome/save` (T-0301c, D-0100, D-0101): the engine, the Supabase client and the profile
// recheck, so it is lazy for the same reason.
const SaveScreen = lazy(() => import("./SaveScreen.js").then((m) => ({ default: m.SaveScreen })));

export function Welcome() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<WelcomeScreen />} />
        <Route path="goal" element={<GoalScreen store={pendingPlan} />} />
        <Route path="level" element={<LevelScreen store={pendingPlan} />} />
        <Route path="schedule" element={<ScheduleScreen store={pendingPlan} />} />
        <Route path="save" element={<SaveScreen store={pendingPlan} />} />
        <Route path="*" element={<WelcomeScreen />} />
      </Routes>
    </Suspense>
  );
}
