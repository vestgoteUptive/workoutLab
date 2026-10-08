// UF-08.2 Removed line (T-0538, D-0199 §2, screen spec UF-08.2). One row per item removed on this
// visit: "{name} · Never suggest", then "{name} won't be suggested · Undo". The region is a
// `role="status"` that is present on mount. Each row keeps ONE button element across both states
// (React keeps it by key), so focus stays on the row after Never suggest and after Undo.
// A row's state is the stored list (the cache), changed only after the server confirms.
import { useEffect, useId, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { exerciseName, type LibraryLookup } from "./rows.js";

export interface RemovedLineProps {
  /** Ids removed on this visit, in tap order. */
  ids: readonly string[];
  library: LibraryLookup;
  storedIds: readonly string[];
  online: boolean;
  onExclude?: ((exerciseId: string) => Promise<void>) | undefined;
  onInclude?: ((exerciseId: string) => Promise<void>) | undefined;
}

export function RemovedLine({
  ids,
  library,
  storedIds,
  online,
  onExclude,
  onInclude,
}: RemovedLineProps) {
  const offlineId = useId();
  // A write is "busy" until the cache update reaches the screen (the row flips), so a fast second
  // tap cannot send a second request. `settled` is the safety net if the cache never changes.
  const [busy, setBusy] = useState<{ id: string; wantStored: boolean } | null>(null);
  const [settled, setSettled] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (busy && storedIds.includes(busy.id) === busy.wantStored) setBusy(null);
  }, [busy, storedIds]);

  useEffect(() => {
    if (settled === 0) return;
    const t = setTimeout(() => setBusy(null), 1000);
    return () => clearTimeout(t);
  }, [settled]);

  const act = (id: string, stored: boolean) => {
    const write = stored ? onInclude : onExclude;
    if (!online || busy !== null || !write) return;
    setBusy({ id, wantStored: !stored });
    setFailed(false);
    write(id).then(
      () => setSettled((n) => n + 1),
      () => {
        setBusy(null);
        setFailed(true);
      },
    );
  };

  return (
    <>
      <div role="status" className="wl-uf08__removed" data-part="removed-line">
        {ids.length > 0 ? (
          <ul className="wl-uf08__removed-rows" aria-label={en.uf08.removedName}>
            {ids.map((id) => {
              const name = exerciseName(id, library);
              const stored = storedIds.includes(id);
              return (
                <li key={id} className="wl-uf08__removed-row" data-part="removed-row">
                  <span>
                    {stored ? en.uf08.wontBeSuggested(name) : name}
                    {" · "}
                  </span>
                  <button
                    type="button"
                    className={
                      stored
                        ? "wl-uf08__removed-btn wl-uf08__removed-btn--undo"
                        : "wl-uf08__removed-btn"
                    }
                    data-part={stored ? "undo" : "never-suggest"}
                    aria-label={stored ? en.uf08.undoName(name) : en.uf08.neverSuggestName(name)}
                    aria-disabled={!online || busy !== null ? "true" : "false"}
                    aria-describedby={!online ? offlineId : undefined}
                    onClick={() => act(id, stored)}
                  >
                    {stored ? en.uf08.undo : en.uf08.neverSuggest}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {ids.length > 0 && !online ? (
          <p id={offlineId} className="wl-uf08__removed-note">
            {en.excluded.connectToChange}
          </p>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="wl-uf08__removed-note">
          {en.excluded.saveFailed}
        </p>
      ) : null}
    </>
  );
}
