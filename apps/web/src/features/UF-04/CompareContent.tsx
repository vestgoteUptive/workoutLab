// UF-04.3 Compare body (T-0306a, D-0069 §3, D-0079 §4): two columns from data we have. The
// time per set is the engine's `setCostS`, never re-derived here (principle 3).
import { Link, Navigate, useParams } from "react-router";
import { setCostS, type LibraryExercise } from "@workoutlab/engine";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { loadLibrary } from "../../lib/offline/history.js";
import { loadExerciseDetail } from "../../lib/offline/feature-loaders.js";
import { useScreenData } from "./data.js";
import {
  equipmentText,
  formatSeconds,
  levelText,
  primaryAreaNames,
  secondaryAreaNames,
  typeText,
} from "./labels.js";
import "./uf-04.css";

interface CompareData {
  library: LibraryExercise[];
  details: Record<string, ExerciseDetail | null>;
}

function orNone(values: string[]): string {
  return values.length === 0 ? en.uf04.none : values.join(en.uf04.listSeparator);
}

export function CompareContent() {
  const { exerciseId = "", otherId = "" } = useParams();
  const { status } = useAuth();
  const key = `${exerciseId}|${otherId}`;
  const { data, pending } = useScreenData<CompareData>(
    async () => {
      const [library, first, second] = await Promise.all([
        loadLibrary(),
        loadExerciseDetail(exerciseId),
        loadExerciseDetail(otherId),
      ]);
      return { library, details: { [exerciseId]: first, [otherId]: second } };
    },
    key,
    { refresh: true, status },
  );

  if (data === undefined) return null;

  const find = (id: string) => data.library.find((e) => e.id === id && e.kind === "exercise");
  const current = find(exerciseId);
  if (current === undefined) {
    if (data.library.length === 0 && pending) return null;
    return <Navigate to="/library" replace />;
  }
  const other = otherId === exerciseId ? undefined : find(otherId);
  if (other === undefined) return <Navigate to={`/library/${exerciseId}`} replace />;

  const columns = [current, other];
  const rows: ReadonlyArray<readonly [string, (e: LibraryExercise) => string]> = [
    [en.uf04.rowPrimary, (e) => orNone(primaryAreaNames(e))],
    [en.uf04.rowSecondary, (e) => orNone(secondaryAreaNames(e))],
    [en.uf04.rowEquipment, equipmentText],
    [en.uf04.rowType, typeText],
    [en.uf04.rowLevel, levelText],
    [en.uf04.rowTime, (e) => en.uf04.perSet(formatSeconds(setCostS(e)))],
    [en.uf04.rowCue, (e) => data.details[e.id]?.cue ?? en.uf04.none],
  ];

  return (
    <>
      <table className="wl-uf04__compare">
        <caption className="wl-uf04__sr-only">{en.uf04.compareCaption}</caption>
        <thead>
          <tr>
            <td />
            {columns.map((e) => (
              <th key={e.id} scope="col">
                {e.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {columns.map((e) => (
                <td key={e.id}>{cell(e)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Link to={`/library/${other.id}`} className="wl-uf04__link">
        {en.uf04.openExercise(other.name)}
      </Link>
    </>
  );
}
