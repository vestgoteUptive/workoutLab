// UF-04.2 Exercise detail (T-0306a, D-0069 §2, D-0079 §3–§5). Renders from the cache; the
// library row alone is enough for the header, so a missing detail never redirects.
import { Link, Navigate, useParams } from "react-router";
import type { LibraryExercise } from "@workoutlab/engine";
import { AREAS, type Area } from "@workoutlab/shared";
import { BodyFigure, type RegionStyle } from "../../components/body-figure/index.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { loadExerciseDetail, loadVariants } from "../../lib/offline/feature-loaders.js";
import { loadLibrary } from "../../lib/offline/history.js";
import { DetailActions } from "./DetailActions.js";
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
  const { status } = useAuth();
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
    { refresh: true, status },
  );

  if (data === undefined)
    return <div data-screen-id="UF-04.2" data-wl-state="plan" className="wl-page wl-uf04-detail" />;

  const exercise = data.library.find((e) => e.id === exerciseId);
  if (exercise === undefined || exercise.kind !== "exercise") {
    // A first-ever visit on a bad or early URL waits for the first download before deciding.
    if (data.library.length === 0 && pending) {
      return (
        <div data-screen-id="UF-04.2" data-wl-state="plan" className="wl-page wl-uf04-detail" />
      );
    }
    return <Navigate to="/library" replace />;
  }

  const variants = data.variants
    .map((id) => data.library.find((e) => e.id === id && e.kind === "exercise"))
    .filter((e): e is LibraryExercise => e !== undefined);
  const primary = primaryAreaNames(exercise);
  const secondary = secondaryAreaNames(exercise);
  const detail = data.detail;
  // The figure is driven by `exercise.areas` only: 1.0 solid, 0.5 hatched, absent neutral.
  const regions: Partial<Record<Area, RegionStyle>> = {};
  for (const a of AREAS) {
    const w = exercise.areas[a];
    if (w === 1) regions[a] = { fill: "primary" };
    else if (w === 0.5) regions[a] = { fill: "secondary" };
  }
  const hasAreas = primary.length + secondary.length > 0;

  return (
    <div data-screen-id="UF-04.2" data-wl-state="plan" className="wl-page wl-uf04-detail">
      <h1 className="wl-type-page-title wl-title--stop">{exercise.name}</h1>
      <p data-field="tagline" className="wl-type-label wl-uf04-detail__tagline">
        {tagLine(exercise)}
      </p>
      {hasAreas ? (
        <section className="wl-uf04-detail__figure" data-field="figure-card">
          <BodyFigure regions={regions} size="detail" />
          <div className="wl-uf04-detail__areas">
            {primary.length === 0 ? null : (
              <div className="wl-uf04-detail__group">
                <div className="wl-uf04-detail__legend">
                  <span className="wl-type-label">{en.uf04.primaryLabel}</span>
                  <span
                    className="wl-uf04-detail__swatch wl-uf04-detail__swatch--primary"
                    aria-hidden="true"
                  />
                </div>
                <ul className="wl-uf04-detail__pills" aria-label={en.uf04.primaryAreas}>
                  {primary.map((name) => (
                    <li key={name} data-weight="primary" className="wl-uf04-detail__pill">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {secondary.length === 0 ? null : (
              <div className="wl-uf04-detail__group">
                <div className="wl-uf04-detail__legend">
                  <span className="wl-type-label">{en.uf04.secondaryLabel}</span>
                  <span
                    className="wl-uf04-detail__swatch wl-uf04-detail__swatch--secondary"
                    aria-hidden="true"
                  />
                </div>
                <ul className="wl-uf04-detail__pills" aria-label={en.uf04.secondaryAreas}>
                  {secondary.map((name) => (
                    <li key={name} data-weight="secondary" className="wl-uf04-detail__pill">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      ) : null}
      {detail === null ? (
        <p className="wl-type-body">{en.uf04.detailMissing}</p>
      ) : (
        <>
          <HowToBody detail={detail} />
          {detail.mistakes.length === 0 ? null : (
            <section className="wl-uf04-detail__section">
              <h2 className="wl-type-label">{en.uf04.mistakes}</h2>
              <ul className="wl-uf04-detail__list">
                {detail.mistakes.map((m, index) => (
                  <li key={index} className="wl-row wl-type-body">
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {variants.length === 0 ? null : (
            <section className="wl-uf04-detail__section">
              <h2 className="wl-type-label">{en.uf04.variations}</h2>
              <ul className="wl-uf04-detail__list">
                {variants.map((v) => (
                  <li key={v.id}>
                    <Link
                      to={`/library/${exercise.id}/compare/${v.id}`}
                      className="wl-row wl-type-row-title"
                    >
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
      <DetailActions exerciseId={exercise.id} name={exercise.name} />
      <Link to={`/progress/${exercise.id}`} className="wl-button--text wl-uf04-detail__history">
        {en.uf04.myHistory}
      </Link>
    </div>
  );
}
