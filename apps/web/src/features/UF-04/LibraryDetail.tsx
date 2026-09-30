// UF-04.2 Exercise detail (T-0306a, D-0069 §2, D-0079 §3–§5). Renders from the cache; the
// library row alone is enough for the header, so a missing detail never redirects.
import { Link, Navigate, useParams } from "react-router";
import type { LibraryExercise } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { loadExerciseDetail, loadVariants } from "../../lib/offline/feature-loaders.js";
import { loadLibrary } from "../../lib/offline/history.js";
import { Attribution } from "./Attribution.js";
import { useScreenData } from "./data.js";
import { HowToBody } from "./HowToBody.js";
import { primaryAreaNames, secondaryAreaNames, tagLine } from "./labels.js";
import "./uf-04.css";

interface DetailData {
  library: LibraryExercise[];
  detail: ExerciseDetail | null;
  variants: string[];
}

export function LibraryDetail() {
  const { exerciseId = "" } = useParams();
  const { data, pending } = useScreenData<DetailData>(
    async () => {
      const [library, detail, variants] = await Promise.all([
        loadLibrary(),
        loadExerciseDetail(exerciseId),
        loadVariants(exerciseId),
      ]);
      return { library, detail, variants };
    },
    exerciseId,
    { refresh: true },
  );

  if (data === undefined) return <div data-screen-id="UF-04.2" className="wl-uf04" />;

  const exercise = data.library.find((e) => e.id === exerciseId);
  if (exercise === undefined || exercise.kind !== "exercise") {
    // A first-ever visit on a bad or early URL waits for the first download before deciding.
    if (data.library.length === 0 && pending) {
      return <div data-screen-id="UF-04.2" className="wl-uf04" />;
    }
    return <Navigate to="/library" replace />;
  }

  const variants = data.variants
    .map((id) => data.library.find((e) => e.id === id && e.kind === "exercise"))
    .filter((e): e is LibraryExercise => e !== undefined);
  const primary = primaryAreaNames(exercise);
  const secondary = secondaryAreaNames(exercise);
  const detail = data.detail;

  return (
    <div data-screen-id="UF-04.2" className="wl-uf04">
      <h1>{exercise.name}</h1>
      <p data-field="tagline">{tagLine(exercise)}</p>
      <ul className="wl-uf04__pills" aria-label={en.uf04.primaryAreas}>
        {primary.map((name) => (
          <li key={name} data-weight="primary" className="wl-uf04__pill">
            {name}
          </li>
        ))}
      </ul>
      {secondary.length === 0 ? null : (
        <ul className="wl-uf04__pills" aria-label={en.uf04.secondaryAreas}>
          {secondary.map((name) => (
            <li key={name} data-weight="secondary" className="wl-uf04__pill">
              {name}
            </li>
          ))}
        </ul>
      )}
      {detail === null ? (
        <p>{en.uf04.detailMissing}</p>
      ) : (
        <>
          <HowToBody detail={detail} />
          {detail.mistakes.length === 0 ? null : (
            <section>
              <h2>{en.uf04.mistakes}</h2>
              <ul>
                {detail.mistakes.map((m, index) => (
                  <li key={index}>{m}</li>
                ))}
              </ul>
            </section>
          )}
          {variants.length === 0 ? null : (
            <section>
              <h2>{en.uf04.variations}</h2>
              <ul className="wl-uf04__list">
                {variants.map((v) => (
                  <li key={v.id}>
                    <Link to={`/library/${exercise.id}/compare/${v.id}`} className="wl-uf04__row">
                      {v.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Attribution detail={detail} />
        </>
      )}
      <Link to={`/progress/${exercise.id}`} className="wl-uf04__link">
        {en.uf04.myHistory}
      </Link>
    </div>
  );
}
