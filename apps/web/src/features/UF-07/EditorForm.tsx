// The form of UF-07.1: name, ordered list, in-screen picker (D-0081 §6), the read-only
// progression card, and Save / Cancel / Delete. State styling lives in routine-editor.css,
// keyed on data attributes and `[aria-disabled]`, so nothing here overrides the focus ring.
import { useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { en } from "../../lib/i18n/en.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { type RoutineEditorState } from "./use-routine-editor.js";

export function EditorForm({ editor }: { editor: RoutineEditorState }) {
  const t = en.uf07;
  const searchRef = useRef<HTMLInputElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
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

  // D-0164 §4: Delete goes disabled offline. A disabled button can't keep focus (Chromium drops
  // it to <body>, where the Tab trap never sees the key), so it moves to Keep routine.
  const { online } = editor;
  useLayoutEffect(() => {
    if (!confirmOpen || online) return;
    const at = document.activeElement;
    if (at === confirmBtnRef.current || at === document.body || at === null) {
      keepRef.current?.focus();
    }
  }, [confirmOpen, online]);

  // D-0162 §4: the button that was pressed has left the DOM or gone disabled, so focus is put
  // on a control that is still there. The `items` dependency is the re-render after the change.
  const { items, afterChange } = editor;
  useLayoutEffect(() => {
    const change = afterChange.current;
    if (!change) return;
    afterChange.current = null;
    if (change.kind === "add") {
      searchRef.current?.focus();
      return;
    }
    const removes = Array.from(
      editor.listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-action='remove']") ??
        [],
    );
    const target = removes[Math.min(change.index, removes.length - 1)];
    (target ?? searchRef.current ?? addRef.current)?.focus();
  }, [items, afterChange, editor.listRef]);

  // D-0162 §5: Tab and Shift+Tab cycle the dialog's enabled buttons.
  const trapTab = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const enabled = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => !b.disabled);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
    // From no enabled button (the dialog itself, or <body>): Tab -> first, Shift+Tab -> last.
    const next =
      at === -1
        ? event.shiftKey
          ? enabled.length - 1
          : 0
        : (at + (event.shiftKey ? -1 : 1) + enabled.length) % enabled.length;
    enabled[next]?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor.canSave) return;
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
      <div className="wl-routine-editor__field" inert={confirmOpen}>
        <label htmlFor="wl-routine-name">{t.nameLabel}</label>
        <input
          id="wl-routine-name"
          className="wl-input"
          type="text"
          autoComplete="off"
          value={editor.name}
          aria-invalid={!editor.nameValid}
          aria-describedby={editor.nameValid ? undefined : "wl-routine-name-hint"}
          onChange={(event) => editor.setName(event.target.value)}
        />
        {editor.nameValid ? null : (
          <p
            id="wl-routine-name-hint"
            className="wl-routine-editor__hint wl-input__error"
            data-tone="warn"
          >
            {t.nameInvalid}
          </p>
        )}
      </div>

      <section aria-labelledby="wl-routine-exercises" inert={confirmOpen}>
        <h2 id="wl-routine-exercises">{t.exercisesHeading}</h2>
        {editor.items.length === 0 ? (
          <p className="wl-routine-editor__hint">{t.emptyList}</p>
        ) : null}
        <ol ref={editor.listRef} className="wl-routine-editor__list">
          {editor.items.map((exerciseId, index) => {
            const label = editor.nameOf(exerciseId);
            return (
              <li
                key={exerciseId}
                className="wl-row wl-routine-editor__row"
                data-exercise={exerciseId}
              >
                <span className="wl-routine-editor__row-name">{t.rowLabel(index + 1, label)}</span>
                <button
                  type="button"
                  className="wl-routine-editor__icon"
                  data-move="up"
                  aria-label={t.moveUp(label)}
                  aria-disabled={index === 0 ? "true" : undefined}
                  onClick={() => {
                    if (index === 0) return;
                    editor.move(index, "up");
                  }}
                >
                  <span aria-hidden="true">{t.glyphUp}</span>
                </button>
                <button
                  type="button"
                  className="wl-routine-editor__icon"
                  data-move="down"
                  aria-label={t.moveDown(label)}
                  aria-disabled={index === last ? "true" : undefined}
                  onClick={() => {
                    if (index === last) return;
                    editor.move(index, "down");
                  }}
                >
                  <span aria-hidden="true">{t.glyphDown}</span>
                </button>
                <button
                  type="button"
                  className="wl-routine-editor__icon"
                  data-action="remove"
                  aria-label={t.remove(label)}
                  onClick={() => editor.remove(index)}
                >
                  <span aria-hidden="true">{t.glyphRemove}</span>
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
              className="wl-input"
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
            {editor.libraryEmpty ? (
              <p className="wl-routine-editor__hint">{t.libraryEmpty}</p>
            ) : editor.pickerRows.length === 0 ? (
              <p className="wl-routine-editor__hint">{t.noMatch(editor.query.trim())}</p>
            ) : (
              <ul className="wl-routine-editor__matches">
                {editor.pickerRows.map((exercise) => (
                  <li key={exercise.id} className="wl-row wl-routine-editor__row">
                    <span className="wl-routine-editor__row-name">{exercise.name}</span>
                    {inList.has(exercise.id) ? (
                      <button type="button" className="wl-button--text" disabled>
                        {t.alreadyAdded}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="wl-routine-editor__icon"
                        aria-label={t.add(exercise.name)}
                        disabled={editor.full}
                        onClick={() => editor.add(exercise.id)}
                      >
                        <span aria-hidden="true">{t.glyphAdd}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="wl-button--text"
              onClick={() => editor.setPickerOpen(false)}
            >
              {t.done}
            </button>
          </div>
        ) : (
          <button
            ref={addRef}
            type="button"
            className="wl-button--text"
            onClick={() => editor.setPickerOpen(true)}
          >
            {t.addExercise}
          </button>
        )}
      </section>

      <div className="wl-routine-editor__card" data-card="progression" inert={confirmOpen}>
        <p>{t.progression}</p>
      </div>

      {editor.error ? (
        <p role="alert" className="wl-routine-editor__error" data-tone="error">
          {editor.error === "save" ? t.saveFailed : t.deleteFailed}
        </p>
      ) : null}

      <OfflineStatus variant="text" />
      {editor.online ? null : (
        <p id="wl-routine-save-reason" className="wl-routine-editor__hint">
          {t.connectToSave}
        </p>
      )}

      <div className="wl-routine-editor__actions" inert={confirmOpen}>
        <button
          type="submit"
          className="wl-button--primary"
          aria-disabled={editor.canSave ? undefined : "true"}
          aria-describedby={
            editor.canSave
              ? undefined
              : !editor.online
                ? "wl-routine-save-reason"
                : !editor.nameValid
                  ? "wl-routine-name-hint"
                  : undefined
          }
        >
          {t.save}
        </button>
        <button type="button" className="wl-button--text" onClick={editor.cancel}>
          {t.cancel}
        </button>
        {editor.isNew ? null : (
          <button
            ref={deleteRef}
            type="button"
            className="wl-button--secondary"
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
          tabIndex={-1}
          aria-labelledby="wl-routine-delete-title"
          className="wl-routine-editor__dialog"
          onKeyDown={(event) => {
            if (event.key === "Escape") editor.setConfirmOpen(false);
            else trapTab(event);
          }}
        >
          <h2 id="wl-routine-delete-title">{t.deleteTitle(editor.loadedName)}</h2>
          <button
            ref={confirmBtnRef}
            type="button"
            className="wl-button--secondary"
            data-variant="danger"
            disabled={!editor.online}
            onClick={() => void editor.confirmDelete()}
          >
            {t.confirmDelete}
          </button>
          <button
            ref={keepRef}
            type="button"
            className="wl-button--text"
            onClick={() => editor.setConfirmOpen(false)}
          >
            {t.keepRoutine}
          </button>
        </div>
      ) : null}
    </form>
  );
}
