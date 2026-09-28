// Seeded generators for property tests (D-0036 §5): fast-check isn't in the lockfile, so a
// deterministic mulberry32 PRNG drives the cases, and a failure reports its seed.
import type { HistorySet } from "../../src/index.js";
import { L1, WARMUPS } from "./common.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to 120 rows over 2026-08-01 … 2026-10-10 with edits, tombstones, queued rows and junk ids. */
export function randomHistory(rand: () => number): HistorySet[] {
  const ids = [...L1, ...WARMUPS].map((e) => e.id).concat(["not-in-library"]);
  const n = Math.floor(rand() * 120);
  const baseMs = new Date("2026-08-01T00:00:00Z").getTime();
  const spanMs = 70 * 86_400_000;
  const rows: HistorySet[] = [];
  for (let i = 0; i < n; i++) {
    const clientId = `c${Math.floor(rand() * Math.max(1, n * 0.8))}`;
    const completed = new Date(baseMs + Math.floor(rand() * spanMs)).toISOString();
    const edited = new Date(baseMs + Math.floor(rand() * spanMs)).toISOString();
    rows.push({
      clientId,
      sessionId: `s${i % 7}`,
      exerciseId: ids[Math.floor(rand() * ids.length)]!,
      isWarmup: rand() < 0.1,
      completedAt: completed,
      editedAt: edited,
      deletedAt: rand() < 0.15 ? edited : null,
      pending: rand() < 0.3,
      reps: 8,
      weightKg: 40,
      durationS: null,
    });
  }
  return rows;
}
