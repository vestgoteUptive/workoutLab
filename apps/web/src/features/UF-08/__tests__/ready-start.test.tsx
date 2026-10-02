// T-0303d UF-08.4 through the host: AC-1 (W-R7E4 handed over), AC-4 (Start writes the session
// first, NFR-OFF-2), AC-5 (a failed write and its retry, D-0110 §3) and AC-8 (Back, cold load).
// `upsertSession` is a spy; the real queue over fake-indexeddb is ready-real-queue.test.tsx.
//
// The "navigate only after the write" assert (AC-4) must fail on the planted fault named in the
// ticket: navigate before awaiting the write (build log in the ticket's accept log).
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { suggest, type SessionInput, type Workout } from "@workoutlab/engine";
import { parseSessionPlan } from "@workoutlab/shared";
import { upsertSession, type SessionInsert } from "../../../lib/offline/queue.js";
import { Ready } from "../Ready.js";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
import { Suggested } from "../Suggested.js";
import { F_TZ_PROPS, fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";
import { NOW } from "./fixtures.js";
import { wR7E4 } from "./workouts.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});
vi.mock("../Suggested.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Suggested.js")>();
  return { Suggested: vi.fn(actual.Suggested) };
});
vi.mock("../Ready.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Ready.js")>();
  return { Ready: vi.fn(actual.Ready) };
});

const upsert = vi.mocked(upsertSession);
const suggestSpy = vi.mocked(suggest);
const suggestedView = vi.mocked(Suggested);
const readyView = vi.mocked(Ready);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Every committed location, in order (to count navigations and their types). */
let navLog: { pathname: string; search: string; type: string }[] = [];
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

function NavLog() {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    navLog.push({ pathname: location.pathname, search: location.search, type });
  }, [location, type]);
  return null;
}

function renderHost(props: SessionSetupProps, at = "/session/setup") {
  return render(
    <MemoryRouter initialEntries={["/", at]} initialIndex={1}>
      <NavLog />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/session/:id" element={<span data-testid="focus" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const last = () => navLog.at(-1)!;
const button = (name: string) => screen.getByRole("button", { name });
const startButton = () => screen.getByRole("button", { name: "Start" });

/** A clock whose value the test moves. */
function movableClock(start = NOW) {
  const state = { at: new Date(start) };
  return { state, clock: vi.fn(() => state.at) };
}

/** UF-08.1 → (setup) → Suggest → UF-08.2 → (adjust) → Looks good → UF-08.4. */
async function toReady(
  props: SessionSetupProps,
  opts: { setup?: () => void; adjust?: () => void } = {},
) {
  renderHost(props);
  await waitFor(() => expect(fitLine()).toHaveTextContent(/^Fits: /));
  fireEvent.click(button("30 minutes"));
  opts.setup?.();
  await waitFor(() => expect(fitLine()).toHaveTextContent(/^Fits: /));
  fireEvent.click(button("Suggest my workout"));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
  opts.adjust?.();
  fireEvent.click(button("Looks good"));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]));
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okEntry(row: SessionInsert) {
  return { id: row.id as string, userId: "u", row, finished: false, pending: true };
}

/** The UF-08.1 call at 30 min, Normal, warm-up in: W-R7E4 (the `api/openapi.yaml` example). Every
 *  other call is the real engine. */
async function serveWR7E4AtThirty(): Promise<void> {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  suggestSpy.mockImplementation((...args: Parameters<typeof suggest>) => {
    const input: SessionInput = args[4];
    const plain =
      input.budgetMin === 30 &&
      input.energy === "normal" &&
      input.warmupInBudget &&
      input.shuffle === 0 &&
      input.excludeIds.length === 0;
    return plain ? wR7E4() : actual.suggest(...args);
  });
}

beforeEach(async () => {
  auth.status = "signed-in";
  vi.clearAllMocks();
  await serveWR7E4AtThirty();
  navLog = [];
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  setOnline(false);
  serveCache();
  upsert.mockImplementation(async (row) => okEntry(row));
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.restoreAllMocks();
});

describe("AC-1 the handed-over W-R7E4 (D-0110 §1-§2)", () => {
  it("UF-08.1 30 min → Looks good hands Ready W-R7E4; the summary reads it with done by 12:29", async () => {
    const { clock } = movableClock();
    await toReady({ ...F_TZ_PROPS, clock });
    expect(readyView.mock.lastCall![0].workout).toEqual(wR7E4());
    expect(document.querySelector('[data-part="summary"]')!.textContent).toBe(
      "29 min · warm-up + 3 exercises · 9 sets · done by 12:29",
    );
  });

  it("the pair: clock() = 12:10 when Ready mounts (now still 12:00) gives done by 12:39", async () => {
    const { state, clock } = movableClock();
    await toReady(
      { ...F_TZ_PROPS, clock },
      {
        adjust: () => {
          state.at = new Date("2026-09-27T12:10:00+02:00");
        },
      },
    );
    expect(document.querySelector('[data-part="summary"]')!.textContent).toBe(
      "29 min · warm-up + 3 exercises · 9 sets · done by 12:39",
    );
  });
});

