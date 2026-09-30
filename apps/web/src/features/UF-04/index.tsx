// UF-04 Library (T-0306a). Exports exactly `Library`, `LibraryDetail`, `Compare` and
// `ExerciseHowTo` (D-0071 §3). `ExerciseHowTo` lives in its own module so the UF-09 chunk that
// imports it doesn't pull in the browse screens' code.
import { en } from "../../lib/i18n/en.js";
import { CompareContent } from "./CompareContent.js";

export { Library } from "./Library.js";
export { LibraryDetail } from "./LibraryDetail.js";
export { ExerciseHowTo } from "./ExerciseHowTo.js";

export function Compare() {
  return (
    <div data-screen-id="UF-04.3" className="wl-uf04">
      <h1>{en.screens.libraryCompare}</h1>
      <CompareContent />
    </div>
  );
}
