// UF-04 Library stubs (T-0300a). The feature ticket builds the designed screens.
import { useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";

export function Library() {
  return (
    <div data-screen-id="UF-04.1">
      <h1>{en.screens.library}</h1>
    </div>
  );
}

export function LibraryDetail() {
  const { exerciseId } = useParams();
  return (
    <div data-screen-id="UF-04.2">
      <h1>{en.screens.libraryDetail}</h1>
      <p>{exerciseId}</p>
    </div>
  );
}

// UF-04.3 Compare variants stub (T-0318). T-0306a builds the screen.
export function Compare() {
  const { exerciseId, otherId } = useParams();
  return (
    <div data-screen-id="UF-04.3">
      <h1>{en.screens.libraryCompare}</h1>
      <p>{exerciseId}</p>
      <p>{otherId}</p>
    </div>
  );
}
