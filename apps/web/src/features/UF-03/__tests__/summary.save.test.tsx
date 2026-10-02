// T-0420 UF-03.3 effort 1–5 and "Save workout" (D-0030, D-0068 §2 §3, D-0071 §6, D-0142 §4,
// D-0148 §3). The real `upsertSession` wrapped in a spy writes the real (fake-indexeddb) queue;
// `fetch` is a spy. Negative asserts wait 50 ms of real time (only `Date` is faked).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as queue from "../../../lib/offline/queue.js";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { ENDED_AT, NOW, PLAN, S1, STARTED_AT, USER_A } from "./fixtures.js";
import {
  freshDb,
  location,
  renderSummary,
  seedAll,
  seedLibraryAndTargets,
  seedSession,
  signIn,
  signOut,
  waitReal,
  type SessionSeed,
} from "./helpers.js";

vi.mock("@workoutlab/engine", (orig) => import("./mocks.js").then((m) => m.engineSpies(orig)));
vi.mock("../../../lib/offline/history.js", (orig) =>
  import("./mocks.js").then((m) => m.historySpies(orig)),
);
vi.mock("../../../lib/offline/queue.js", (orig) =>
  import("./mocks.js").then((m) => m.queueSpies(orig)),
);

interface Axe {
  run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }>;
}
let axe: Axe;
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);

beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const loaded = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = loaded.default ?? loaded;
  process.on("unhandledRejection", onRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onRejection);
});

const LABELS = ["Very easy", "Easy", "About right", "Hard", "Very hard"];

let db: OfflineDb;
let fetchSpy: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  db = freshDb();
  signIn();
  rejections.length = 0;
  vi.mocked(queue.upsertSession).mockClear();
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  // Let any write still in flight settle before the next test swaps the database.
  await waitReal(50);
  expect(rejections).toEqual([]);
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
  // `vi.restoreAllMocks` leaves the module-level spy's queued implementations alone.
  vi.mocked(queue.upsertSession).mockReset();
  vi.mocked(queue.upsertSession).mockImplementation(realUpsert);
});

// The real implementation, captured once, so `mockReset` can put it back.
const realUpsert = vi.mocked(queue.upsertSession).getMockImplementation()!;

const group = () => screen.getByRole("radiogroup", { name: en.uf03.effortName });
const radios = () => within(group()).getAllByRole<HTMLInputElement>("radio");
const radio = (name: string) => within(group()).getByRole<HTMLInputElement>("radio", { name });
const saveButton = () => screen.getByRole("button", { name: en.uf03.save });
const checkedNames = () =>
  radios()
    .filter((r) => r.checked)
    .map((r) => r.closest("label")?.textContent ?? "");

async function storedRow() {
  return (await db.sessions.get(S1))!.row;
}

async function openEnded(seed: SessionSeed = {}, before: readonly string[] = []) {
  await seedAll(db, seed);
  renderSummary(S1, undefined, before);
  await screen.findByRole("radiogroup", { name: en.uf03.effortName });
}

/** An `upsertSession` that waits for `release()` before running the real one. */
function holdUpsert(): { release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.mocked(queue.upsertSession).mockImplementationOnce(async (row) => {
    await gate;
    return realUpsert(row);
  });
  return { release };
}

async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.map((v) => v.id);
}

