// The cue and numbered instructions, shared by UF-04.2 and the in-workout dialog.
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { en } from "../../lib/i18n/en.js";

export function HowToBody({ detail }: { detail: ExerciseDetail }) {
  return (
    <>
      {detail.cue === null ? null : (
        <section>
          <h2>{en.uf04.cue}</h2>
          <p data-field="cue">{detail.cue}</p>
        </section>
      )}
      <section>
        <h2>{en.uf04.instructions}</h2>
        <ol>
          {detail.instructions.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>
    </>
  );
}
