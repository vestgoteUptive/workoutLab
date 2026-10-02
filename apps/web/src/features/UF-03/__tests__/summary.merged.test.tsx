// T-0433 UF-03.3: the rating comes from the merged `loadSessions()` view (D-0153 §4, D-0148,
// D-0151), and Save navigates only while the summary is still mounted (D-0153 §5).
// The setup is T-0420's: S1 ended at 11:52:40 with the queue sets, fake-indexeddb, a signed-in
// USER_A, the real `upsertSession` wrapped in a spy, `fetch` a spy, `renderSummary`. Only `Date`
// is faked, so the negative asserts wait 50 ms of real time.
//
// "Marked": the queued S1 entry is {pending: false, finished: true, cacheCurrent: true} with
// `effort_rating: 4`, and `sessionCache` holds S1 (same start and end) with `effortRating: 2`.
// D-0151 §4 makes the view's rating 2; every test asserts that first.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import * as loaders from "../../../lib/offline/feature-loaders.js";
import * as queue from "../../../lib/offline/queue.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { ENDED_AT, NOW, PLAN, S1, STARTED_AT, USER_A } from "./fixtures.js";
import { REFRESH_NAMES } from "./mocks.js";
import {
  freshDb,
  location,
  renderSummary,
  seedAll,
  seedSessionCache,
  setQueuedFlags,
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
vi.mock("../../../lib/offline/feature-loaders.js", (orig) =>
  import("./mocks.js").then((m) => m.featureLoaderSpies(orig)),
);

const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);
beforeAll(() => void process.on("unhandledRejection", onRejection));
afterAll(() => void process.off("unhandledRejection", onRejection));

let db: OfflineDb;
let fetchSpy: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;
const realUpsert = vi.mocked(queue.upsertSession).getMockImplementation()!;
const realLoadSessions = vi.mocked(loaders.loadSessions).getMockImplementation()!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  rejections.length = 0;
  vi.mocked(queue.upsertSession).mockClear();
  vi.mocked(loaders.loadSessions).mockClear();
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  await waitReal(50);
  expect(rejections).toEqual([]);
  // AC-5: no refresh on UF-03.3 (D-0142 §4).
  for (const name of REFRESH_NAMES) {
    const fn = (history as Record<string, unknown>)[name];
    if (vi.isMockFunction(fn)) expect(fn, name).not.toHaveBeenCalled();
  }
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
  vi.mocked(queue.upsertSession).mockReset();
  vi.mocked(queue.upsertSession).mockImplementation(realUpsert);
  vi.mocked(loaders.loadSessions).mockReset();
  vi.mocked(loaders.loadSessions).mockImplementation(realLoadSessions);
});

const TEN_MIN_LATER = new Date(Date.parse(ENDED_AT) + 10 * 60_000).toISOString();

const group = () => screen.getByRole("radiogroup", { name: en.uf03.effortName });
const radios = () => within(group()).getAllByRole<HTMLInputElement>("radio");
const radio = (name: string) => within(group()).getByRole<HTMLInputElement>("radio", { name });
const saveButton = () => screen.getByRole("button", { name: en.uf03.save });
const checkedNames = () =>
  radios()
    .filter((r) => r.checked)
    .map((r) => r.closest("label")?.textContent ?? "");
const upsertCalls = () => vi.mocked(queue.upsertSession).mock.calls;

async function storedEntry() {
  return (await db.sessions.get(S1))!;
}

async function viewRating(): Promise<number | null | undefined> {
  return (await realLoadSessions()).find((s) => s.id === S1)?.effortRating;
}

interface PairSeed {
  /** The queued row's `effort_rating`. */
  queued?: number | null;
  /** The cached row's `effortRating`; `undefined` writes no cached row. */
  cached?: number | null;
  cachedEndedAt?: string;
  marked?: boolean;
}

/** The queue fixture (S1 ended, its sets, S0 cached, L1, the targets) plus the D-0151 pair. */
async function seedPair({ queued = 4, cached, cachedEndedAt, marked = false }: PairSeed) {
  await seedAll(db, { effortRating: queued });
  if (cached !== undefined) {
    await seedSessionCache(db, { effortRating: cached, endedAt: cachedEndedAt ?? ENDED_AT });
  }
  if (marked) await setQueuedFlags(db, { pending: false, cacheCurrent: true });
}

