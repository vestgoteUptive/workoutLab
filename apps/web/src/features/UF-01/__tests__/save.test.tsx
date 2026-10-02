// T-0301c AC-5..AC-10 (`/welcome/save`, screen `UF-01.5-save`, D-0064 §8, D-0100, D-0101): the
// save sequence (existence check → 9 targets → profile → clear → recheck → `/`), the existing
// profile winning, failure and Retry, offline, the no-plan state and the untouched start time.
//
// `lib/auth/client.js` is mocked with a `from` spy: the `lib/offline/__tests__/select-spy.ts`
// pattern (per-table call log and per-call answers), rebuilt here and extended for `upsert`,
// because no UF-01 file may import `lib/offline` (T-0301a AC-10). `lib/profile` is mocked with a
// hoisted recheck spy and never imported (D-0101 §3).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as engine from "@workoutlab/engine";

interface Answer {
  data: unknown;
  error: unknown;
}
type Responder = () => Promise<Answer>;

interface Call {
  table: string;
  op: "select" | "upsert" | "maybeSingle";
  args: unknown[];
}

const { db, recheck } = vi.hoisted(() => {
  const calls: Call[] = [];
  /** Per `table:op`, the queued answers; an empty queue answers `{data: null, error: null}`. */
  const queues = new Map<string, Responder[]>();
  const answer = (key: string): Promise<Answer> => {
    const next = queues.get(key)?.shift();
    return next ? next() : Promise.resolve({ data: null, error: null });
  };
  // Typed `(...args: unknown[])` to fit `clientMock`'s `from` parameter.
  const from = vi.fn((...fromArgs: unknown[]) => {
    const table = fromArgs[0] as string;
    return {
      select: (...args: unknown[]) => {
        calls.push({ table, op: "select", args });
        return {
          maybeSingle: () => {
            calls.push({ table, op: "maybeSingle", args: [] });
            return answer(`${table}:select`);
          },
        };
      },
      upsert: (...args: unknown[]) => {
        calls.push({ table, op: "upsert", args });
        return answer(`${table}:upsert`);
      },
    };
  });
  return {
    db: {
      from,
      calls,
      queue: (key: string, ...responders: Responder[]) => {
        queues.set(key, [...(queues.get(key) ?? []), ...responders]);
      },
      reset: () => {
        calls.length = 0;
        queues.clear();
        from.mockClear();
      },
      count: (table: string, op: Call["op"]) =>
        calls.filter((c) => c.table === table && c.op === op).length,
      order: () => calls.filter((c) => c.op !== "maybeSingle").map((c) => `${c.table}:${c.op}`),
    },
    recheck: { spy: null as unknown as ReturnType<typeof vi.fn>, at: [] as string[] },
  };
});

vi.mock("../../../lib/auth/client.js", async () =>
  (await import("./client-mock.js")).clientMock(db.from),
);
vi.mock("../../../lib/profile/index.js", () => ({ useRecheckProfile: () => recheck.spy }));
// A pass-through spy on the real `deriveTargets` (as `schedule.test.tsx`), so a test can change
// what the engine returns and see whether the rows follow (no target arithmetic in SaveScreen).
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, deriveTargets: vi.fn(actual.deriveTargets) };
});

const { AuthProvider } = await import("../../../lib/auth/auth-context.js");
const { Welcome } = await import("../index.js");
const { seedValidSession, setOnline } = await import("./harness.js");

const deriveTargets = vi.mocked(engine.deriveTargets);
const realDerive = (
  await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine")
).deriveTargets;

const KEY = "wl-onboarding";
const NOW = 100_000_000;
const PLAN = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 2,
  rhythmMax: 3,
  startedAtMs: 1_000_000,
  timingMs: 42_000,
  planShown: true,
  savedAtMs: NOW - 60_000,
};
const UNSHOWN = { ...PLAN, planShown: false };
const EXPIRED = { ...PLAN, savedAtMs: NOW - 86_400_001 };

