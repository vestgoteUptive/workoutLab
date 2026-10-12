// T-0569 UF-11.2: the "Favorite exercises · n" row (D-0202 §8), directly above the Excluded row.
// A link, never a write control, so it stays enabled offline. No count until the first cache read.
import { Link } from "react-router";
import { ArrowIcon } from "../../components/icons/index.js";
import { currentUserId } from "../../lib/offline/current-user.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import { en } from "../../lib/i18n/en.js";

const u = en.uf11.favoritesRow;

export function FavoritesRow() {
  const userId = currentUserId();
  const { ids, loaded } = useFavoriteList(userId);
  const count = loaded ? ids.length : null;
  return (
    <Link className="wl-row" to="/plan/favorites" aria-label={u.name(count)}>
      <span className="wl-plan__name wl-type-row-title">
        {u.label}
        {count === null ? null : (
          <span className="wl-type-label">
            {u.separator}
            {count === 0 ? u.none : u.count(count)}
          </span>
        )}
      </span>
      <ArrowIcon size={20} />
    </Link>
  );
}