describe("AC-1 effort chips (D-0030, D-0068 §3)", () => {
  it("one radiogroup 'How hard was it?' with the five radios in order, none checked", async () => {
    await openEnded();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(radios().map((r) => r.closest("label")?.textContent)).toEqual(LABELS);
    for (const name of LABELS) expect(radio(name)).toBeInTheDocument();
    await waitReal(50);
    expect(checkedNames()).toEqual([]);
  });

  it("they are native radios sharing one name, so the arrow keys move the selection", async () => {
    await openEnded();
    const names = new Set(radios().map((r) => r.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe("");
    for (const r of radios()) expect(r.type).toBe("radio");
    expect(radios().map((r) => r.value)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("picking one checks exactly that one", async () => {
    await openEnded();
    fireEvent.click(radio("Hard"));
    expect(checkedNames()).toEqual(["Hard"]);
    fireEvent.click(radio("Easy"));
    expect(checkedNames()).toEqual(["Easy"]);
  });

  it("no 'tune next week' copy anywhere", async () => {
    await openEnded();
    expect(document.body.textContent ?? "").not.toMatch(/tune next week/i);
  });

  it("zero history: the chips and Save work the same", async () => {
    await seedSession(db);
    await seedLibraryAndTargets(db);
    renderSummary();
    await screen.findByRole("radiogroup", { name: en.uf03.effortName });
    expect(radios()).toHaveLength(5);
    expect(checkedNames()).toEqual([]);
    const row = await storedRow();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(vi.mocked(queue.upsertSession).mock.calls).toEqual([[{ ...row, effort_rating: 4 }]]);
  });

  it("CONTRAST: a still-running session has no chips and no Save", async () => {
    await seedAll(db, { endedAt: null });
    renderSummary();
    await screen.findByText(en.uf03.stillRunning);
    await waitReal(50);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: en.uf03.save })).toBeNull();
  });
});

describe("AC-2 Save sends the whole stored row (D-0071 §6)", () => {
  it("a pick: 'Hard' then Save calls upsertSession once with {...row, effort_rating: 4}", async () => {
    await openEnded();
    const row = await storedRow();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    await waitReal(50);
    const calls = vi.mocked(queue.upsertSession).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({ ...row, effort_rating: 4 });
    // Spelled out, so a partial row or a fresh clock can't pass by accident.
    expect(calls[0]![0]).toMatchObject({
      id: S1,
      user_id: USER_A,
      started_at: STARTED_AT,
      ended_at: ENDED_AT,
      time_budget_min: 45,
      energy: "normal",
      warmup_in_budget: true,
      plan: PLAN,
    });
  });

  it("no pick: Save sends effort_rating null and the rest of the row the same", async () => {
    await openEnded();
    const row = await storedRow();
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    const calls = vi.mocked(queue.upsertSession).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({ ...row, effort_rating: null });
    expect(Object.hasOwn(calls[0]![0], "effort_rating")).toBe(true);
  });

  it("fresh read: a plan written after mount is the plan Save sends", async () => {
    await openEnded();
    const newPlan = { ...PLAN, items: PLAN.items.slice(0, 1) };
    await act(async () => {
      await db.sessions.update(S1, { "row.plan": newPlan } as never);
    });
    const row = await storedRow();
    expect(row.plan).toEqual(newPlan);
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    const sent = vi.mocked(queue.upsertSession).mock.calls[0]![0];
    expect(sent.plan).toEqual(newPlan);
    expect(sent).toEqual({ ...row, effort_rating: 4 });
  });
});

describe("AC-3 offline save and the route (D-0068 §2)", () => {
  let onLine: PropertyDescriptor | undefined;
  beforeEach(() => {
    onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
  });
  afterEach(() => {
    if (onLine) Object.defineProperty(Navigator.prototype, "onLine", onLine);
  });

  it("offline: Save writes the queue, then replaces the route with /", async () => {
    expect(navigator.onLine).toBe(false);
    await openEnded({}, ["/"]);
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));

    const entry = (await db.sessions.get(S1))!;
    expect(entry.finished).toBe(true);
    expect(entry.pending).toBe(true);
    expect(entry.row.effort_rating).toBe(4);
    expect(entry.row.ended_at).toBe(ENDED_AT);

    // Replace, not push: one step back is the `/` below, not the summary.
    act(() => void location.navigate!(-1));
    await waitReal(50);
    expect(location.pathname).toBe("/");
    expect(screen.queryByRole("radiogroup")).toBeNull();

    const fnCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input instanceof Request ? input.url : input).includes("/functions/v1/"),
    );
    expect(fnCalls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("CONTRAST: the summary stays until the IndexedDB write resolves", async () => {
    await openEnded({}, ["/"]);
    const held = holdUpsert();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitReal(50);
    expect(location.pathname).toBe(`/session/${S1}/summary`);
    expect((await storedRow()).effort_rating).toBeUndefined();
    held.release();
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect((await storedRow()).effort_rating).toBe(4);
  });
});

describe("AC-4 pending and rejection", () => {
  it("pending: Save is aria-disabled, a second click makes no call, the chips are held", async () => {
    await openEnded();
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
    const held = holdUpsert();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(saveButton());
    fireEvent.click(radio("Very easy"));
    await waitReal(50);
    expect(vi.mocked(queue.upsertSession)).toHaveBeenCalledTimes(1);
    expect(checkedNames()).toEqual(["Hard"]);
    expect(location.pathname).toBe(`/session/${S1}/summary`);
    held.release();
    await waitFor(() => expect(location.pathname).toBe("/"));
    await waitReal(50);
    expect(vi.mocked(queue.upsertSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(queue.upsertSession).mock.calls[0]![0].effort_rating).toBe(4);
    expect((await storedRow()).effort_rating).toBe(4);
  });

  it("rejection: the polite text shows, the location stays, and a second Save calls again", async () => {
    await openEnded();
    const status = document.querySelector('[data-part="save-status"]')!;
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toBe("");
    vi.mocked(queue.upsertSession).mockRejectedValueOnce(new Error("IndexedDB said no"));
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await screen.findByText(en.uf03.saveFailed);
    expect(screen.getByText(en.uf03.saveFailed)).toBe(status);
    expect(screen.queryByRole("alert")).toBeNull();
    await waitReal(50);
    expect(location.pathname).toBe(`/session/${S1}/summary`);
    expect(saveButton()).toHaveAttribute("aria-disabled", "false");
    expect(checkedNames()).toEqual(["Hard"]);

    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(vi.mocked(queue.upsertSession)).toHaveBeenCalledTimes(2);
    expect((await storedRow()).effort_rating).toBe(4);
  });

  it("a row gone from IndexedDB at the tap is a rejection too, with no call", async () => {
    await openEnded();
    await act(async () => {
      await db.sessions.delete(S1);
    });
    fireEvent.click(saveButton());
    await screen.findByText(en.uf03.saveFailed);
    await waitReal(50);
    expect(vi.mocked(queue.upsertSession)).not.toHaveBeenCalled();
    expect(location.pathname).toBe(`/session/${S1}/summary`);
  });
});

describe("AC-5 a stored rating (D-0142 §4, D-0148 §3)", () => {
  it("stored 2 checks 'Easy'; picking 'Very hard' and saving sends 5", async () => {
    await openEnded({ effortRating: 2 });
    expect(checkedNames()).toEqual(["Easy"]);
    const row = await storedRow();
    fireEvent.click(radio("Very hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(vi.mocked(queue.upsertSession).mock.calls).toEqual([[{ ...row, effort_rating: 5 }]]);
    expect((await storedRow()).effort_rating).toBe(5);
  });

  it("stored null checks nothing", async () => {
    await openEnded({ effortRating: null });
    await waitReal(50);
    expect(checkedNames()).toEqual([]);
  });

  it("coming back: reopening a saved summary preselects the saved rating", async () => {
    await openEnded();
    fireEvent.click(radio("About right"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(location.pathname).toBe("/"));
    act(() => void location.navigate!(`/session/${S1}/summary`));
    await screen.findByRole("radiogroup", { name: en.uf03.effortName });
    expect(checkedNames()).toEqual(["About right"]);
  });
});

describe("AC-6 a11y", () => {
  it("Save is a button and axe finds 0 violations with a chip checked", async () => {
    await openEnded();
    expect(saveButton().tagName).toBe("BUTTON");
    expect(saveButton()).toHaveAttribute("type", "button");
    fireEvent.click(radio("Hard"));
    expect(await axeViolations()).toEqual([]);
  });

  it("axe finds 0 violations while pending", async () => {
    await openEnded();
    const held = holdUpsert();
    fireEvent.click(radio("Hard"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveAttribute("aria-disabled", "true"));
    expect(await axeViolations()).toEqual([]);
    held.release();
    await waitFor(() => expect(location.pathname).toBe("/"));
  });
});
