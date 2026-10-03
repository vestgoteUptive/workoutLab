// UF-02 Today (T-0302a) / UF-02.2 Workout preview (T-0302b, D-0168 §3). The public surface of
// this feature is exactly `Today` (AC-13, D-0071 §3): it is a small switch on `?view=`, so
// `Today.tsx` itself is never edited (it stays free for T-0395). `/?view=preview` renders the
// preview; every other value, including none, renders UF-02.1 as it always has.
import { useSearchParams } from "react-router";
import { Today as TodayScreen, type TodayProps } from "./Today.js";
import { WorkoutPreview } from "./Preview.js";

export function Today(props: TodayProps = {}) {
  const [searchParams] = useSearchParams();
  if (searchParams.get("view") === "preview") return <WorkoutPreview {...props} />;
  return <TodayScreen {...props} />;
}
