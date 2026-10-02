// UF-02.1 suggestion card (T-0302c, D-0065 §1, D-0106). It previews the 45-min `suggest()` output
// before the user has said how long they have, so it is labelled with that assumption, and Start
// (in Today.tsx) still goes through UF-08.1, which asks for the time (principle 2).
//
// Principle 3 — the engine decides, this file renders. The rows are `plan.items` in plan order,
// with the engine's sets and reps; the chips are `sessionReasonChips(sessionReasons)`; the length
// is `totalS`. Nothing here picks, reorders, counts or trims anything the engine returned.
import { Link } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import type { Workout } from "@workoutlab/engine";
import { formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary, sessionReasonChips } from "../../lib/i18n/workout.js";
import { PREVIEW_BUDGET_MIN } from "./use-today.js";

/** How many rows the card shows before "+N more". */
export const CARD_ROWS = 3;

/** UF-02.2's address. Until T-0302b lands, it renders UF-02.1. */
export const PREVIEW_HREF = "/?view=preview";

const CARD_CLASS = "wl-today-card";

function Title({ locale }: { locale: string }) {
  return (
    <h2 className="wl-today-card__title" data-part="card-title">
      {en.uf02.suggestedFor(formatSetCount(PREVIEW_BUDGET_MIN, locale))}
    </h2>
  );
}

/** Before the first cache read: the same box, busy, with no rows (NFR-PERF-1 layout part). */
export function SuggestionCardSkeleton() {
  return (
    <section
      className={CARD_CLASS}
      data-part="card"
      aria-busy="true"
      aria-label={en.uf02.cardLoading}
    >
      <span className="wl-today-card__bar" aria-hidden="true" />
      <span className="wl-today-card__bar wl-today-card__bar--short" aria-hidden="true" />
    </section>
  );
}

export interface SuggestionCardProps {
  workout: Workout;
  library: readonly LibraryExercise[];
  locale: string;
}

export function SuggestionCard({ workout, library, locale }: SuggestionCardProps) {
  const items = workout.plan.items;
  if (items.length === 0) {
    return (
      <section className={CARD_CLASS} data-part="card" aria-label={en.uf02.cardLabel}>
        <Title locale={locale} />
        <p className="wl-today-card__empty" data-part="card-empty">
          {en.uf02.nothingSuggested}
        </p>
      </section>
    );
  }

  const nameOf = (id: string): string => library.find((e) => e.id === id)?.name ?? id;
  const chips = sessionReasonChips(workout.sessionReasons);
  const hidden = items.length - CARD_ROWS;
  const minutes = Math.ceil(workout.totalS / 60);

  return (
    <section className={CARD_CLASS} data-part="card" aria-label={en.uf02.cardLabel}>
      <Title locale={locale} />
      <p className="wl-today-card__summary" data-part="card-summary">
        {en.uf02.cardSummary(
          items.length,
          formatSetCount(items.length, locale),
          formatSetCount(minutes, locale),
        )}
      </p>
      {chips.length > 0 ? (
        <ul className="wl-today-card__chips" data-part="card-chips" aria-label={en.uf02.chipsLabel}>
          {chips.map((chip, i) => (
            <li key={i} className="wl-today-card__chip" data-part="card-chip">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      <ol className="wl-today-card__rows" data-part="card-rows">
        {items.slice(0, CARD_ROWS).map((item, i) => (
          <li key={i} className="wl-today-card__row" data-part="card-row">
            {en.uf02.itemRow(nameOf(item.exerciseId), itemSummary(item))}
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className="wl-today-card__more" data-part="card-more">
          {en.uf02.more(formatSetCount(hidden, locale))}
        </p>
      ) : null}
      <Link to={PREVIEW_HREF} className="wl-today-card__see-all" data-part="see-all">
        {en.uf02.seeAll}
      </Link>
    </section>
  );
}