describe("AC-4 Start writes the session first (NFR-OFF-2, D-0110 §1 §4)", () => {
  it("the call: one upsertSession with the row, started_at = the tap's clock", async () => {
    const { state, clock } = movableClock();
    await toReady({ ...F_TZ_PROPS, clock });
    const workout = readyView.mock.lastCall![0].workout;
    state.at = new Date("2026-09-27T12:04:00+02:00");
    fireEvent.click(startButton());
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());

    expect(upsert).toHaveBeenCalledTimes(1);
    const row = upsert.mock.calls[0]![0];
    expect(row).toEqual({
      id: row.id,
      started_at: "2026-09-27T10:04:00.000Z",
      ended_at: null,
      time_budget_min: 30,
      energy: "normal",
      warmup_in_budget: true,
      plan: workout.plan,
    });
    expect(row.id).toMatch(UUID_V4);
    expect(row.plan).toEqual(wR7E4().plan);
    expect(parseSessionPlan(row.plan)).toMatchObject({ ok: true });
  });

  it("the pair: clock() = 12:00 at the tap gives started_at 10:00:00.000Z", async () => {
    const { clock } = movableClock();
    await toReady({ ...F_TZ_PROPS, clock });
    fireEvent.click(startButton());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0]![0].started_at).toBe("2026-09-27T10:00:00.000Z");
  });

  it("the inputs flow through: UF-08.1 Low + warm-up off, UF-08.2 chip 20", async () => {
    const { clock } = movableClock();
    await toReady(
      { ...F_TZ_PROPS, clock },
      {
        setup: () => {
          fireEvent.click(screen.getByRole("radio", { name: "Low" }));
          fireEvent.click(
            screen.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" }),
          );
        },
        adjust: () => fireEvent.click(button("20 minutes")),
      },
    );
    fireEvent.click(startButton());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0]![0]).toMatchObject({
      time_budget_min: 20,
      energy: "low",
      warmup_in_budget: false,
    });
  });

  it("navigates only after the write: still ?step=ready while pending, REPLACE to /session/<id> on resolve", async () => {
    const write = deferred();
    upsert.mockImplementation(async (row) => {
      await write.promise;
      return okEntry(row);
    });
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    const before = navLog.length;
    fireEvent.click(startButton());
    await settle();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=ready" });
    expect(navLog).toHaveLength(before);
    expect(screen.queryByTestId("focus")).toBeNull();

    write.resolve();
    const id = upsert.mock.calls[0]![0].id as string;
    await waitFor(() => expect(last().pathname).toBe(`/session/${id}`));
    expect(last().type).toBe("REPLACE");
    expect(navLog).toHaveLength(before + 1);
  });

  it("double tap: a second tap while pending makes no second call; aria-disabled only while pending", async () => {
    const write = deferred();
    upsert.mockImplementation(async (row) => {
      await write.promise;
      return okEntry(row);
    });
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    expect(startButton()).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(startButton());
    await waitFor(() => expect(startButton()).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(startButton());
    await settle();
    expect(upsert).toHaveBeenCalledTimes(1);

    write.resolve();
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("AC-5 a failed write (D-0110 §3)", () => {
  it("rejection: the alert shows, the location stays, no unhandled rejection, Start is enabled", async () => {
    upsert.mockRejectedValueOnce(new Error("QuotaExceededError"));
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    expect(screen.queryByRole("alert")).toBeNull();
    const before = navLog.length;
    fireEvent.click(startButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't start the workout. Try again.",
    );
    await settle();
    expect(navLog).toHaveLength(before);
    expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=ready" });
    expect(screenIds()).toEqual(["UF-08.4"]);
    expect(unhandled).toEqual([]);
    expect(startButton()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("pair: a write that succeeds shows no alert", async () => {
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    fireEvent.click(startButton());
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retry: the second tap reuses the same id and navigates once on resolve", async () => {
    upsert.mockRejectedValueOnce(new Error("AbortError"));
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    const before = navLog.length;
    fireEvent.click(startButton());
    await screen.findByRole("alert");
    fireEvent.click(startButton());
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    expect(upsert).toHaveBeenCalledTimes(2);
    const [first, second] = upsert.mock.calls.map((c) => c[0].id);
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
    expect(navLog).toHaveLength(before + 1);
    expect(last()).toEqual({ pathname: `/session/${first}`, search: "", type: "REPLACE" });
  });

  it("a new visit: Back to UF-08.2, Looks good, Start uses a different id", async () => {
    upsert.mockRejectedValueOnce(new Error("AbortError"));
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    fireEvent.click(startButton());
    await screen.findByRole("alert");
    const first = upsert.mock.calls[0]![0].id;

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    fireEvent.click(button("Looks good"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(startButton());
    await waitFor(() => expect(screen.getByTestId("focus")).toBeInTheDocument());
    const second = upsert.mock.calls[1]![0].id;
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });
});

describe("AC-8 Back and cold load (D-0110 §7)", () => {
  it("Back goes to ?step=suggested with the same Workout and no suggest call", async () => {
    await toReady({ ...F_TZ_PROPS, clock: movableClock().clock });
    const handed: Workout = readyView.mock.lastCall![0].workout;
    const calls = suggestSpy.mock.calls.length;
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=suggested" });
    expect(suggestedView.mock.lastCall![0].workout).toBe(handed);
    await settle();
    expect(suggestSpy.mock.calls.length).toBe(calls);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a cold load of ?step=ready still shows UF-08.1", async () => {
    renderHost({ ...F_TZ_PROPS, clock: movableClock().clock }, "/session/setup?step=ready");
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    expect(last()).toMatchObject({ pathname: "/session/setup", search: "", type: "REPLACE" });
  });
});
