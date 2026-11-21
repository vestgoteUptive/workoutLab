// T-0949 AC7 (D-0246 §6, D-0247 §1): with UF-09.10 open, Escape and browser Back close only the
// sheet. The real host under a BrowserRouter over jsdom's window.history (as t0394.back.test).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionHost } from "../host.js";
import { guardOnTop } from "../back-guard.js";
import { advance, flushReal, screenIds, storedFocus } from "./helpers.js";
import { session } from "./probe.js";
import { addButton, openSheet, prepare, seed, settle } from "./t0949-setup.js";
import { PAUSED_REST } from "./t0947-fixtures.js";

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: [], loaded: true }),
  useOnline: () => true,
}));
vi.mock("../../../lib/offline/favorites-hooks.js", () => ({
  useFavoriteList: () => ({ ids: [], loaded: true }),
}));
vi.mock("../../../lib/offline/history.js", async (orig) => {
  const actual = await orig<typeof import("../../../lib/offline/history.js")>();
  return { ...actual, loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB) };
});
vi.mock("../../../lib/offline/index.js", async (orig) => {
  const { offlineSpies } = await import("./offline-spies.js");
  const m = await offlineSpies(orig);
  return { ...m, loadLibrary: vi.fn(async () => (await import("./t0947-fixtures.js")).LIB) };
});
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const pathname = () => window.location.pathname;

async function mount() {
  window.history.pushState(null, "", "/");
  window.history.pushState(null, "", "/session/setup");
  window.history.pushState(null, "", "/session/S1");
  render(
    <BrowserRouter>
      <Routes>
        <Route path="/session/:sessionId" element={<SessionHost locale="en-GB" />} />
        <Route path="/session/:sessionId/summary" element={<span data-screen-id="UF-03.3" />} />
        <Route path="/session/setup" element={<span data-testid="setup" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </BrowserRouter>,
  );
  await flushReal();
}

async function back(): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((r) =>
      window.addEventListener("popstate", () => r(), { once: true }),
    );
    window.history.back();
    vi.advanceTimersByTime(50);
    await popped;
  });
  await flushReal();
  act(() => {
    vi.advanceTimersByTime(50);
  });
  await flushReal();
}

beforeEach(async () => {
  await prepare();
  await seed(PAUSED_REST);
  await mount();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const stillPaused = async () => {
  expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest" });
  expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "rest" });
  // Timers stopped: a long wait changes nothing.
  await advance(300_000);
  expect(session().state).toMatchObject({ phase: "paused", resumePhase: "rest" });
};

describe("AC7 Escape", () => {
  it("closes only the sheet: focus on Add exercise, route unchanged, still paused, guard on top", async () => {
    await openSheet();
    expect(guardOnTop()).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screenIds()).toEqual(["UF-09.9"]);
    expect(document.activeElement).toBe(addButton());
    expect(pathname()).toBe("/session/S1");
    expect(guardOnTop()).toBe(true);
    await stillPaused();
  });
});

describe("AC7 Back (popstate)", () => {
  it("closes only the sheet and pushes the guard again; Paused is not left", async () => {
    await openSheet();
    const length = window.history.length;
    await back();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screenIds()).toEqual(["UF-09.9"]);
    expect(document.activeElement).toBe(addButton());
    expect(pathname()).toBe("/session/S1");
    expect(guardOnTop()).toBe(true);
    expect(window.history.length).toBe(length);
    await stillPaused();
  });

  it("a second Back, with no sheet open, still leaves the session (D-0163 §1)", async () => {
    await openSheet();
    await back();
    await back();
    expect(pathname()).toBe("/session/setup");
  });
});
