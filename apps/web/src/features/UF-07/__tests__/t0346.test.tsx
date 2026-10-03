// T-0346 UF-07.1: refresh a cached routine on mount, replace only an untouched draft, and reset
// the load outcome when the route id changes in place (D-0174 §4, amending D-0081 §5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { offlineDb } from "../../../lib/offline/db.js";
import { R, USER, putRoutine, renderEditor, seed } from "./harness.js";
import { RoutineEditor } from "../index.js";
import { offline, setAuth, setOnline, spy } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const A = "bench-press-barbell";
const B = "pull-up";
const C = "plank";
const NAME = "Name";
const location = () => screen.getByTestId("location");

/** The stubbed refresh: another device saved R as "Push v2" with a third item. */
function stubFresh(gate?: Promise<void>) {
  offline.refreshRoutines.mockImplementation(async () => {
    await gate;
    await putRoutine(R, "Push v2", [A, B, C]);
  });
}
function stubDeleted() {
  offline.refreshRoutines.mockImplementation(async () => {
    await offlineDb().routineCache.delete(`${USER}:${R}`);
  });
}
const hold = () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
};

beforeEach(async () => {
  await seed({ routines: false });
  await putRoutine(R, "Push", [A, B]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setOnline(true);
  setAuth("signed-in");
});

describe("T-0346 AC-1 an untouched draft takes the fresh row", () => {
  it("T-0346 AC-1 name, list and Save payload follow the refreshed row", async () => {
    stubFresh();
    renderEditor(`/plan/routines/${R}`);
    await waitFor(() => expect(screen.getByLabelText(NAME)).toHaveValue("Push v2"));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(spy.calls[0]!.payload).toMatchObject({ name: "Push v2" });
    const rows = spy.calls.find((c) => c.table === "routine_items" && c.method === "upsert")!
      .payload as unknown[];
    expect(rows).toHaveLength(3);
  });
});

describe("T-0346 AC-2 a touched draft is kept", () => {
  it("T-0346 AC-2 a typed name survives the refresh", async () => {
    const { gate, release } = hold();
    stubFresh(gate);
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Push day" } });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(offline.loadRoutinesCalls).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(NAME)).toHaveValue("Push day");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("T-0346 AC-2 a removed item survives the refresh", async () => {
    const { gate, release } = hold();
    stubFresh(gate);
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    fireEvent.click(screen.getByRole("button", { name: "Remove Pull-up" }));
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByLabelText(NAME)).toHaveValue("Push");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("T-0346 AC-3 auth and network", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("T-0346 AC-3 online + signed-in: exactly one call", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    await waitFor(() => expect(offline.refreshRoutines).toHaveBeenCalledTimes(1));
    await act(settle);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
  });

  it("T-0346 AC-3 online + stale: no call", async () => {
    setAuth("stale");
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    await act(settle);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
  });

  it("T-0346 AC-3 stale then signed-in during the mount: exactly one call", async () => {
    setAuth("stale");
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    await act(settle);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
    act(() => setAuth("signed-in"));
    await waitFor(() => expect(offline.refreshRoutines).toHaveBeenCalledTimes(1));
    await act(settle);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
  });

  it("T-0346 AC-3 offline + signed-in: no call, the form shows the cache", async () => {
    setOnline(false);
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    await act(settle);
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
    expect(screen.getByLabelText(NAME)).toHaveValue("Push");
  });
});

describe("T-0346 AC-4 the 3 s cap", () => {
  it("T-0346 AC-4 a refresh that never settles leaves the form usable and untouched", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (e: Error) => void;
    offline.refreshRoutines.mockImplementation(() => new Promise<void>((_, rej) => (reject = rej)));
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    expect(screen.getByLabelText(NAME)).toHaveValue("Push");
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Push " } });
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Push" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByLabelText(NAME)).toHaveValue("Push");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await act(async () => {
      reject(new Error("late"));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByLabelText(NAME)).toHaveValue("Push");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("T-0346 AC-5 deleted elsewhere", () => {
  it("T-0346 AC-5 an untouched draft navigates to /plan with replace", async () => {
    stubDeleted();
    renderEditor(`/plan/routines/${R}`);
    await waitFor(() => expect(location().textContent).toBe("/plan"));
  });

  it("T-0346 AC-5 replace keeps the history length (back does not return to the routine)", async () => {
    stubDeleted();
    function History() {
      const nav = useNavigate();
      return (
        <button type="button" onClick={() => nav(-1)}>
          back
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={["/home", `/plan/routines/${R}`]} initialIndex={1}>
        <History />
        <Routes>
          <Route path="/plan/routines/:routineId" element={<RoutineEditor />} />
          <Route path="/plan" element={<div data-testid="plan" />} />
          <Route path="/home" element={<div data-testid="home" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId("plan");
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    // replace swapped the routine entry for /plan, so back lands on /home, not on the routine.
    await screen.findByTestId("home");
  });

  it("T-0346 AC-5 a touched draft stays with the user's text", async () => {
    const { gate, release } = hold();
    offline.refreshRoutines.mockImplementation(async () => {
      await gate;
      await offlineDb().routineCache.delete(`${USER}:${R}`);
    });
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Bench press");
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Mine" } });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(location()).toHaveTextContent(`/plan/routines/${R}`);
    expect(screen.getByLabelText(NAME)).toHaveValue("Mine");
  });
});

describe("T-0346 AC-6 the route id changes in place", () => {
  it("T-0346 AC-6 a loadFailed alert from the previous id does not survive", async () => {
    function Go() {
      const nav = useNavigate();
      return (
        <button type="button" onClick={() => nav(`/plan/routines/${R}`)}>
          go
        </button>
      );
    }
    offline.throwRoutines = true;
    render(
      <MemoryRouter initialEntries={["/plan/routines/55555555-5555-4555-8555-555555555555"]}>
        <Go />
        <Routes>
          <Route path="/plan/routines/:routineId" element={<RoutineEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    offline.throwRoutines = false;
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(screen.getByLabelText(NAME)).toHaveValue("Push"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
