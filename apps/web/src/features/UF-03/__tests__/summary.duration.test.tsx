// T-0428 (UF-03.3): D-0147 §3 pinned. A session row whose `ended_at − started_at` isn't a finite
// number is unreadable and shows "This workout isn't on this device"; a negative duration (a
// device clock moved back mid-workout, a row the queue can hold though the server check
// `sessions_ended_after_started` forbids it) reads "0 min"; whole minutes are rounded down.
// Principle 3: the Time figure is a field of the stored row, so it never reads "NaN min" or
// "-1 min". Every case reads IndexedDB only (the T-0419 AC-7 setup).
import { screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { ENDED_AT, NOW, S1, STARTED_AT } from "./fixtures.js";
import {
  freshDb,
  location,
  part,
  renderSummary,
  seedAll,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);

beforeAll(() => {
  process.on("unhandledRejection", onRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
});

let db: OfflineDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  rejections.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
  expect(rejections).toEqual([]);
});

/** The T-0419 fixture, then S1's row rewritten with these timestamps (`as never` past the type). */
async function seedTimes(startedAt: string, endedAt: string): Promise<void> {
  await seedAll(db);
  const entry = await db.sessions.get(S1);
  if (!entry) throw new Error("S1 not seeded");
  await db.sessions.put({
    ...entry,
    row: { ...entry.row, started_at: startedAt as never, ended_at: endedAt as never },
  });
}

const iso = (ms: number) => new Date(ms).toISOString();
const plus = (base: string, seconds: number) => iso(Date.parse(base) + seconds * 1000);

const wrappers = () => document.querySelectorAll('[data-screen-id="UF-03.3"]');

async function expectNotOnDevice(): Promise<void> {
  await screen.findByText(en.uf03.notOnDevice);
  await waitReal(50);
  expect(wrappers()).toHaveLength(1);
  expect(wrappers()[0]).toHaveTextContent(en.uf03.notOnDevice);
  expect(screen.getByRole("link", { name: en.uf03.goHome })).toHaveAttribute("href", "/");
  expect(document.body.textContent ?? "").not.toMatch(/min/);
  expect(document.body.textContent ?? "").not.toMatch(/NaN/);
  expect(part("time")).toBeNull();
  expect(part("exercises")).toBeNull();
  expect(part("sets")).toBeNull();
  expect(document.querySelectorAll('a[href^="/balance"]')).toHaveLength(0);
  expect(location.pathname).toBe(`/session/${S1}/summary`);
  expect(rejections).toEqual([]);
}

/** The ended summary's Time figure, after it renders and 50 ms more. */
async function endedTime(): Promise<string> {
  await waitFor(() => expect(part("time")).not.toBeNull());
  await waitReal(50);
  expect(screen.queryByText(en.uf03.notOnDevice)).toBeNull();
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/NaN/);
  expect(text).not.toMatch(/-\s*\d+\s*min/);
  expect(rejections).toEqual([]);
  return part("time")?.textContent ?? "";
}

describe('AC-1 a non-finite duration is "isn\'t on this device" (D-0147 §3)', () => {
  it('started_at "not-a-date" shows the not-on-device state, never "NaN min"', async () => {
    await seedTimes("not-a-date", "2026-09-27T09:52:40.000Z");
    renderSummary(S1);
    await expectNotOnDevice();
  });

  it('ended_at "not-a-date" (non-null, so not the running state) shows the same screen', async () => {
    await seedTimes(STARTED_AT, "not-a-date");
    renderSummary(S1);
    await expectNotOnDevice();
    expect(part("still-running")).toBeNull();
  });

  it('the pair: both timestamps valid shows "52 min" and "45 min budget"', async () => {
    await seedTimes(STARTED_AT, ENDED_AT);
    renderSummary(S1);
    expect(await endedTime()).toBe("52 min");
    expect(part("budget")).toHaveTextContent("45 min budget");
  });
});

describe('AC-2 a negative duration reads "0 min" (D-0147 §3)', () => {
  it('ended_at 5 min before started_at: "0 min", "45 min budget", Exercises, Sets and one See balance', async () => {
    await seedTimes("2026-09-27T09:52:40.000Z", "2026-09-27T09:47:40.000Z");
    renderSummary(S1);
    expect(await endedTime()).toBe("0 min");
    expect(part("budget")).toHaveTextContent("45 min budget");
    expect(part("exercises")).toHaveTextContent("2");
    expect(part("sets")).toHaveTextContent("7");
    expect(screen.getAllByRole("link", { name: en.uf03.seeBalance })).toHaveLength(1);
  });

  it('just below zero: ended_at 30 s before started_at reads "0 min"', async () => {
    await seedTimes(STARTED_AT, plus(STARTED_AT, -30));
    renderSummary(S1);
    expect(await endedTime()).toBe("0 min");
  });

  it('the pair: ended_at 59 s after started_at reads "0 min"', async () => {
    await seedTimes(STARTED_AT, plus(STARTED_AT, 59));
    renderSummary(S1);
    expect(await endedTime()).toBe("0 min");
  });

  it('the pair: ENDED_AT (52 min 40 s) reads "52 min"', async () => {
    await seedTimes(STARTED_AT, ENDED_AT);
    renderSummary(S1);
    expect(await endedTime()).toBe("52 min");
  });
});

describe("AC-3 zero and the floor (D-0147 §3, D-0068 §1)", () => {
  it('ended_at equal to started_at reads "0 min"', async () => {
    await seedTimes(STARTED_AT, STARTED_AT);
    renderSummary(S1);
    expect(await endedTime()).toBe("0 min");
  });

  it('52 min 59 s reads "52 min" (rounded down, the pair that catches ceil)', async () => {
    await seedTimes(STARTED_AT, plus(STARTED_AT, 52 * 60 + 59));
    renderSummary(S1);
    expect(await endedTime()).toBe("52 min");
  });
});
