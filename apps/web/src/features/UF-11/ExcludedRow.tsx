// T-0540 UF-11.2: the "Excluded exercises · n" row (D-0199 §7). A link, never a write control, so
// it stays enabled offline. No count until the first cache read resolves (D-0197 §2).
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { currentUserId } from "../../lib/offline/current-user.js";
import { loadExcludedIds } from "../../lib/offline/excluded.js";
import { useExcludedIds } from "../../lib/offline/excluded-hooks.js";
import { en } from "../../lib/i18n/en.js";

const u = en.uf11.excludedRow;

export function ExcludedRow() {
  const userId = currentUserId();
  const ids = useExcludedIds(userId);
  const [read, setRead] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    void loadExcludedIds(userId)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setRead(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const count = read ? ids.length : null;
  return (
    <section className="wl-card">
      <Link className="wl-row" to="/plan/excluded" aria-label={u.name(count)}>
        <span className="wl-plan__name">
          {u.label}
          {count === null ? null : (
            <span className="wl-muted">
              {u.separator}
              {count === 0 ? u.none : u.count(count)}
            </span>
          )}
        </span>
      </Link>
    </section>
  );
}
