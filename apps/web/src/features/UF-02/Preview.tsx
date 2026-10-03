// UF-02.2 Workout preview (T-0302b, D-0168 §3). `/?view=preview` renders the whole 45-min
// `suggest()` output: the card (`SuggestionCard.tsx`) shows the first three rows, this screen
// shows every row, with a link per exercise, the weight part and the one-line "why" (UF-08.2's
// own copy of each, D-0124).
//
// Principle 3 — the engine decides, this file renders. The rows are `plan.items` in plan order
// (never re-sorted, never trimmed); the rest length is a lookup on the engine's own constants
// (`REST_COMPOUND_S` / `REST_ISOLATION_S`), exactly as UF-09's `restFor` does it. Nothing here
// picks, reorders, counts or trims anything the engine didn't return.
// Principle 2 — Start is a plain link to UF-08.1, which asks for the time.
import { useState } from "react";
import { Link } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import {
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  WARMUP_COST_S,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { formatKg, formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemReasonLine, itemSummary, restLabel } from "../../lib/i18n/workout.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { defaultLocale, defaultTimeZone } from "./format.js";
import { useToday, type TodayState } from "./use-today.js";
import type { TodayProps } from "./Today.js";
import "./preview.css";

const BACK_HREF = "/";
const START_HREF = "/session/setup";

/** The library row the plan was built from: name, external-load flag, rest type and equipment. */
type LibraryLookup = readonly Pick<
  LibraryExercise,
  "id" | "name" | "externalLoad" | "type" | "equipment"
>[];

function libraryOf(id: string, library: LibraryLookup): LibraryLookup[number] | undefined {
  return library.find((e) => e.id === id);
}

function exerciseName(id: string, library: LibraryLookup): string {
  return libraryOf(id, library)?.name ?? id;
}

/** `REST_COMPOUND_S` for a library `type` `compound`, else `REST_ISOLATION_S` (as UF-09 `restFor`
 *  does it); a missing library row reads as compound, the engine's own default. */
function restSecondsFor(id: string, library: LibraryLookup): number {
  const exercise = libraryOf(id, library);
  if (!exercise) return REST_COMPOUND_S;
  return exercise.type === "compound" ? REST_COMPOUND_S : REST_ISOLATION_S;
}

/** "Bodyweight" / `formatKg(prefill.weightKg)` / nothing (D-0124, as UF-08.2's weight part). */
function weightPart(item: WorkoutItem, library: LibraryLookup, locale: string): string | null {
  const exercise = libraryOf(item.exerciseId, library);
  if (exercise?.externalLoad === false) return en.uf04.bodyweight;
  if (item.prefill.weightKg !== null) return formatKg(item.prefill.weightKg, locale);
  return null;
}

/** UF-08.2's back-off line, read-only copy (D-0124). */
function backoffLine(item: WorkoutItem, locale: string): string | null {
  if (item.backoff === null) return null;
  if (item.backoff.weightKg === null) return en.uf08.backoffSet;
  return en.uf08.backoff(formatKg(item.backoff.weightKg, locale), item.backoff.reps);
}

/** The equipment union of the items, plan order, first appearance wins, "none" dropped
 *  (D-0079 §5). An unknown id prints raw; the labels are read-only from `en.uf04.equipment`. */
function equipmentUnion(items: readonly WorkoutItem[], library: LibraryLookup): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of items) {
    const exercise = library.find((e) => e.id === item.exerciseId);
    for (const id of exercise?.equipment ?? []) {
      if (id === "none" || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  const labels: Record<string, string> = en.uf04.equipment;
  return ids.map((id) => labels[id] ?? id);
}

/** `Σ sets` + one per item with a `backoff` (the ticket's "n sets" chip). */
function setsCount(items: readonly WorkoutItem[]): number {
  return items.reduce((sum, item) => sum + item.sets + (item.backoff !== null ? 1 : 0), 0);
}

function Chips({
  workout,
  library,
  locale,
}: {
  workout: Workout;
  library: LibraryLookup;
  locale: string;
}) {
  const minutesS = workout.warmupInBudget ? workout.totalS : workout.itemsTotalS;
  const minutes = Math.ceil(minutesS / 60);
  const sets = setsCount(workout.plan.items);
  const equipment = equipmentUnion(workout.plan.items, library);
  return (
    <ul className="wl-preview__chips" data-part="preview-chips">
      <li className="wl-preview__chip" data-part="preview-chip">
        {en.uf02.preview.minutes(formatSetCount(minutes, locale))}
      </li>
      <li className="wl-preview__chip" data-part="preview-chip">
        {en.uf02.preview.sets(formatSetCount(sets, locale))}
      </li>
      {equipment.length > 0 ? (
        <li className="wl-preview__chip" data-part="preview-chip">
          {equipment.join(en.uf04.dot)}
        </li>
      ) : null}
    </ul>
  );
}

function WarmupRow({ workout, library }: { workout: Workout; library: LibraryLookup }) {
  if (workout.plan.warmup.length === 0) return null;
  const names = workout.plan.warmup.map((w) => exerciseName(w.exerciseId, library));
  const minutes = en.uf02.preview.warmupMinutes(formatSetCount(WARMUP_COST_S / 60));
  return (
    <div className="wl-preview__row wl-preview__row--warmup" data-part="preview-warmup">
      <span className="wl-preview__row-name" data-part="warmup-name">
        {en.uf02.preview.warmup}
      </span>
      <span className="wl-preview__row-detail" data-part="warmup-moves">
        {names.join(en.uf04.listSeparator)}
      </span>
      <span className="wl-preview__row-detail" data-part="warmup-minutes">
        {workout.warmupInBudget ? minutes : en.uf02.preview.warmupNotCounted}
      </span>
    </div>
  );
}

function ItemRow({
  item,
  library,
  locale,
}: {
  item: WorkoutItem;
  library: LibraryLookup;
  locale: string;
}) {
  const name = exerciseName(item.exerciseId, library);
  const weight = weightPart(item, library, locale);
  const rest = en.uf02.preview.rest(restLabel(restSecondsFor(item.exerciseId, library)));
  const parts = [itemSummary(item), weight, rest].filter((p): p is string => p !== null);
  const backoff = backoffLine(item, locale);
  const reason = itemReasonLine(item.reasons);
  return (
    <li className="wl-preview__row" data-part="preview-row">
      <Link
        to={`/library/${item.exerciseId}`}
        className="wl-preview__row-name"
        data-part="row-name"
      >
        {name}
      </Link>
      <span className="wl-preview__row-detail" data-part="row-detail">
        {parts.join(en.uf04.dot)}
      </span>
      {backoff !== null ? (
        <span className="wl-preview__row-backoff" data-part="row-backoff">
          {backoff}
        </span>
      ) : null}
      {reason !== "" ? (
        <span className="wl-preview__row-reason" data-part="row-reason">
          {reason}
        </span>
      ) : null}
    </li>
  );
}

function Skeleton() {
  return (
    <div className="wl-preview__skeleton" data-part="preview-skeleton" aria-busy="true">
      <span className="wl-preview__bar" aria-hidden="true" />
      <span className="wl-preview__bar wl-preview__bar--short" aria-hidden="true" />
    </div>
  );
}

function Body({ state, locale }: { state: TodayState; locale: string }) {
  if (state.status === "loading") return <Skeleton />;
  if (state.status === "no-plan") {
    return (
      <p className="wl-preview__no-plan" data-part="no-plan">
        {en.uf02.noPlan}
      </p>
    );
  }
  const { workout, library } = state;
  const items = workout?.plan.items ?? [];
  if (workout === null || items.length === 0) {
    return (
      <>
        {workout !== null ? <WarmupRow workout={workout} library={library} /> : null}
        <p className="wl-preview__empty" data-part="nothing-suggested">
          {en.uf02.nothingSuggested}
        </p>
      </>
    );
  }
  return (
    <>
      <Chips workout={workout} library={library} locale={locale} />
      <WarmupRow workout={workout} library={library} />
      <ol
        className="wl-preview__rows"
        aria-label={en.uf02.preview.listName}
        data-part="preview-rows"
      >
        {items.map((item) => (
          <ItemRow key={item.exerciseId} item={item} library={library} locale={locale} />
        ))}
      </ol>
    </>
  );
}

export function WorkoutPreview(props: TodayProps = {}) {
  // Fixed for the life of the mount, as Today.tsx does it (the UF-10 render-loop lesson): a
  // fresh `new Date()` per render would re-run the cache-read effect on every render.
  const [mountedAt] = useState(() => new Date());
  const now = props.now ?? mountedAt;
  const timeZone = props.timeZone ?? defaultTimeZone();
  const locale = props.locale ?? defaultLocale();
  const { status } = useAuth();
  const state = useToday(now, timeZone, status === "signed-in");

  return (
    <div data-screen-id="UF-02.2" className="wl-preview">
      <div className="wl-preview__top">
        <Link to={BACK_HREF} className="wl-preview__back" data-part="back">
          {en.uf02.preview.back}
        </Link>
      </div>
      <h1 className="wl-preview__title">{en.uf02.preview.title}</h1>
      <Body state={state} locale={locale} />
      <Link to={START_HREF} className="wl-preview__start" data-part="start">
        {en.uf02.start}
      </Link>
    </div>
  );
}
