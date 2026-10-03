// UF-07.1 Routine editor (T-0308a, D-0070 §1–§2, D-0081 §4–§6). `RoutineEditor` backs both
// `/plan/routines/new` and `/plan/routines/:routineId`. The heading is rendered here, on the
// first render in every state, so the host and its <h1> never wait on IndexedDB (T-0318).
import { Link, useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { EditorForm } from "./EditorForm.js";
import { useRoutineEditor } from "./use-routine-editor.js";
import "./routine-editor.css";

export function RoutineEditor() {
  const { routineId } = useParams();
  const editor = useRoutineEditor(routineId);
  return (
    <div data-screen-id="UF-07.1" className="wl-routine-editor">
      <h1>{en.screens.routineEditor}</h1>
      {editor.loadFailed ? (
        <>
          <p role="alert">{en.uf07.loadFailed}</p>
          <Link to="/plan">{en.uf07.backToPlan}</Link>
        </>
      ) : null}
      {editor.ready ? <EditorForm editor={editor} /> : null}
    </div>
  );
}
