// UF-06's own Balance card (UF-06.1): the first four `balance().areas` entries, as given. It
// sorts nothing and derives nothing (principle 3): the bar colour is the engine's
// `coverageStep`, and the bar width is the only arithmetic, `min(load / target, 1)`.
import { Link } from "react-router";
import type { AreaBalance } from "@workoutlab/engine";
import { formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";

export type BalanceCardArea = Pick<AreaBalance, "area" | "load" | "target" | "coverageStep">;

export interface BalanceCardProps {
  /** The first four engine entries, in engine order. */
  areas: readonly BalanceCardArea[];
  locale?: string | undefined;
}

function barPercent(load: number, target: number): number {
  const ratio = load / target;
  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) * 100 : 0;
}

export function BalanceCard({ areas, locale }: BalanceCardProps) {
  return (
    <Link
      to="/balance"
      className="wl-progress__balance"
      aria-label={en.uf06.balanceLink}
      data-testid="balance-card"
    >
      <span className="wl-progress__balance-caption">{en.uf06.balanceCaption}</span>
      <span className="wl-progress__balance-rows">
        {areas.slice(0, 4).map((entry) => (
          <span key={entry.area} className="wl-progress__balance-row" data-area={entry.area}>
            <span className="wl-progress__balance-name">{en.bodyMap.areas[entry.area]}</span>
            <span className="wl-progress__balance-load">
              {en.bodyMap.loadOfTarget(
                formatSetCount(entry.load, locale),
                formatSetCount(entry.target, locale),
              )}
            </span>
            <span className="wl-progress__bar" aria-hidden="true">
              <span
                className="wl-progress__bar-fill"
                data-coverage-step={entry.coverageStep}
                style={{
                  width: `${barPercent(entry.load, entry.target)}%`,
                  backgroundColor: `var(--wl-color-coverage-${entry.coverageStep})`,
                }}
              />
            </span>
          </span>
        ))}
      </span>
    </Link>
  );
}
