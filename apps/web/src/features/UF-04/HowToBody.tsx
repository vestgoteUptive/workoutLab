// The cue and numbered instructions, shared by UF-04.2 and the in-workout sheet. The steps are
// `.wl-row`s numbered by CSS, so the list is still an ordered list with the same text.
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { en } from "../../lib/i18n/en.js";
import "./how-to.css";

export function HowToBody({ detail }: { detail: ExerciseDetail }) {
  return (
    <>
      {detail.cue === null ? null : (
        <section className="wl-uf04-cue">
          <h2 className="wl-type-label">{en.uf04.cue}</h2>
          <p data-field="cue" className="wl-type-body">
            {detail.cue}
          </p>
        </section>
      )}
      <section className="wl-uf04-steps-section">
        <h2 className="wl-type-label">{en.uf04.instructions}</h2>
        {/* role="list": Safari drops list semantics once list-style is none. */}
        <ol className="wl-uf04-steps" role="list">
          {detail.instructions.map((step, index) => (
            <li key={index} className="wl-row wl-type-body">
              {step}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