const AREA_ORDER = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];
/** `deriveTargets` for 2–3 (R4-E3). */
const R4_E3 = [14, 14, 11, 9, 9, 14, 14, 11, 9];

const PROFILE = {
  goal: "get_stronger",
  level: "advanced",
  equipment: ["none", "dumbbell", "bench"],
  rhythm_min: 2,
  rhythm_max: 3,
  priority_areas: [],
  onboarding_timing_ms: 42_000,
};

const where = { current: "", action: "" };
function Probe() {
  where.current = useLocation().pathname;
  where.action = useNavigationType();
  return null;
}

function mount(path = "/welcome/save") {
  return render(
    <MemoryRouter initialEntries={["/welcome/schedule", path]} initialIndex={1}>
      <AuthProvider>
        <Probe />
        <Routes>
          <Route path="/welcome/*" element={<Welcome />} />
          <Route path="/account" element={<div data-screen-id="UF-01.5" />} />
          <Route path="/" element={<div data-screen-id="UF-02.1" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function findSave(): Promise<HTMLElement> {
  return (await screen.findByText(
    (_, el) => el?.getAttribute("data-screen-id") === "UF-01.5-save",
    {},
    { timeout: 2000 },
  )) as HTMLElement;
}

async function settle(): Promise<void> {
  await act(() => new Promise((r) => setTimeout(r, 50)));
}

function deferred(): { promise: Promise<Answer>; resolve: (a: Answer) => void } {
  let resolve!: (a: Answer) => void;
  const promise = new Promise<Answer>((r) => (resolve = r));
  return { promise, resolve };
}

function store(record: unknown): string {
  const raw = JSON.stringify(record);
  window.localStorage.setItem(KEY, raw);
  return raw;
}

const fail: Responder = () => Promise.resolve({ data: null, error: { code: "500" } });

function upsertArgs(table: string, n = 0): unknown[] {
  return db.calls.filter((c) => c.table === table && c.op === "upsert")[n]!.args;
}

const retry = () => screen.getByRole("button", { name: "Retry" });
const ERROR = "Couldn't save your plan. Try again.";

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(Date, "now").mockImplementation(() => NOW);
  setOnline(true);
  db.reset();
  recheck.at = [];
  recheck.spy = vi.fn(async () => {
    recheck.at.push(where.current);
  });
  deriveTargets.mockImplementation(realDerive);
  deriveTargets.mockClear();
  where.current = "";
  where.action = "";
});
afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

/** Signed in, PLAN stored. */
function arrange(record: unknown = PLAN): string {
  seedValidSession();
  return store(record);
}

describe("AC-5 the save (D-0100 §3, principle 3)", () => {
  it("without a tap: select, 9 targets, then the profile, clear, recheck, replace to /", async () => {
    arrange();
    const targets = deferred();
    const profile = deferred();
    let releaseRecheck!: () => void;
    recheck.spy.mockImplementation(async () => {
      recheck.at.push(where.current);
      await new Promise<void>((r) => (releaseRecheck = r));
    });
    db.queue("area_targets:upsert", () => targets.promise);
    db.queue("profiles:upsert", () => profile.promise);
    mount();
    await findSave();

    // 1. the existence check, once.
    await waitFor(() => expect(db.count("area_targets", "upsert")).toBe(1));
    expect(db.count("profiles", "select")).toBe(1);
    expect(db.calls.find((c) => c.table === "profiles" && c.op === "select")!.args).toEqual([
      "user_id",
    ]);
    expect(db.count("profiles", "maybeSingle")).toBe(1);

    // 2. the targets: 9 rows in area order, deriveTargets(2–3), source default, no user_id.
    const [rows, options] = upsertArgs("area_targets");
    expect(options).toEqual({ onConflict: "user_id,area_id" });
    expect(rows).toEqual(
      AREA_ORDER.map((area, i) => ({ area_id: area, sets_per_14d: R4_E3[i], source: "default" })),
    );
    for (const row of rows as object[]) expect(row).not.toHaveProperty("user_id");
    expect(deriveTargets).toHaveBeenCalledWith({ rhythmMin: 2, rhythmMax: 3, priorityAreas: [] });
    await settle();
    expect(db.count("profiles", "upsert")).toBe(0);

    // 3. after step 2 resolves, the profile.
    await act(async () => targets.resolve({ data: null, error: null }));
    await waitFor(() => expect(db.count("profiles", "upsert")).toBe(1));
    expect(upsertArgs("profiles")).toEqual([PROFILE, { onConflict: "user_id" }]);
    await settle();
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(recheck.spy).not.toHaveBeenCalled();

    // 4. after step 3 resolves: the record is gone and the recheck runs, still on /welcome/save.
    await act(async () => profile.resolve({ data: null, error: null }));
    await waitFor(() => expect(recheck.spy).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(recheck.at).toEqual(["/welcome/save"]);
    await settle();
    expect(where.current).toBe("/welcome/save");

    // 5. after the recheck resolves: `/`, by a replace navigation.
    await act(async () => releaseRecheck());
    await waitFor(() => expect(where.current).toBe("/"));
    expect(where.action).toBe("REPLACE");
    expect(document.querySelector('[data-screen-id="UF-02.1"]')).not.toBeNull();
    expect(db.order()).toEqual(["profiles:select", "area_targets:upsert", "profiles:upsert"]);
    expect(recheck.spy).toHaveBeenCalledTimes(1);
  });

  it("the rows follow deriveTargets: +1 per area from the engine gives +1 per row", async () => {
    deriveTargets.mockImplementation((input) => {
      const real = realDerive(input);
      return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, v + 1])) as typeof real;
    });
    arrange();
    mount();
    await waitFor(() => expect(db.count("area_targets", "upsert")).toBe(1));
    const [rows] = upsertArgs("area_targets");
    expect((rows as Array<{ sets_per_14d: number }>).map((r) => r.sets_per_14d)).toEqual(
      R4_E3.map((n) => n + 1),
    );
  });

  it("timingMs: null writes onboarding_timing_ms: null", async () => {
    arrange({ ...PLAN, timingMs: null });
    mount();
    await waitFor(() => expect(db.count("profiles", "upsert")).toBe(1));
    expect(upsertArgs("profiles")[0]).toEqual({ ...PROFILE, onboarding_timing_ms: null });
    await waitFor(() => expect(where.current).toBe("/"));
  });

  it("another plan maps its own answers (bodyweight, build_muscle, beginner, 3–4)", async () => {
    arrange({
      ...PLAN,
      goal: "build_muscle",
      level: "beginner",
      equipmentProfile: "bodyweight",
      rhythmMin: 3,
      rhythmMax: 4,
    });
    mount();
    await waitFor(() => expect(db.count("profiles", "upsert")).toBe(1));
    expect(upsertArgs("profiles")[0]).toEqual({
      ...PROFILE,
      goal: "build_muscle",
      level: "beginner",
      equipment: ["none"],
      rhythm_min: 3,
      rhythm_max: 4,
    });
    const [rows] = upsertArgs("area_targets");
    expect((rows as Array<{ sets_per_14d: number }>).map((r) => r.sets_per_14d)).toEqual([
      20, 20, 16, 12, 12, 20, 20, 16, 12,
    ]);
  });
});

