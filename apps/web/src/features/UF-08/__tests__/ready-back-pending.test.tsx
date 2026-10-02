// T-0397 UF-08.4: Back is inert while Start's `upsertSession` is pending (no orphan session, no
// second Start), and the unmount-while-pending branch (the `mounted` guard) is pinned.
// `upsertSession` is a spy held on a deferred promise; negatives wait a real 50 ms macrotask.
//
// Red proofs (build log in the ticket): AC-1 is red on the unfixed Ready (Back navigates to
// ?step=suggested), and AC-3's resolve rows are red with `if (!mounted.current) return` removed.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
} from "react-router";
import { suggest, type SessionInput } from "@workoutlab/engine";
import { upsertSession, type SessionInsert } from "../../../lib/offline/queue.js";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
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

const upsert = vi.mocked(upsertSession);
const suggestSpy = vi.mocked(suggest);

// T-0408 (D-0096): local budgets on waits for lazy route chunks (the --concurrency=1 gate).
const LAZY_WAIT_MS = 5_000;
const LAZY_TEST_MS = 15_000;

let navLog: { pathname: string; search: string; type: string }[] = [];
let remote: NavigateFunction | null = null;
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

/** The router's navigate, held outside Ready (AC-3: "navigates the router from outside"). */
function Remote() {
  remote = useNavigate();
  return null;
}

function renderHost(props: SessionSetupProps) {
  return render(
    <MemoryRouter initialEntries={["/", "/session/setup"]} initialIndex={1}>
      <NavLog />
      <Remote />
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
const backLink = () => screen.getByRole("link", { name: "Back" });

/** UF-08.1 → 30 min → Suggest → UF-08.2 → Looks good → UF-08.4. */
async function toReady() {
  const view = renderHost({ ...F_TZ_PROPS, clock: () => new Date(NOW) });
  await waitFor(() => expect(fitLine()).toHaveTextContent(/^Fits: /), { timeout: LAZY_WAIT_MS });
  fireEvent.click(button("30 minutes"));
  await waitFor(() => expect(fitLine()).toHaveTextContent(/^Fits: /), { timeout: LAZY_WAIT_MS });
  fireEvent.click(button("Suggest my workout"));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]), { timeout: LAZY_WAIT_MS });
  fireEvent.click(button("Looks good"));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.4"]), { timeout: LAZY_WAIT_MS });
  return view;
}

function okEntry(row: SessionInsert) {
  return { id: row.id as string, userId: "u", row, finished: false, pending: true };
}

/** Holds every `upsertSession` call on one deferred promise. */
function holdWrite() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  upsert.mockImplementation(async (row) => {
    await promise;
    return okEntry(row);
  });
  return { resolve, reject };
}

/** Start tapped and its write pending (Start shows aria-disabled). */
async function startPending() {
  fireEvent.click(startButton());
  await waitFor(() => expect(startButton()).toHaveAttribute("aria-disabled", "true"));
  expect(upsert).toHaveBeenCalledTimes(1);
}

/** The W-R7E4 call at 30 min (the `api/openapi.yaml` example); every other call is the engine. */
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
  remote = null;
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

/** AC-1 tail: the write resolves → one REPLACE to /session/<the single call's id>. */
async function expectResolvedToFocus(resolve: () => void, before: number) {
  resolve();
  const id = upsert.mock.calls[0]![0].id as string;
  await waitFor(() => expect(last().pathname).toBe(`/session/${id}`));
  expect(last()).toEqual({ pathname: `/session/${id}`, search: "", type: "REPLACE" });
  expect(navLog).toHaveLength(before + 1);
  expect(upsert).toHaveBeenCalledTimes(1);
}

