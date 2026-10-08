// UF-04.2 action row (T-0568, D-0202 §8, §9): the Favorite toggle beside "Don't suggest this",
// with one shared status line for the move lines. The pressed state follows the device cache,
// which the write helpers change only after the server confirms.
import { useId, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { currentUserId } from "../../lib/offline/current-user.js";
import { useExcludedIds, useOnline } from "../../lib/offline/excluded-hooks.js";
import { favoriteExercise, unfavoriteExercise } from "../../lib/offline/favorites.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import { ExcludeControl } from "./ExcludeControl.js";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className="wl-uf04__star"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

export function DetailActions({ exerciseId, name }: { exerciseId: string; name: string }) {
  const userId = currentUserId();
  const online = useOnline();
  const { ids, loaded } = useFavoriteList(userId);
  const excludedIds = useExcludedIds(userId);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const offlineId = useId();
  const pressed = ids.includes(exerciseId);
  const disabled = !online || pending || !loaded || userId === null;

  async function onClick() {
    if (disabled || userId === null) return;
    setFailed(false);
    setStatus("");
    setPending(true);
    try {
      if (pressed) {
        await unfavoriteExercise(userId, exerciseId);
      } else {
        const wasExcluded = excludedIds.includes(exerciseId);
        await favoriteExercise(userId, exerciseId);
        if (wasExcluded) setStatus(en.uf04.announceFavoriteMoved(name));
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="wl-uf04__actions">
      <div className="wl-uf04__action-row">
        <button
          type="button"
          className="wl-uf04__favorite"
          aria-label={en.uf04.favoriteName(name)}
          aria-pressed={pressed}
          aria-disabled={disabled ? "true" : undefined}
          aria-describedby={online ? undefined : offlineId}
          onClick={() => void onClick()}
        >
          <Star filled={pressed} />
          {en.uf04.favorite}
        </button>
        <ExcludeControl exerciseId={exerciseId} name={name} onStatus={setStatus} />
      </div>
      {online ? null : (
        <p id={offlineId} className="wl-uf04__hint">
          {en.uf04.connectToChangeFavorites}
        </p>
      )}
      {failed ? (
        <p role="alert" className="wl-uf04__fail">
          {en.excluded.saveFailed}
        </p>
      ) : null}
      <p role="status" className="wl-uf04__sr">
        {status}
      </p>
    </div>
  );
}
