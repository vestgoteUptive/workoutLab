// UF-04.2 "Don't suggest this" / "Suggest again" (T-0541, D-0199 §10). The state follows the
// device cache, which the write helpers change only after the server confirms. Offline: the
// button is aria-disabled with one description line. A warm-up never reaches this screen (the
// detail redirects), and the helper refuses it anyway.
import { useId, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { currentUserId } from "../../lib/offline/current-user.js";
import { excludeExercise, includeExercise } from "../../lib/offline/excluded.js";
import { useExcludedList, useOnline } from "../../lib/offline/excluded-hooks.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";

export function ExcludeControl({
  exerciseId,
  name,
  onStatus,
}: {
  exerciseId: string;
  name: string;
  /** The shared status line under the action row (T-0568, D-0202 §9). */
  onStatus: (message: string) => void;
}) {
  const userId = currentUserId();
  const online = useOnline();
  const { ids, loaded } = useExcludedList(userId);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const favorites = useFavoriteList(userId);
  const offlineId = useId();
  const excluded = ids.includes(exerciseId);
  const disabled = !online || pending || !loaded || !favorites.loaded || userId === null;

  async function onClick() {
    if (disabled || userId === null) return;
    setFailed(false);
    setPending(true);
    try {
      if (excluded) {
        await includeExercise(userId, exerciseId);
        onStatus(en.uf04.announceIncluded(name));
      } else {
        const wasFavorite = favorites.ids.includes(exerciseId);
        await excludeExercise(userId, exerciseId);
        onStatus(
          wasFavorite ? en.uf04.announceExcludedMoved(name) : en.uf04.announceExcluded(name),
        );
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="wl-uf04__exclude">
      {excluded ? (
        <p data-field="state-tag" className="wl-uf04__tag wl-uf04__tag--large">
          {en.uf04.notSuggested}
        </p>
      ) : null}
      <button
        type="button"
        className="wl-button--secondary wl-uf04__exclude-button"
        aria-label={excluded ? en.uf04.suggestAgainName(name) : en.uf04.dontSuggestName(name)}
        aria-disabled={disabled ? "true" : undefined}
        aria-describedby={online ? undefined : offlineId}
        onClick={() => void onClick()}
      >
        {pending ? en.uf04.saving : excluded ? en.uf04.suggestAgain : en.uf04.dontSuggest}
      </button>
      {online ? null : (
        <p id={offlineId} className="wl-uf04__hint">
          {en.excluded.connectToChange}
        </p>
      )}
      {failed ? (
        <p role="alert" className="wl-uf04__fail">
          {en.excluded.saveFailed}
        </p>
      ) : null}
    </div>
  );
}