/** The ticket's "marked" state, with its precondition asserted. */
async function seedMarked() {
  await seedPair({ queued: 4, cached: 2, marked: true });
  const entry = await storedEntry();
  expect(entry).toMatchObject({ pending: false, finished: true, cacheCurrent: true });
  expect(entry.row.effort_rating).toBe(4);
  expect(await viewRating()).toBe(2);
}

async function open(before: readonly string[] = []) {
  renderSummary(S1, undefined, before);
  await screen.findByRole("radiogroup", { name: en.uf03.effortName });
}

/** An `upsertSession` that waits for the gate before running the real one (or rejecting). */
function holdUpsert(outcome: "resolve" | "reject" = "resolve") {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.mocked(queue.upsertSession).mockImplementationOnce(async (row) => {
    await gate;
    if (outcome === "reject") throw new Error("IndexedDB said no");
    return realUpsert(row);
  });
  return { release };
}

/** The view changes after mount: the entry is marked and the cache says `rating`. */
async function changeViewTo(rating: number) {
  await act(async () => {
    await seedSessionCache(db, { effortRating: rating });
    await setQueuedFlags(db, { pending: false, cacheCurrent: true });
  });
  expect(await viewRating()).toBe(rating);
}

describe("AC-1 the preselect comes from the merged view (D-0153 §4)", () => {
  it("marked: 'Easy' (the cached 2) is checked, not 'Hard' (the queued 4)", async () => {
    await seedMarked();
    await open();
    expect(checkedNames()).toEqual(["Easy"]);
    expect(radio("Hard").checked).toBe(false);
  });

  it("the pair, unmarked (pending: true): 'Hard', the D-0148 §3 queued win", async () => {
    await seedPair({ queued: 4, cached: 2 });
    expect((await storedEntry()).pending).toBe(true);
    expect(await viewRating()).toBe(4);
    await open();
    expect(checkedNames()).toEqual(["Hard"]);
  });

  it("the pair, no cached row: the queued 4 checks 'Hard' (D-0148 §5)", async () => {
    await seedPair({ queued: 4, marked: true });
    expect(await db.sessionCache.count()).toBe(0);
    expect(await viewRating()).toBe(4);
    await open();
    expect(checkedNames()).toEqual(["Hard"]);
  });

  it("a later cached finish: unmarked, the cached 5 checks 'Very hard' (D-0148 §2)", async () => {
    await seedPair({ queued: 4, cached: 5, cachedEndedAt: TEN_MIN_LATER });
    expect((await storedEntry()).pending).toBe(true);
    expect(await viewRating()).toBe(5);
    await open();
    expect(checkedNames()).toEqual(["Very hard"]);
  });

  it("nothing: marked with the cache's null checks no chip", async () => {
    await seedPair({ queued: 4, cached: null, marked: true });
    expect(await viewRating()).toBeNull();
    await open();
    await waitReal(50);
    expect(checkedNames()).toEqual([]);
  });
});