describe("AC-6 the existing profile wins (D-0064 §8)", () => {
  it("a row from the select: no upsert, the record is removed, recheck once, then /", async () => {
    arrange();
    db.queue("profiles:select", () => Promise.resolve({ data: { user_id: "u1" }, error: null }));
    mount();
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.count("area_targets", "upsert")).toBe(0);
    expect(db.count("profiles", "upsert")).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(recheck.spy).toHaveBeenCalledTimes(1);
    expect(recheck.at).toEqual(["/welcome/save"]);
    expect(where.action).toBe("REPLACE");
  });
});

describe("AC-7 failure and Retry (D-0100 §3–§4)", () => {
  it("targets upsert fails: no profile upsert, record kept, alert + Retry, stays", async () => {
    const raw = arrange();
    db.queue("area_targets:upsert", fail);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(retry()).toBeInTheDocument();
    await settle();
    expect(db.count("profiles", "upsert")).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(where.current).toBe("/welcome/save");
    expect(recheck.spy).not.toHaveBeenCalled();

    // Retry, twice quickly: one more targets upsert, one profile upsert, select count stays 1.
    const button = retry();
    fireEvent.click(button);
    expect(retry()).toBe(button);
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.count("area_targets", "upsert")).toBe(2);
    expect(db.count("profiles", "upsert")).toBe(1);
    expect(db.count("profiles", "select")).toBe(1);
    expect(db.order()).toEqual([
      "profiles:select",
      "area_targets:upsert",
      "area_targets:upsert",
      "profiles:upsert",
    ]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(recheck.spy).toHaveBeenCalledTimes(1);
    expect(where.action).toBe("REPLACE");
  });

  it("a rejected targets upsert is the same failure", async () => {
    const raw = arrange();
    db.queue("area_targets:upsert", () => Promise.reject(new Error("network")));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(db.count("profiles", "upsert")).toBe(0);
  });

  it("targets succeed, profile fails: the same error; Retry resends both, in order", async () => {
    const raw = arrange();
    db.queue("profiles:upsert", fail);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(where.current).toBe("/welcome/save");
    expect(recheck.spy).not.toHaveBeenCalled();

    fireEvent.click(retry());
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.order()).toEqual([
      "profiles:select",
      "area_targets:upsert",
      "profiles:upsert",
      "area_targets:upsert",
      "profiles:upsert",
    ]);
    expect(upsertArgs("area_targets", 1)).toEqual(upsertArgs("area_targets", 0));
    expect(upsertArgs("profiles", 1)).toEqual([PROFILE, { onConflict: "user_id" }]);
    expect(recheck.spy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["resolves {error: 500}", fail],
    ["rejects", (() => Promise.reject(new Error("network"))) as Responder],
  ])("step 1 %s: the alert, no upserts; Retry runs step 1 again, then both", async (_n, r) => {
    const raw = arrange();
    db.queue("profiles:select", r);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(retry()).toBeInTheDocument();
    await settle();
    expect(db.count("area_targets", "upsert")).toBe(0);
    expect(db.count("profiles", "upsert")).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(recheck.spy).not.toHaveBeenCalled();

    fireEvent.click(retry());
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.count("profiles", "select")).toBe(2);
    expect(db.order()).toEqual([
      "profiles:select",
      "profiles:select",
      "area_targets:upsert",
      "profiles:upsert",
    ]);
  });

  it("step 1 runs once successfully per visit: a later failure's Retry skips it", async () => {
    arrange();
    db.queue("area_targets:upsert", fail, fail);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    fireEvent.click(retry());
    await waitFor(() => expect(db.count("area_targets", "upsert")).toBe(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    fireEvent.click(retry());
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.count("profiles", "select")).toBe(1);
    expect(db.count("area_targets", "upsert")).toBe(3);
  });
});

