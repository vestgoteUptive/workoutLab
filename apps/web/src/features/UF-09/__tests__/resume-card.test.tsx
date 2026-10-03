// T-0395 `ResumeCard` (D-0139 §3 §4): the "Workout in progress" card on its own, over the real
// `lib/offline` and fake-indexeddb, with a real `wl-focus:<id>` written through
// `initialFocusState` (as `load.ts` does on first load). AC7 renders it beside `SessionHost`, so
// a click on "Resume workout" is a real PUSH into the UF-09 host.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { offlineDb as realOfflineDb } from "../../../lib/offline/db.js";
import { SessionHost } from "../host.js";
import { initialFocusState } from "../machine.js";
import { focusKey } from "../persist.js";
import { ResumeCard } from "../resume-card.js";
import { P1, S1, USER_A, STARTED_AT_MS } from "./fixtures.js";
import { flushReal, freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);

const NOW = new Date(STARTED_AT_MS + 90 * 60_000);

/** Writes the focus state `load.ts` would have written on the session's first load: P1 item 0,
 *  with `count` logged sets of bench-press. */
function writeFocusState(sessionId: string, count: number, atMs: number = NOW.getTime()): void {
  const state = {
    ...initialFocusState(sessionId, P1, atMs),
    phase: "rest" as const,
    itemIndex: 0,
    setIndex: count,
    timer: { startedAtMs: atMs, durationS: 120, pausedMs: 0 },
    loggedSets: Array.from({ length: count }, (_, i) => ({
      clientId: `c${i}`,
      itemIndex: 0,
      setIndex: i,
      exerciseId: "bench-press",
      reps: 6,
      weightKg: 80,
      durationS: null,
      rir: null,
      backoff: false,
    })),
  };
  window.localStorage.setItem(focusKey(sessionId), JSON.stringify(state));
}

beforeEach(() => {
  vi.mocked(offline.offlineDb).mockImplementation(realOfflineDb);
  window.localStorage.clear();
  freshDb();
  signIn(USER_A);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("T-0395 AC1 the card", () => {
  it("shows the title, the line and the resume link for a seeded session", async () => {
    await seedSession({ id: S1, started_at: "2026-09-27T09:30:00.000Z" });
    writeFocusState(S1, 3);
    render(
      <MemoryRouter>
        <ResumeCard now={NOW} locale="en-GB" timeZone="UTC" />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Workout in progress")).toBeInTheDocument();
    expect(await screen.findByText("Started 09:30 · 3 of 12 sets")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Resume workout" });
    expect(link).toHaveAttribute("href", `/session/${S1}`);
  });

  it("on main (no seeded session) there is no [data-part=resume]", async () => {
    render(
      <MemoryRouter>
        <ResumeCard now={NOW} locale="en-GB" timeZone="UTC" />
      </MemoryRouter>,
    );
    await flushReal();
    expect(document.querySelector('[data-part="resume"]')).toBeNull();
  });
});

describe("T-0395 AC3 the newest wins (rendered)", () => {
  it("links to the newer of two seeded sessions", async () => {
    await seedSession({ id: "s1", started_at: "2026-09-27T09:00:00.000Z" });
    writeFocusState("s1", 0);
    await seedSession({ id: "s2", started_at: "2026-09-27T09:30:00.000Z" });
    writeFocusState("s2", 0);
    render(
      <MemoryRouter>
        <ResumeCard now={NOW} locale="en-GB" timeZone="UTC" />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "Resume workout" });
    expect(link).toHaveAttribute("href", "/session/s2");
  });
});

describe("T-0395 AC5 offline", () => {
  it("renders the same with navigator.onLine false, and never calls fetch", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedSession({ id: S1, started_at: "2026-09-27T09:30:00.000Z" });
    writeFocusState(S1, 3);
    render(
      <MemoryRouter>
        <ResumeCard now={NOW} locale="en-GB" timeZone="UTC" />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Started 09:30 · 3 of 12 sets")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0395 AC7 resume reopens the workout", () => {
  beforeEach(() => {
    useFakeClock(NOW.getTime());
    window.history.pushState(null, "", "/");
  });

  it("a click on Resume workout shows the UF-09 host restored from the stored focus state", async () => {
    await seedSession({ id: S1, started_at: new Date(NOW.getTime() - 30 * 60_000).toISOString() });
    writeFocusState(S1, 2);
    render(
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <div>
                <ResumeCard now={NOW} locale="en-GB" timeZone="UTC" />
                <span data-testid="today" />
              </div>
            }
          />
          <Route path="/session/:sessionId" element={<SessionHost />} />
        </Routes>
      </BrowserRouter>,
    );
    await flushReal();
    // `findByRole` polls with `setTimeout`, which is faked here: `getByRole` after `flushReal`
    // is the one that actually waits (on a real macrotask) for the card to resolve.
    const link = screen.getByRole("link", { name: "Resume workout" });
    fireEvent.click(link);
    await flushReal();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-09.5"]')).not.toBeNull();
    expect(screen.queryByTestId("today")).toBeNull();
    // Back means Pause (T-0394, D-0123 §3): the first Back pauses, on the same URL; the second
    // leaves for real, back to Today (a PUSH, not a replace, so this Back lands there).
    const back = async () => {
      await act(async () => {
        const popped = new Promise<void>((r) =>
          window.addEventListener("popstate", () => r(), { once: true }),
        );
        window.history.back();
        vi.advanceTimersByTime(50);
        await popped;
      });
      await flushReal();
    };
    await back();
    expect(document.querySelector('[data-screen-id="UF-09.9"]')).not.toBeNull();
    await back();
    expect(screen.getByTestId("today")).toBeInTheDocument();
  });
});
