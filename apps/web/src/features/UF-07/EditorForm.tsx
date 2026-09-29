// The form of UF-07.1: name, ordered list, in-screen picker (D-0081 §6), the read-only
// progression card, and Save / Cancel / Delete. State styling lives in routine-editor.css,
// keyed on data attributes and `:disabled`, so nothing here overrides the focus ring.
import { useEffect, useRef, type FormEvent } from "react";
import { en } from "../../lib/i18n/en.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { type RoutineEditorState } from "./use-routine-editor.js";

export function EditorForm({ editor }: { editor: RoutineEditorState }) {
  const t = en.uf07;
  const searchRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const wasPickerOpen = useRef(false);
  const wasConfirmOpen = useRef(false);

  const { pickerOpen, confirmOpen } = editor;
  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
    else if (wasPickerOpen.current) addRef.current?.focus();
    wasPickerOpen.current = pickerOpen;
  }, [pickerOpen]);
  useEffect(() => {
    if (confirmOpen) keepRef.current?.focus();
    else if (wasConfirmOpen.current) deleteRef.current?.focus();
    wasConfirmOpen.current = confirmOpen;
  }, [confirmOpen]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void editor.save();
  };

  const last = editor.items.length - 1;
  const inList = new Set(editor.items);

  return (
    <form
      className="wl-routine-editor__form"
      data-region="routine-form"
      aria-label={en.screens.routineEditor}
      onSubmit={onSubmit}
      noValidate
    >
      <div className="wl-routine-editor__field">
        <label htmlFor="wl-routine-name">{t.nameLabel}</label>
        <input
          id="wl-routine-name"
          type="text"
          autoComplete="off"
          value={editor.name}
          aria-invalid={!editor.nameValid}
          aria-describedby={editor.nameValid ? undefined : "wl-routine-name-hint"}
          onChange={(event) => editor.setName(event.target.value)}
        />
        {editor.nameValid ? null : (
          <p id="wl-routine-name-hint" className="wl-routine-editor__hint" data-tone="warn">
            {t.nameInvalid}
          </p>
        )}
      </div>

      <section aria-labelledby="wl-routine-exercises">
        <h2 id="wl-routine-exercises">{t.exercisesHeading}</h2>
        {editor.items.length === 0 ? <p className="wl-routine-editor__hint">{t.emptyList}</p> : null}
        <ol ref={editor.listRef} className="wl-routine-editor__list">
          {editor.items.map((exerciseId, index) => {
            const label = editor.nameOf(exerciseId);
            return (
              <li key={exerciseId} className="wl-routine-editor__row" data-exercise={exerciseId}>
                <span className="wl-routine-editor__row-name">{t.rowLabel(index + 1, label)}</span>
                <button
                  type="button"
                  data-move="up"
                  aria-label={t.moveUp(label)}
                  disabled={index === 0}
                  onClick={() => editor.move(index, "up")}
                >
                  {t.glyphUp}
                </button>
                <button
                  type="button"
                  data-move="down"
                  aria-label={t.moveDown(label)}
                  disabled={index === last}
                  onClick={() => editor.move(index, "down")}
                >
                  {t.glyphDown}
                </button>
                <button
                  type="button"
                  aria-label={t.remove(label)}
                  onClick={() => editor.remove(index)}
                >
                  {t.glyphRemove}
                </button>
              </li>
            );
          })}
        </ol>
        <div role="status" aria-live="polite" className="wl-routine-editor__live">
          {editor.announcement}
        </div>

        {pickerOpen ? (
          <div className="wl-routine-editor__picker" data-region="picker">
            <label htmlFor="wl-routine-search">{t.searchLabel}</label>
            <input
              id="wl-routine-search"
              ref={searchRef}
              type="text"
              autoComplete="off"
              value={editor.query}
              onChange={(event) => editor.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
            {editor.full ? <p className="wl-routine-editor__hint">{t.limitReached}</p> : null}
            {editor.pickerRows.length === 0 ? (
              <p className="wl-routine-editor__hint">{t.noMatch(editor.query.trim())}</p>
            ) : (
              <ul className="wl-routine-editor__matches">
                {editor.pickerRows.map((exercise) => (
                  <li key={exercise.id} className="wl-routine-editor__row">
                    <span className="wl-routine-editor__row-name">{exercise.name}</span>
                    {inList.has(exercise.id) ? (
                      <button type="button" disabled>
                        {t.alreadyAdded}
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={t.add(exercise.name)}
                        disabled={editor.full}
                        onClick={() => editor.add(exercise.id)}
                      >
                        {t.glyphAdd}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => editor.setPickerOpen(false)}>
              {t.done}
            </button>
          </div>
        ) : (
          <button ref={addRef} type="button" onClick={() => editor.setPickerOpen(true)}>
            {t.addExercise}
          </button>
        )}
      </section>

      <div className="wl-routine-editor__card" data-card="progression">
        <p>{t.progression}</p>
      </div>

      {editor.error ? (
        <p role="alert" className="wl-routine-editor__error" data-tone="error">
          {editor.error === "save" ? t.saveFailed : t.deleteFailed}
        </p>
      ) : null}

      <OfflineStatus variant="text" />
      {editor.online ? null : <p className="wl-routine-editor__hint">{t.connectToSave}</p>}

      <div className="wl-routine-editor__actions">
        <button type="submit" data-variant="primary" disabled={!editor.canSave}>
          {t.save}
        </button>
        <button type="button" onClick={editor.cancel}>
          {t.cancel}
        </button>
        {editor.isNew ? null : (
          <button
            ref={deleteRef}
            type="button"
            data-variant="danger"
            disabled={!editor.online}
            onClick={() => editor.setConfirmOpen(true)}
          >
            {t.deleteRoutine}
          </button>
        )}
      </div>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wl-routine-delete-title"
          className="wl-routine-editor__dialog"
          onKeyDown={(event) => {
            if (event.key === "Escape") editor.setConfirmOpen(false);
          }}
        >
          <h2 id="wl-routine-delete-title">{t.deleteTitle(editor.loadedName)}</h2>
          <button
            type="button"
            data-variant="danger"
            disabled={!editor.online}
            onClick={() => void editor.confirmDelete()}
          >
            {t.confirmDelete}
          </button>
          <button ref={keepRef} type="button" onClick={() => editor.setConfirmOpen(false)}>
            {t.keepRoutine}
          </button>
        </div>
      ) : null}
    </form>
  );
}