describe("AC-1 Back is inert while Start is pending", () => {
  it(
    "T-0397 AC-1 click: Back stays on ?step=ready with aria-disabled; resolve REPLACEs to /session/<id>",
    async () => {
      const write = holdWrite();
      await toReady();
      await startPending();
      const before = navLog.length;

      fireEvent.click(backLink());
      await settle();
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=ready" });
      expect(navLog).toHaveLength(before);
      expect(screenIds()).toEqual(["UF-08.4"]);
      expect(backLink()).toHaveAttribute("aria-disabled", "true");
      expect(backLink()).toHaveAttribute("href", "/session/setup?step=suggested");

      await expectResolvedToFocus(write.resolve, before);
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );

  it(
    "T-0397 AC-1 Enter: Enter on the focused Back link while pending gives the same result",
    async () => {
      const write = holdWrite();
      await toReady();
      await startPending();
      const before = navLog.length;
      const link = backLink();
      link.focus();
      expect(link).toHaveFocus();
      // jsdom has no activation behaviour for Enter on a link; a browser fires `click` on it.
      fireEvent.keyDown(link, { key: "Enter", code: "Enter" });
      fireEvent.click(link);
      fireEvent.keyUp(link, { key: "Enter", code: "Enter" });
      await settle();
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=ready" });
      expect(navLog).toHaveLength(before);
      expect(screenIds()).toEqual(["UF-08.4"]);
      expect(backLink()).toHaveAttribute("aria-disabled", "true");

      await expectResolvedToFocus(write.resolve, before);
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );
});

describe("AC-2 the pair: Back works when nothing is pending", () => {
  it(
    "T-0397 AC-2 before any Start: no aria-disabled, Back goes to ?step=suggested",
    async () => {
      await toReady();
      expect(backLink()).not.toHaveAttribute("aria-disabled");
      fireEvent.click(backLink());
      await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=suggested" });
      expect(upsert).not.toHaveBeenCalled();
    },
    LAZY_TEST_MS,
  );

  it(
    "T-0397 AC-2 after a rejected write: the alert shows, no aria-disabled, Back goes to ?step=suggested",
    async () => {
      const write = holdWrite();
      await toReady();
      await startPending();
      write.reject(new Error("QuotaExceededError"));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't start the workout. Try again.",
      );
      expect(backLink()).not.toHaveAttribute("aria-disabled");
      fireEvent.click(backLink());
      await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=suggested" });
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );
});

describe("AC-3 Ready unmounts while Start is pending", () => {
  it(
    "T-0397 AC-3 router navigates away, then the write resolves: no /session/<id>, no console.error",
    async () => {
      const write = holdWrite();
      await toReady();
      await startPending();
      const errors = vi.spyOn(console, "error");
      await act(async () => {
        await remote!("/session/setup?step=suggested");
      });
      await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));

      write.resolve();
      await settle();
      const id = upsert.mock.calls[0]![0].id as string;
      expect(last().pathname).not.toBe(`/session/${id}`);
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=suggested" });
      expect(screen.queryByTestId("focus")).toBeNull();
      expect(errors).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );

  it(
    "T-0397 AC-3 router navigates away, then the write rejects: no alert, no console.error",
    async () => {
      const write = holdWrite();
      await toReady();
      await startPending();
      const errors = vi.spyOn(console, "error");
      await act(async () => {
        await remote!("/session/setup?step=suggested");
      });
      await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));

      write.reject(new Error("AbortError"));
      await settle();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(last()).toMatchObject({ pathname: "/session/setup", search: "?step=suggested" });
      expect(errors).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );

  it(
    "T-0397 AC-3 the tree unmounts, then the write resolves: no navigate, no console.error",
    async () => {
      const write = holdWrite();
      const view = await toReady();
      await startPending();
      const before = navLog.length;
      const errors = vi.spyOn(console, "error");
      view.unmount();

      write.resolve();
      await settle();
      expect(navLog).toHaveLength(before);
      expect(errors).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );

  it(
    "T-0397 AC-3 the tree unmounts, then the write rejects: no alert, no console.error",
    async () => {
      const write = holdWrite();
      const view = await toReady();
      await startPending();
      const errors = vi.spyOn(console, "error");
      view.unmount();

      write.reject(new Error("AbortError"));
      await settle();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(errors).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    },
    LAZY_TEST_MS,
  );
});
