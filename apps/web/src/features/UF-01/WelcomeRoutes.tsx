// The `/welcome/*` splat (D-0071 §2, D-0097 §1): UF-01.1 at the index and for every unknown
// sub-path (including `save` until T-0301c), UF-01.2–.4 at `goal`, `level` and `schedule`.
// UF-01.1 is static, so it is in this chunk and renders on the first commit; the later steps
// load through `React.lazy` (principle 5).
import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import { WelcomeScreen } from "./WelcomeScreen.js";

const GoalScreen = lazy(() => import("./GoalScreen.js").then((m) => ({ default: m.GoalScreen })));
const LevelScreen = lazy(() =>
  import("./LevelScreen.js").then((m) => ({ default: m.LevelScreen })),
);
const SchedulePlaceholder = lazy(() =>
  import("./SchedulePlaceholder.js").then((m) => ({ default: m.SchedulePlaceholder })),
);

export function Welcome() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<WelcomeScreen />} />
        <Route path="goal" element={<GoalScreen />} />
        <Route path="level" element={<LevelScreen />} />
        <Route path="schedule" element={<SchedulePlaceholder />} />
        <Route path="*" element={<WelcomeScreen />} />
      </Routes>
    </Suspense>
  );
}