describe("AC-8 offline (D-0100 §4)", () => {
  it("offline at mount: no request, 'Connect to save your plan', no enabled Retry", async () => {
    arrange();
    setOnline(false);
    mount();
    const root = await findSave();
    expect(within(root).getByText("Connect to save your plan")).toBeInTheDocument();
    await settle();
    expect(db.from).not.toHaveBeenCalled();
    const retries = within(root).queryAllByRole("button", { name: "Retry" });
    expect(retries.filter((b) => !b.hasAttribute("disabled"))).toEqual([]);
    expect(where.current).toBe("/welcome/save");

    // Back online: the AC-5 sequence, no tap, ending at /.
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.order()).toEqual(["profiles:select", "area_targets:upsert", "profiles:upsert"]);
    expect(recheck.spy).toHaveBeenCalledTimes(1);
  });

  it("an AC-7 failure, then offline → online: the save restarts at the targets upsert", async () => {
    arrange();
    db.queue("area_targets:upsert", fail);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("Connect to save your plan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(where.current).toBe("/"));
    expect(db.order()).toEqual([
      "profiles:select",
      "area_targets:upsert",
      "area_targets:upsert",
      "profiles:upsert",
    ]);
  });
});

describe("AC-9 no saveable plan (D-0100 §2)", () => {
  it.each([
    ["no record", null],
    ["UNSHOWN", UNSHOWN],
    ["an expired PLAN", EXPIRED],
  ])("signed in with %s: Set up your plan, a link to /welcome/goal, no call", async (_n, rec) => {
    seedValidSession();
    if (rec) store(rec);
    mount();
    const root = await findSave();
    expect(within(root).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root).getByRole("heading", { level: 1 })).toHaveTextContent("Set up your plan");
    expect(
      within(root).getByText("Your answers aren't on this device. It takes under a minute."),
    ).toBeInTheDocument();
    expect(within(root).getByRole("link", { name: "Set up my plan" })).toHaveAttribute(
      "href",
      "/welcome/goal",
    );
    await settle();
    await settle();
    expect(where.current).toBe("/welcome/save");
    expect(db.from).not.toHaveBeenCalled();
    expect(recheck.spy).not.toHaveBeenCalled();
  });

  it("an UNSHOWN record is byte-identical afterwards (D-0098 §2: not deleted)", async () => {
    seedValidSession();
    const raw = store(UNSHOWN);
    mount();
    await findSave();
    await settle();
    expect(window.localStorage.getItem(KEY)).toBe(raw);
  });

  it("Set up my plan leads to UF-01.2", async () => {
    seedValidSession();
    mount();
    const root = await findSave();
    fireEvent.click(within(root).getByRole("link", { name: "Set up my plan" }));
    await waitFor(() => expect(where.current).toBe("/welcome/goal"));
  });

  it("signed out with PLAN: sent to /account to sign in first, with no call", async () => {
    const raw = store(PLAN);
    mount();
    await waitFor(() => expect(where.current).toBe("/account"));
    expect(db.from).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe(raw);
  });
});

