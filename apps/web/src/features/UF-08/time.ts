// UF-08.1 pure time helpers (D-0065 §2, D-0107 §4 §6). No clock reads here: the host reads
// `now` once at mount and passes it in.

export const MIN_BUDGET = 15;
export const MAX_BUDGET = 120;
export const STEP_MIN = 5;
export const DEFAULT_BUDGET = 45;
export const CHIPS = [20, 30, 45, 60, 90] as const;

export function clampBudget(minutes: number): number {
  return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, minutes));
}

/** The ISO instant `budgetMin` minutes after `nowIso` ("done by", D-0065 §2). */
export function finishInstant(nowIso: string, budgetMin: number): string {
  return new Date(new Date(nowIso).getTime() + budgetMin * 60_000).toISOString();
}

/** The local wall-clock fields of `utcMillis` in `timeZone`. */
function wallClock(utcMillis: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    ss: Number(parts.second),
  };
}

/** Minutes east of UTC of `timeZone` at `utcMillis`. */
function offsetMinutes(utcMillis: number, timeZone: string): number {
  const w = wallClock(utcMillis, timeZone);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  return (asUtc - (utcMillis - (utcMillis % 1000))) / 60_000;
}

/** The UTC millis of `hh:mm` on `nowIso`'s local calendar day in `timeZone` (DST-safe). */
function todayAt(nowIso: string, hh: number, mm: number, timeZone: string): number {
  const today = wallClock(new Date(nowIso).getTime(), timeZone);
  const naive = Date.UTC(today.y, today.m - 1, today.d, hh, mm, 0);
  let utc = naive;
  for (let i = 0; i < 2; i += 1) utc = naive - offsetMinutes(utc, timeZone) * 60_000;
  return utc;
}

/**
 * Every instant at which `hh:mm` occurs on `nowIso`'s local calendar day in `timeZone`, ascending.
 * Two in a fall-back repeated hour, one on an ordinary day, none in a spring-forward gap.
 */
function occurrencesToday(nowIso: string, hh: number, mm: number, timeZone: string): number[] {
  const today = wallClock(new Date(nowIso).getTime(), timeZone);
  const naive = Date.UTC(today.y, today.m - 1, today.d, hh, mm, 0);
  // The zone's offsets either side of the wall time cover both sides of any transition that day.
  const offsets = new Set(
    [-1, 0, 1].map((h) => offsetMinutes(naive + h * 12 * 3_600_000, timeZone)),
  );
  const found = new Set<number>();
  for (const off of offsets) {
    const utc = naive - off * 60_000;
    const w = wallClock(utc, timeZone);
    if (w.y === today.y && w.m === today.m && w.d === today.d && w.hh === hh && w.mm === mm) {
      found.add(utc);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * The instant to measure the budget to (D-0115 §4): the earliest occurrence of `hh:mm` today that
 * is strictly after `now`, else the last one (which then rejects). A spring-forward gap, where
 * `hh:mm` doesn't occur, keeps the plain `todayAt` reading.
 */
function finishAt(nowIso: string, hh: number, mm: number, timeZone: string): number {
  const nowMs = new Date(nowIso).getTime();
  const all = occurrencesToday(nowIso, hh, mm, timeZone);
  if (all.length === 0) return todayAt(nowIso, hh, mm, timeZone);
  return all.find((t) => t > nowMs) ?? all[all.length - 1]!;
}

export type FinishResult =
  { kind: "partial" } | { kind: "rejected" } | { kind: "ok"; budgetMin: number };

/**
 * Converts a picked finish time to a budget, once (D-0065 §2, D-0107 §6).
 * - Anything but a complete `HH:MM` is `partial`: nothing converts, no error.
 * - A time at or before `now` (it would mean tomorrow) is `rejected`. In a fall-back repeated
 *   hour the earliest occurrence after `now` counts; both at or before `now` is `rejected`
 *   (D-0115 §4).
 * - Otherwise `floor((finish − now) / 60 s)`, clamped to 15–120.
 */
export function finishToBudget(value: string, nowIso: string, timeZone: string): FinishResult {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { kind: "partial" };
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return { kind: "partial" };
  const diffMs = finishAt(nowIso, hh, mm, timeZone) - new Date(nowIso).getTime();
  if (diffMs <= 0) return { kind: "rejected" };
  return { kind: "ok", budgetMin: clampBudget(Math.floor(diffMs / 60_000)) };
}