describe("AC-2 an untouched Save sends the view's rating (D-0153 §4)", () => {
  it("marked: no pick sends {...row, effort_rating: 2}, the rest the stored row", async () => {
    await seedMarked();
    await open();
    const row = (await storedEntry()).row;
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    await waitReal(50);
    expect(upsertCalls()).toEqual([[{ ...row, effort_rating: 2 }]]);
    expect(upsertCalls()[0]![0]).toMatchObject({
      id: S1,
      user_id: USER_A,
      started_at: STARTED_AT,
      ended_at: ENDED_AT,
      time_budget_min: 45,
      plan: PLAN,
    });
  });

  it("tap-time: the view read at the tap (1) is sent, not the one at mount (4)", async () => {
    await seedPair({ queued: 4, cached: 2 });
    await open();
    expect(checkedNames()).toEqual(["Hard"]);
    await changeViewTo(1);
    const row = (await storedEntry()).row;
    const before = vi.mocked(loaders.loadSessions).mock.calls.length;
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(upsertCalls()).toEqual([[{ ...row, effort_rating: 1 }]]);
    expect(vi.mocked(loaders.loadSessions).mock.calls.length).toBeGreaterThan(before);
  });

  it("touched: picking 'Very hard' sends 5 whatever the view says", async () => {
    await seedMarked();
    await open();
    fireEvent.click(radio("Very hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]![0].effort_rating).toBe(5);
  });

  it("touched back: 'Hard' then 'Easy' sends 2 as a pick, with the view changed to 1", async () => {
    await seedMarked();
    await open();
    expect(checkedNames()).toEqual(["Easy"]);
    fireEvent.click(radio("Hard"));
    fireEvent.click(radio("Easy"));
    await changeViewTo(1);
    const row = (await storedEntry()).row;
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(upsertCalls()).toEqual([[{ ...row, effort_rating: 2 }]]);
  });

  it("no cached row: the view is the queued row, so the untouched Save sends 3", async () => {
    await seedPair({ queued: 3 });
    expect(await viewRating()).toBe(3);
    await open();
    expect(checkedNames()).toEqual(["About right"]);
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]![0].effort_rating).toBe(3);
  });

  it("no entry (the fallback): loadSessions resolving [] at the tap sends the raw 3", async () => {
    await seedPair({ queued: 3 });
    await open();
    vi.mocked(loaders.loadSessions).mockClear();
    vi.mocked(loaders.loadSessions).mockResolvedValueOnce([]);
    const row = (await storedEntry()).row;
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(upsertCalls()).toEqual([[{ ...row, effort_rating: 3 }]]);
    expect(vi.mocked(loaders.loadSessions)).toHaveBeenCalledTimes(1);
  });
});

describe("AC-3 offline and the whole row", () => {
  let onLine: PropertyDescriptor | undefined;
  beforeEach(() => {
    onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
  });
  afterEach(() => {
    if (onLine) Object.defineProperty(Navigator.prototype, "onLine", onLine);
  });

  it("offline, marked, untouched: the queue holds 2, pending, unmarked; / replaces", async () => {
    expect(navigator.onLine).toBe(false);
    await seedMarked();
    await open(["/"]);
    const row = (await storedEntry()).row;
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));

    const entry = await storedEntry();
    expect(entry.pending).toBe(true);
    expect(entry.finished).toBe(true);
    expect(entry.row).toEqual({ ...row, effort_rating: 2 });
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);

    // Replace, not push: one step back is the `/` below, not the summary.
    act(() => void location.navigate!(-1));
    await waitReal(50);
    expect(location.pathname).toBe("/");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AC-4 no navigate after leaving (D-0153 §5)", () => {
  const seeBalance = () => screen.getByRole("link", { name: en.uf03.seeBalance });

  it("left through 'See balance': the release keeps /balance, the write lands", async () => {
    await seedAll(db);
    await open(["/"]);
    const held = holdUpsert();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertCalls()).toHaveLength(1));
    fireEvent.click(seeBalance());
    await waitFor(() => expect(location.pathname).toBe("/balance"));
    expect(screen.queryByRole("radiogroup")).toBeNull();

    held.release();
    await waitFor(async () => expect((await storedEntry()).row.effort_rating).toBe(4));
    await waitReal(50);
    expect(location.pathname).toBe("/balance");
    expect(screen.getByTestId("balance")).toBeInTheDocument();

    // Nothing pushed or replaced over it: one step back is the summary.
    act(() => void location.navigate!(-1));
    await waitFor(() => expect(location.pathname).toBe(`/session/${S1}/summary`));
  });

  it("the pair: staying on the summary, the release replaces the route with /", async () => {
    await seedAll(db);
    await open(["/"]);
    const held = holdUpsert();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitReal(50);
    expect(location.pathname).toBe(`/session/${S1}/summary`);
    held.release();
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect((await storedEntry()).row.effort_rating).toBe(4);
    act(() => void location.navigate!(-1));
    await waitReal(50);
    expect(location.pathname).toBe("/");
  });

  it("rejected after leaving: nothing throws, no console.error, /balance stays", async () => {
    await seedAll(db);
    await open(["/"]);
    const consoleError = vi.spyOn(console, "error");
    const held = holdUpsert("reject");
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(upsertCalls()).toHaveLength(1));
    fireEvent.click(seeBalance());
    await waitFor(() => expect(location.pathname).toBe("/balance"));
    held.release();
    await waitReal(50);
    expect(location.pathname).toBe("/balance");
    expect(rejections).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect((await storedEntry()).row.effort_rating).toBeUndefined();
  });
});
