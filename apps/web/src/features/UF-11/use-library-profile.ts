// T-0582 UF-11.5/11.6: live reads of the library and profile caches, so a cold direct load fills in
// when refreshAll lands instead of staying empty until a reload.
import type { EngineProfile, LibraryExercise } from "@workoutlab/shared";
import { loadLibrary, loadProfile } from "../../lib/offline/index.js";
import { useLive } from "../../lib/offline/exercise-list-hooks.js";

const NO_LIBRARY: LibraryExercise[] = [];
const readLibrary = (): Promise<LibraryExercise[]> => loadLibrary().catch(() => NO_LIBRARY);
const readProfile = (): Promise<EngineProfile | null> => loadProfile().catch(() => null);

export function useLibraryProfile(userId: string | null | undefined): {
  library: LibraryExercise[];
  profile: EngineProfile | null;
  loaded: boolean;
} {
  const lib = useLive(userId, readLibrary, NO_LIBRARY);
  const prof = useLive<EngineProfile | null>(userId, readProfile, null);
  return { library: lib.value, profile: prof.value, loaded: lib.loaded && prof.loaded };
}
