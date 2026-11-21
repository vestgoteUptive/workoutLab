// UF-06.2 estimated 1RM chart and table (D-0256, D-0258; screens/UF-06.2.md). Hand-written SVG,
// no library: the first chart in the app. Colours are `--wl-*` variables only. The viewBox width
// is the container width (ResizeObserver; 320 in jsdom, which has no layout).
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { dayDiff } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { formatDayMonth } from "./format.js";
import { formatWeight, type E1rmChartPoint } from "./stats.js";

export const FALLBACK_WIDTH = 320;
export const CHART_HEIGHT = 160;
const TOP = 28;
const BOTTOM = 120;
const DATE_Y = 152;
const LEFT = 56;
const RIGHT = 16;

const TEXT: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  fill: "var(--wl-ink-muted)",
  fontFamily: "var(--wl-font)",
  fontVariantNumeric: "tabular-nums",
};

/** The y axis of UF-06.2 ("y axis algorithm"): rounded floor and ceiling, 2 or 3 gridlines. */
export function yAxis(values: readonly number[]): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let lo = (Math.ceil(min / 5) - 1) * 5;
  let hi = (Math.floor(max / 5) + 1) * 5;
  if (hi - lo < 10) {
    lo -= 5;
    hi += 5;
  }
  if (hi - lo > 20 && ((hi - lo) / 5) % 2 === 1) hi += 5;
  const ticks = hi - lo > 20 ? [lo, (lo + hi) / 2, hi] : [lo, hi];
  return { lo, hi, ticks };
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = (w: number) => setWidth(w > 0 ? Math.round(w) : FALLBACK_WIDTH);
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) measure(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function E1rmChart({
  points,
  locale,
}: {
  points: E1rmChartPoint[];
  locale?: string | undefined;
}) {
  const [ref, measured] = useWidth();
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const width = Math.max(measured, LEFT + RIGHT + 80);
  const about = (v: number) => en.uf06.aboutKg(formatWeight(Math.round(v), locale));

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const one = first.date === last.date; // one point, or every session on the same local date
  const span = one ? 0 : dayDiff(first.date, last.date);
  const plotL = LEFT;
  const plotR = width - RIGHT;
  const xOf = (date: string) =>
    one ? (plotL + plotR) / 2 : plotL + (dayDiff(first.date, date) / span) * (plotR - plotL);
  const { lo, hi, ticks } = yAxis(points.map((p) => p.e1rm));
  const yOf = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);

  const xs = points.map((p) => xOf(p.date));
  const ys = points.map((p) => yOf(p.e1rm));
  const li = points.length - 1;
  const above = ys[li]! - 10;
  const prevHigher = points.length > 1 && ys[li - 1]! < ys[li]!;
  const flip = points.length > 1 && (prevHigher || above < 18);
  const labelY = flip ? ys[li]! + 16 : above;

  const d1 = formatDayMonth(first.date, locale);
  const d2 = formatDayMonth(last.date, locale);
  const label =
    points.length === 1
      ? en.uf06.e1rmChartOne(about(first.e1rm), d1)
      : en.uf06.e1rmChartMany(points.length, about(first.e1rm), d1, about(last.e1rm), d2);

  const stroke = { vectorEffect: "non-scaling-stroke" } as const;
  return (
    <>
      <div ref={ref} className="wl-e1rm__chart">
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          data-testid="e1rm-chart"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={plotL}
                x2={plotR}
                y1={yOf(t)}
                y2={yOf(t)}
                strokeWidth={1}
                style={{ stroke: "var(--wl-line)", ...stroke }}
                data-part="grid"
              />
              <text
                x={LEFT - 4}
                y={yOf(t) + 4}
                textAnchor="end"
                aria-hidden="true"
                style={TEXT}
                data-part="grid-label"
              >
                {en.uf06.weightKg(formatWeight(t, locale))}
              </text>
            </g>
          ))}
          {points.length > 1 && (
            <polyline
              points={points.map((_, i) => `${xs[i]},${ys[i]}`).join(" ")}
              fill="none"
              strokeWidth={2}
              style={{ stroke: "var(--wl-action)", ...stroke }}
              data-part="line"
            />
          )}
          {points.map((p, i) => (
            <g key={i} data-part="dot" data-date={p.date}>
              <circle
                cx={xs[i]}
                cy={ys[i]}
                r={4}
                fill="none"
                strokeWidth={2}
                style={{ stroke: "var(--wl-bg)", ...stroke }}
              />
              <circle cx={xs[i]} cy={ys[i]} r={3} style={{ fill: "var(--wl-action)" }} />
            </g>
          ))}
          <text
            x={xs[li]}
            y={labelY}
            textAnchor="end"
            aria-hidden="true"
            style={TEXT}
            data-part="latest"
          >
            {about(last.e1rm)}
          </text>
          {one ? (
            <text
              x={xs[0]}
              y={DATE_Y}
              textAnchor="middle"
              aria-hidden="true"
              style={TEXT}
              data-part="date"
            >
              {d1}
            </text>
          ) : (
            <>
              <text
                x={plotL}
                y={DATE_Y}
                textAnchor="start"
                aria-hidden="true"
                style={TEXT}
                data-part="date"
              >
                {d1}
              </text>
              <text
                x={plotR}
                y={DATE_Y}
                textAnchor="end"
                aria-hidden="true"
                style={TEXT}
                data-part="date"
              >
                {d2}
              </text>
            </>
          )}
        </svg>
      </div>
      {points.length === 1 && <p className="wl-type-body wl-e1rm__note">{en.uf06.e1rmOnePoint}</p>}
      <button
        type="button"
        className="wl-button--text wl-e1rm__toggle"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? en.uf06.hideTable : en.uf06.showTable}
      </button>
      <div id={tableId}>
        {open && (
          <table className="wl-type-body wl-e1rm__table">
            <caption>{en.uf06.e1rmTableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{en.uf06.colDate}</th>
                <th scope="col">{en.uf06.colBestSet}</th>
                <th scope="col">{en.uf06.colE1rm}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{formatDayMonth(p.date, locale)}</th>
                  <td>
                    {en.uf06.weightedBest(
                      formatWeight(p.weightKg, locale),
                      formatWeight(p.reps, locale),
                    )}
                  </td>
                  <td>{about(p.e1rm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="wl-type-body wl-e1rm__explain">{en.uf06.e1rmExplain}</p>
    </>
  );
}