describe("AC-10 the start time is untouched (D-0100 §5, D-0064 §7)", () => {
  it("no record and Date.now = 1 000 000: wl-onboarding stays absent", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000);
    seedValidSession();
    mount();
    await findSave();
    await settle();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("UNSHOWN with startedAtMs: null keeps it null", async () => {
    seedValidSession();
    store({ ...UNSHOWN, startedAtMs: null });
    mount();
    await findSave();
    await settle();
    expect(JSON.parse(window.localStorage.getItem(KEY)!).startedAtMs).toBeNull();
  });

  it("contrast: /welcome (UF-01.1) does set it, so the check can see a write", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000);
    mount("/welcome");
    await settle();
    expect(JSON.parse(window.localStorage.getItem(KEY)!).startedAtMs).toBe(1_000_000);
  });
});

// T-0382 AC7 (D-0100 §6, T-0381): the signed-out redirect to `/account` replaces `/welcome/save`,
// so Back from `/account` returns to `/welcome/schedule`, never to the redirecting save step.
describe("T-0382 AC7 the signed-out redirect replaces /welcome/save (D-0100 §6)", () => {
  it("T-0382 AC7 navigate(-1) from /account lands on /welcome/schedule, not /welcome/save", async () => {
    const back = { current: (() => {}) as (delta: number) => void };
    function AccountProbe() {
      const navigate = useNavigate();
      back.current = (delta) => void navigate(delta);
      return <div data-screen-id="UF-01.5" />;
    }
    store(PLAN);
    render(
      <MemoryRouter initialEntries={["/welcome/schedule", "/welcome/save"]} initialIndex={1}>
        <AuthProvider>
          <Probe />
          <Routes>
            <Route path="/welcome/*" element={<Welcome />} />
            <Route path="/account" element={<AccountProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(where.current).toBe("/account"));
    expect(where.action).toBe("REPLACE");
    act(() => back.current(-1));
    await waitFor(() => expect(where.action).toBe("POP"));
    expect(where.current).toBe("/welcome/schedule");
    expect(where.current).not.toBe("/welcome/save");
  });
});
