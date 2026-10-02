// T-0411 UF-08.4 / UF-09 (D-0053 §7, D-0116): `flushSessions` clears `pending` only when the
// stored entry is still the row it sent. The compare is structural (`sameValue`), not JSON, so a
// re-queue that changes a value JSON flattens (`Date`, `Map`, `Set`, `NaN`, `±Infinity`) stays
// pending and is sent on the next flush. Setup as in the T-0385 rework block of
// `sync.enqueue-flush.test.ts`: the `sessions` handler re-queues during the request.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const flushModule = await import("../flush.js");
const { flush } = flushModule;
const { upsertSession } = await import("../queue.js");
type SessionInsert = import("../queue.js").SessionInsert;
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function sessionRow(): SessionInsert {
  return {
    id: SESSION_ID,
    user_id: USER,
    started_at: "2026-10-02T10:00:00.000Z",
    time_budget_min: 30,
  };
}

function withField(field: Record<string, unknown>): SessionInsert {
  return { ...sessionRow(), ...(field as unknown as Partial<SessionInsert>) };
}

/** Queues `sent`, re-queues `requeued` while the `sessions` request is in flight, flushes. */
async function flushWithRequeue(sent: SessionInsert, requeued: SessionInsert) {
  spy.setHandler("sessions", async () => {
    await upsertSession(requeued);
    return { error: null };
  });
  await upsertSession(sent);
  await flush(USER);
  expect(spy.calls.filter((c) => c.table === "sessions")).toHaveLength(1);
  return offlineDb().sessions.get(SESSION_ID);
}

beforeEach(() => {
  freshOfflineDb();
  spy.calls.length = 0;
  spy.from.mockClear();
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
  flushModule.clearAuthBlocked(USER);
  signIn(USER);
});

afterEach(() => {
  signOut();
});

describe("T-0411 AC1 a changed non-JSON value stays pending", () => {
  const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    [
      "Date → another Date",
      { plan: { at: new Date("2026-10-02T10:00:00Z") } },
      { plan: { at: new Date("2026-10-02T10:40:00Z") } },
    ],
    [
      "Map value changed",
      { plan: { m: new Map([["a", 1]]) } },
      { plan: { m: new Map([["a", 2]]) } },
    ],
    ["Set element changed", { plan: { s: new Set([1]) } }, { plan: { s: new Set([2]) } }],
    ["effort_rating null → NaN", { effort_rating: null }, { effort_rating: NaN }],
    ["Infinity → null", { plan: { x: Infinity } }, { plan: { x: null } }],
    ["Date(0) → {}", { plan: { at: new Date(0) } }, { plan: { at: {} } }],
  ];

  it.each(cases)("T-0411 AC1 %s: pending, and the row is the re-queued one", async (_n, l, r) => {
    const requeued = withField(r);
    const stored = await flushWithRequeue(withField(l), requeued);

    expect(stored).toMatchObject({ pending: true });
    expect(stored!.row).toEqual(requeued);
  });
});

describe("T-0411 AC2 the same non-JSON value is cleared", () => {
  const cases: Array<[string, () => unknown]> = [
    ["Date with the same time", () => new Date("2026-10-02T10:00:00Z")],
    ["an equal Map", () => new Map([["a", 1]])],
    ["an equal Set", () => new Set([1, 2])],
    ["NaN vs NaN", () => NaN],
  ];

  it.each(cases)("T-0411 AC2 %s: pending cleared after one request", async (_n, make) => {
    const stored = await flushWithRequeue(
      withField({ plan: { v: make() } }),
      withField({ plan: { v: make() } }),
    );

    expect(stored).toMatchObject({ pending: false });
  });
});

describe("T-0411 AC3 JSON behaviour kept (sameValue unit cases)", () => {
  const { sameValue } = flushModule;
  const cases: Array<[string, unknown, unknown, boolean]> = [
    ["key order ignored", { a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, true],
    ["undefined member equals missing", { a: 1, c: undefined }, { a: 1 }, true],
    ["array order matters", [1, 2], [2, 1], false],
    ["number vs string", { a: 1 }, { a: "1" }, false],
    ["0 and -0", 0, -0, true],
    ["typed arrays are conservative", new Uint8Array([1]), new Uint8Array([1]), false],
    ["bigint primitives", 1n, 1n, true],
    // An own "__proto__" key (JSON.parse makes these, structured clone keeps them) must be
    // compared as an own key, never resolved through b's prototype chain.
    ["own __proto__ key vs {z: 5}", JSON.parse('{"__proto__": {}}'), { z: 5 }, false],
  ];

  it.each(cases)("T-0411 AC3 %s", (_n, a, b, expected) => {
    expect(sameValue(a, b)).toBe(expected);
    expect(sameValue(b, a)).toBe(expected);
  });

  it("T-0411 AC3 sameValue never throws on any AC1–AC3 input", () => {
    const inputs: unknown[] = [
      new Date("2026-10-02T10:00:00Z"),
      new Date(0),
      new Date(NaN),
      new Map([["a", 1]]),
      new Set([1, 2]),
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      {},
      { a: 1, b: [1, 2] },
      { a: 1, c: undefined },
      [1, 2],
      0,
      -0,
      "1",
      new Uint8Array([1]),
      1n,
      Symbol("s"),
      () => 1,
      Object.create(null) as object,
    ];
    for (const a of inputs) for (const b of inputs) expect(() => sameValue(a, b)).not.toThrow();
    expect(sameValue(new Date(NaN), new Date(NaN))).toBe(true);
  });
});

describe("T-0411 AC5 no JSON in the compare", () => {
  it("T-0411 AC5 flush.ts never calls JSON.stringify", () => {
    // vitest runs with cwd = apps/web.
    const source = readFileSync(resolve(process.cwd(), "src/lib/offline/flush.ts"), "utf8");
    expect(source).not.toMatch(/JSON\s*\.\s*stringify/);
  });
});
