// UF-09.8 Time check (T-0304d, D-0024, D-0120 §1 §2, NFR-TIME-4). Principle 2: the budget
// matters, so when the user is behind the engine's three answers are offered. Principle 3: the
// view only shows `timeCheck`'s result and saves the option picked, as the engine wrote it.
import { useEffect, useRef, useState } from "react";
import type { WorkoutItem } from "@workoutlab/shared";
import { ArrowIcon, TickIcon } from "../../components/icons/index.js";
import { en } from "../../lib/i18n/en.js";
import type { FocusCtx } from "./machine.js";
import { useFocusSession } from "./session.js";
import { deepEqual, plannedFinishMs, projectedFinishMs } from "./time-check.js";
import type { ViewProps } from "./views.js";

type OptionId = "continue" | "trim" | "skip";

function nameOf(ctx: FocusCtx, exerciseId: string): string {
  return ctx.library.find((e) => e.id === exerciseId)?.name ?? exerciseId;
}

/** What Trim changes in the not-started items, one line each (the engine's list, compared). */
function trimLines(ctx: FocusCtx, items: readonly WorkoutItem[], from: number): string[] {
  const lines: string[] = [];
  let j = from;
  for (let i = from; i < ctx.plan.items.length; i += 1) {
    const before = ctx.plan.items[i]!;
    const after = items[j];
    if (after?.exerciseId === before.exerciseId) {
      if (after.sets !== before.sets) {
        lines.push(en.uf09.trimSets(nameOf(ctx, before.exerciseId), before.sets, after.sets));
      }
      j += 1;
    } else lines.push(en.uf09.trimDrop(nameOf(ctx, before.exerciseId)));
  }
  return lines;
}

export function TimeCheck({ state, ctx, send, check, formatAt, onApplyItems }: ViewProps) {
  const session = useFocusSession();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // The engine's own default is to carry on; Trim and Skip next are picked, then Continue applies.
  const [selected, setSelected] = useState<OptionId>("continue");
  const busy = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const ready = check?.result.show === true && check.itemIndex === state.itemIndex;

  useEffect(() => {
    if (ready) continueRef.current?.focus();
  }, [ready]);

  // The host is still making this mount's check (a restore), or is moving on: nothing to offer.
  if (!ready || !check || !formatAt) return <div className="wl-uf09__view" />;
  const { result } = check;
  const planned = plannedFinishMs(session.row, state);
  const showTrim = !deepEqual(result.trim.items, ctx.plan.items);
  const next = ctx.plan.items[state.itemIndex];

  const apply = (items: WorkoutItem[]) => {
    // One write per pick: a second tap while it is pending does nothing.
    if (busy.current || !onApplyItems) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    onApplyItems(items).then(
      // On success the machine has moved on and this view unmounts.
      () => undefined,
      () => {
        busy.current = false;
        setPending(false);
        setFailed(true);
      },
    );
  };

  const options: Array<{
    id: OptionId;
    label: string;
    lines: string[];
    projectedS: number;
    onSelect: () => void;
  }> = [
    {
      id: "continue",
      label: en.uf09.continueOption,
      lines: [],
      projectedS: result.projectedS,
      onSelect: () => {
        if (!busy.current) send({ type: "CONTINUE" });
      },
    },
  ];
  if (showTrim) {
    options.push({
      id: "trim",
      label: en.uf09.trimOption,
      lines: trimLines(ctx, result.trim.items, state.itemIndex),
      projectedS: result.trim.projectedS,
      onSelect: () => apply(result.trim.items),
    });
  }
  options.push({
    id: "skip",
    label: en.uf09.skipNextOption,
    lines: next ? [en.uf09.skipItem(nameOf(ctx, next.exerciseId))] : [],
    projectedS: result.skipNext.projectedS,
    onSelect: () => apply(result.skipNext.items),
  });

  const chosen = options.find((o) => o.id === selected) ?? options[0]!;
  const titleId = "wl-uf09-check-title";

  return (
    <div className="wl-uf09__view wl-uf09__view--check">
      {result.minutesBehind === null ? null : (
        <h1 id={titleId} className="wl-uf09__title wl-type-page-title">
          {en.uf09.minutesBehind(result.minutesBehind)}
        </h1>
      )}
      {planned === null ? null : (
        <p className="wl-uf09__set-line wl-type-label" data-field="planned">
          {en.uf09.plannedFinish(formatAt(planned))}
        </p>
      )}
      <div
        className="wl-uf09__options"
        role="radiogroup"
        aria-labelledby={result.minutesBehind === null ? undefined : titleId}
      >
        {options.map((option) => {
          // One id per line, so the description reads them apart (AccName joins with spaces).
          const lines = [
            ...option.lines,
            en.uf09.doneBy(formatAt(projectedFinishMs(check, option.projectedS))),
          ];
          const ids = lines.map((_, k) => `wl-uf09-option-${option.id}-${k}`);
          const labelId = `wl-uf09-option-${option.id}`;
          return (
            <label key={option.id} className="wl-option" data-option={option.id}>
              <input
                type="radio"
                name="wl-uf09-time-check"
                value={option.id}
                checked={selected === option.id}
                aria-labelledby={labelId}
                aria-describedby={ids.join(" ")}
                aria-disabled={pending ? true : undefined}
                onChange={() => {
                  if (!busy.current) setSelected(option.id);
                }}
              />
              <span className="wl-uf09__option-text">
                <span id={labelId} className="wl-type-row-title">
                  {option.label}
                </span>
                <span className="wl-uf09__option-detail">
                  {lines.map((line, k) => (
                    <span
                      key={ids[k]}
                      id={ids[k]}
                      className="wl-uf09__option-line wl-type-label"
                      data-field={k === lines.length - 1 ? "done-by" : undefined}
                    >
                      {line}
                    </span>
                  ))}
                </span>
              </span>
              <TickIcon className="wl-option__tick" />
            </label>
          );
        })}
      </div>
      <p className="wl-uf09__status wl-type-label" aria-live="polite">
        {failed ? en.uf09.applyError : null}
      </p>
      <button
        ref={continueRef}
        type="button"
        className="wl-button--primary wl-uf09__action"
        data-action="primary"
        aria-disabled={pending ? true : undefined}
        onClick={chosen.onSelect}
      >
        {en.uf09.continueOption}
        <ArrowIcon />
      </button>
    </div>
  );
}
