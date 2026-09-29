// C-01 Body map (T-0300d; UF-02.1 compact, UF-10.1 full). Spec:
// Design-docs/docs/design/components/c-01-body-map.md, D-0003, D-0013, D-0019, D-0045 §4.
//
// Data in, nothing computed (principle 3): the fill comes from the engine's `coverageStep` and
// the outline from `needsAttention`. This file never reads `load / target` to pick a colour.
// Colours come only from `var(--wl-color-…)` tokens. Never import this from UF-03/UF-08/UF-09
// (principle 1, enforced by `no-restricted-imports` in apps/web/eslint.config.mjs).
import type { CSSProperties, KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { attentionLegend, coverageLegend, type ColorName } from "@workoutlab/design-tokens";
import { AREAS, type Area, type AreaBalance } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { formatSetCount } from "../../lib/format/number.js";
import { usePrefersReducedMotion } from "./use-reduced-motion.js";
import "./body-map.css";

/** The slice of the engine's `AreaBalance` (rule 11) that C-01 renders. */
export type BodyMapArea = Pick<
  AreaBalance,
  "area" | "load" | "target" | "coverageStep" | "needsAttention"
>;

export interface BodyMapProps {
  /** `compact`: UF-02.1, one link to `/balance`. `full`: UF-10.1, nine area buttons. */
  variant: "compact" | "full";
  /** The engine's balance output for the nine areas. Ignored while `loading`. */
  areas?: readonly BodyMapArea[];
  /** Balance not computed yet: `surface-2` fills, no numbers, legend visible (AC-D9). */
  loading?: boolean;
  /** `full` only. Called before navigating to `/balance/:area` (UF-10.2). */
  onSelectArea?: (area: Area) => void;
  /** Number formatting locale; defaults to the device locale (NFR-I18N-2). */
  locale?: string;
}

/** The colour token for an engine step. A value outside 0–4 is an engine bug: show it neutral. */
function fillToken(step: number): ColorName {
  const entry = coverageLegend.find((e) => e.step === step);
  return entry ? entry.token : "surface-2";
}

/** The legend `srLabel` for an engine step, lower-cased for use inside a sentence. */
function stepSrLabel(step: number): string {
  const entry = coverageLegend.find((e) => e.step === step);
  if (!entry) return "";
  return entry.srLabel.charAt(0).toLocaleLowerCase("en") + entry.srLabel.slice(1);
}

const tokenVar = (name: ColorName): string => `var(--wl-color-${name})`;

const ATTENTION_OUTLINE = `${attentionLegend.widthPx}px solid ${tokenVar(attentionLegend.token)}`;

interface AreaView {
  area: Area;
  name: string;
  data: BodyMapArea | undefined;
}

function fillStyle(view: AreaView, loading: boolean, animate: boolean): CSSProperties {
  if (loading || !view.data) {
    return {
      backgroundColor: tokenVar("surface-2"),
      ...(loading && animate
        ? { animation: "wl-body-map-pulse 1.6s ease-in-out infinite" }
        : undefined),
    };
  }
  return {
    backgroundColor: tokenVar(fillToken(view.data.coverageStep)),
    ...(view.data.needsAttention ? { outline: ATTENTION_OUTLINE, outlineOffset: "0px" } : {}),
  };
}

function AreaContent({
  view,
  loading,
  animate,
  locale,
}: {
  view: AreaView;
  loading: boolean;
  animate: boolean;
  locale: string | undefined;
}) {
  const data = loading ? undefined : view.data;
  return (
    <>
      <span
        className="wl-body-map__fill"
        data-part="fill"
        data-coverage-step={data ? data.coverageStep : undefined}
        data-attention={data?.needsAttention ? "true" : undefined}
        aria-hidden="true"
        style={fillStyle(view, loading, animate)}
      />
      <span className="wl-body-map__area-name" aria-hidden="true">
        {view.name}
      </span>
      {data ? (
        <span className="wl-body-map__value" data-part="value" aria-hidden="true">
          {en.bodyMap.loadOfTarget(
            formatSetCount(data.load, locale),
            formatSetCount(data.target, locale),
          )}
        </span>
      ) : null}
    </>
  );
}

function accessibleName(view: AreaView, loading: boolean, locale: string | undefined): string {
  if (loading || !view.data) return en.bodyMap.areaLoading(view.name);
  const d = view.data;
  return en.bodyMap.areaName(
    view.name,
    formatSetCount(d.load, locale),
    formatSetCount(d.target, locale),
    stepSrLabel(d.coverageStep),
    d.needsAttention,
  );
}

function Legend() {
  return (
    <ul className="wl-body-map__legend" role="list" aria-label={en.bodyMap.legendName}>
      {coverageLegend.map((entry) => (
        <li key={entry.token} className="wl-body-map__legend-item">
          <span
            className="wl-body-map__swatch"
            data-part="swatch"
            aria-hidden="true"
            style={{ backgroundColor: tokenVar(entry.token) }}
          />
          <span data-part="legend-label" aria-hidden="true">
            {entry.label}
          </span>
          <span className="wl-body-map__sr-only">{entry.srLabel}</span>
        </li>
      ))}
      <li className="wl-body-map__legend-item">
        <span
          className="wl-body-map__swatch"
          data-part="swatch"
          aria-hidden="true"
          style={{ backgroundColor: "transparent", outline: ATTENTION_OUTLINE }}
        />
        <span data-part="legend-label" aria-hidden="true">
          {attentionLegend.label}
        </span>
        <span className="wl-body-map__sr-only">{attentionLegend.srLabel}</span>
      </li>
    </ul>
  );
}

export function BodyMap({ variant, areas, loading = false, onSelectArea, locale }: BodyMapProps) {
  const navigate = useNavigate();
  const animate = !usePrefersReducedMotion();
  const views: AreaView[] = AREAS.map((area) => ({
    area,
    name: en.bodyMap.areas[area],
    data: areas?.find((a) => a.area === area),
  }));

  const select = (area: Area) => {
    onSelectArea?.(area);
    navigate(`/balance/${area}`);
  };

  // Native buttons turn Enter (keydown) and Space (keyup) into a click. We handle both keys
  // ourselves and cancel the native activation, so each key press selects exactly once.
  const onKeyDown = (area: Area) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) select(area);
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") event.preventDefault();
  };

  const grid =
    variant === "full" ? (
      <div className="wl-body-map__grid">
        {views.map((view) => (
          <button
            key={view.area}
            type="button"
            className="wl-body-map__area"
            style={{ gridArea: view.area }}
            data-area={view.area}
            aria-label={accessibleName(view, loading, locale)}
            disabled={loading}
            onClick={() => select(view.area)}
            onKeyDown={onKeyDown(view.area)}
            onKeyUp={onKeyUp}
          >
            <AreaContent view={view} loading={loading} animate={animate} locale={locale} />
          </button>
        ))}
      </div>
    ) : (
      <Link to="/balance" className="wl-body-map__link" aria-label={en.bodyMap.compactLink}>
        <span className="wl-body-map__grid">
          {views.map((view) => (
            <span
              key={view.area}
              className="wl-body-map__area"
              style={{ gridArea: view.area }}
              data-area={view.area}
            >
              <AreaContent view={view} loading={loading} animate={animate} locale={locale} />
            </span>
          ))}
        </span>
      </Link>
    );

  return (
    <section
      className={`wl-body-map wl-body-map--${variant}`}
      data-component="C-01"
      data-variant={variant}
      aria-label={variant === "full" ? en.bodyMap.mapName : undefined}
      aria-busy={loading || undefined}
    >
      {grid}
      <Legend />
    </section>
  );
}
