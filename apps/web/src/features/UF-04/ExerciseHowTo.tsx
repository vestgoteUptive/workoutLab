// The in-workout how-to dialog (T-0306a, D-0069 §4, D-0079 §6). It renders inside UF-09, so it
// reads the cache only (no refresh, no supabase-js, no fetch), holds no link out of the session
// (principle 1) and owns exactly one control: Close.
import { useEffect, useId, useRef } from "react";
import type { LibraryExercise } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { loadExerciseDetail, loadLibrary, type ExerciseDetail } from "../../lib/offline/index.js";
import { useScreenData } from "./data.js";
import { HowToBody } from "./HowToBody.js";
import "./how-to.css";

export interface ExerciseHowToProps {
  exerciseId: string;
  onClose(): void;
}

interface HowToData {
  exercise: LibraryExercise | undefined;
  detail: ExerciseDetail | null;
}

export function ExerciseHowTo({ exerciseId, onClose }: ExerciseHowToProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const { data } = useScreenData<HowToData>(
    async () => {
      const [library, detail] = await Promise.all([loadLibrary(), loadExerciseDetail(exerciseId)]);
      return { exercise: library.find((e) => e.id === exerciseId), detail };
    },
    exerciseId,
    { refresh: false },
  );

  // Focus moves in on mount; on unmount it goes back to whatever had it, if that is still there.
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        // The dialog's only control is Close: keep focus inside (aria-modal).
        event.preventDefault();
        closeRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const title =
    data?.exercise === undefined ? en.uf04.howToTitle : en.uf04.howToNamed(data.exercise.name);

  return (
    <div className="wl-uf04-howto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="wl-uf04-howto__panel"
      >
        <h2 id={titleId}>{title}</h2>
        {data === undefined ? null : data.detail === null ? (
          <p>{en.uf04.detailMissing}</p>
        ) : (
          <HowToBody detail={data.detail} />
        )}
        <button type="button" className="wl-uf04-howto__close" ref={closeRef} onClick={onClose}>
          {en.uf04.close}
        </button>
      </div>
    </div>
  );
}
