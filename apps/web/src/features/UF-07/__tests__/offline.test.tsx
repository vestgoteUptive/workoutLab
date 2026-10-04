// T-0308a UF-07.1: AC-A9 (offline) and AC-A11 (unknown routine id, D-0081 §5).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { offlineDb } from "../../../lib/offline/db.js";
import { R, USER, renderEditor, seed } from "./harness.js";
import { offline, setOnline, spy } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const location = () => screen.getByTestId("location");
const SAVE = () => screen.getByRole("button", { name: "Save" });
const DELETE = () => screen.getByRole("button", { name: "Delete routine" });
const CONNECT = "Connect to save";

describe("AC-A9 offline", () => {
  beforeEach(async () => {
    await seed();
    setOnline(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    return () => {
      vi.unstubAllGlobals();
      setOnline(true);
    };
  });

  it("renders from the cache, disables Save and Delete, edits still work, no write", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Barbell back squat");
    expect(screen.getByText("3. Leg curl (machine)")).toBeInTheDocument();
    expect(SAVE()).toBeDisabled();
    expect(DELETE()).toBeDisabled();
    expect(screen.getByText(CONNECT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move Leg curl (machine) up" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Barbell back squat" }));
    expect(screen.getByText("1. Leg curl (machine)")).toBeInTheDocument();
    fireEvent.click(SAVE());
    expect(spy.calls).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enables both on the online event without a remount; offline disables them again", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Barbell back squat");
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(SAVE()).toBeEnabled();
    expect(DELETE()).toBeEnabled();
    expect(screen.queryByText(CONNECT)).not.toBeInTheDocument();
    expect(screen.getByText("1. Barbell back squat")).toBeInTheDocument();

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(SAVE()).toBeDisabled();
    expect(DELETE()).toBeDisabled();
    expect(screen.getByText(CONNECT)).toBeInTheDocument();
  });
});

describe("AC-A11 unknown routine id", () => {
  const UNKNOWN = "99999999-9999-4999-8999-999999999999";
  beforeEach(() => seed());

  it("offline: redirects to /plan and never calls refreshRoutines", async () => {
    setOnline(false);
    renderEditor(`/plan/routines/${UNKNOWN}`);
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
  });

  it("online, still missing after the refresh: refresh awaited once, then /plan", async () => {
    renderEditor(`/plan/routines/${UNKNOWN}`);
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
  });

  it("online, the refresh brings it in: the editor renders it and does not redirect", async () => {
    offline.refreshRoutines.mockImplementation(async () => {
      await offlineDb().routineCache.put({
        key: `${USER}:${UNKNOWN}`,
        userId: USER,
        id: UNKNOWN,
        name: "From the server",
        updatedAt: "2026-09-29T10:00:00.000Z",
        items: [{ position: 0, exerciseId: "plank" }],
      });
    });
    renderEditor(`/plan/routines/${UNKNOWN}`);
    expect(await screen.findByLabelText("Name")).toHaveValue("From the server");
    expect(screen.getByText("1. Plank")).toBeInTheDocument();
    expect(location()).toHaveTextContent(`/plan/routines/${UNKNOWN}`);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
  });

  // D-0174 §4 supersedes the old "no refresh for a known id" rule: a cached id now refreshes once.
  it("a known routine is rendered from the cache, then refreshed once (D-0174 §4)", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText("1. Barbell back squat");
    await waitFor(() => expect(offline.refreshRoutines).toHaveBeenCalledTimes(1));
  });

  it("a refresh that rejects still ends in the redirect", async () => {
    offline.refreshRoutines.mockRejectedValue(new Error("boom"));
    renderEditor(`/plan/routines/${UNKNOWN}`);
    await waitFor(() => expect(location().textContent).toBe("/plan"));
  });
});

// D-0081 §5 draws the line at "a read that succeeded and didn't find it". A cache the browser
// won't open at all is not that, so it must never cost the user their routine by redirecting.
// Commit 85f134c added the guard; nothing pinned it, and `loadRoutines` resolves `[]` rather
// than rejecting, so the `null` branch is only reachable through a throwing loader.
describe("a cache that cannot be read never redirects", () => {
  beforeEach(() => seed());

  it.each([true, false])(
    "loadRoutines rejects (online: %s): the editor stays put and does not redirect",
    async (isOnline) => {
      setOnline(isOnline);
      offline.throwRoutines = true;
      renderEditor(`/plan/routines/${R}`);
      await screen.findByRole("heading", { level: 1 });
      // Long enough for a redirect to have landed if one were coming.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(location()).toHaveTextContent(`/plan/routines/${R}`);
      expect(spy.calls).toHaveLength(0);
      setOnline(true);
    },
  );

  it("contrast: the same read succeeding but not finding the id does redirect", async () => {
    setOnline(false);
    renderEditor("/plan/routines/99999999-9999-4999-8999-999999999999");
    await waitFor(() => expect(location().textContent).toBe("/plan"));
    setOnline(true);
  });

  it("loadLibrary rejects: the rows still render from their raw ids and nothing throws", async () => {
    offline.throwLibrary = true;
    renderEditor(`/plan/routines/${R}`);
    // No library means no display names, so AC-A12's raw-id fallback carries the whole list.
    expect(await screen.findByText("1. barbell-back-squat")).toBeInTheDocument();
    expect(screen.getByText("3. leg-curl-machine")).toBeInTheDocument();
    expect(location()).toHaveTextContent(`/plan/routines/${R}`);
    fireEvent.click(screen.getByRole("button", { name: "Move leg-curl-machine up" }));
    expect(screen.getByText("2. leg-curl-machine")).toBeInTheDocument();
  });
});

// A refresh that never settles is the realistic flaky-network case: `navigator.onLine` is true,
// but the request hangs. Without the cap the user sits on a heading with no form and no way out.
// Real timer turns, not a microtask flush, so the mid-flight window the test exists to catch
// stays open (the brief's trap 4).
describe("a refresh that never settles is capped, then the redirect lands", () => {
  beforeEach(() => seed());

  it("holds while the refresh hangs, and redirects once the 3s cap fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      offline.refreshRoutines.mockImplementation(() => new Promise<void>(() => {}));
      renderEditor("/plan/routines/99999999-9999-4999-8999-999999999999");
      await vi.advanceTimersByTimeAsync(10);
      // Still waiting on the refresh: no redirect yet, and no premature "unknown routine".
      expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
      expect(location()).toHaveTextContent("/plan/routines/99999999");

      await vi.advanceTimersByTimeAsync(2500);
      expect(location()).toHaveTextContent("/plan/routines/99999999");

      // The cap fires at 3000ms, the second read still misses, and the redirect lands.
      await vi.advanceTimersByTimeAsync(600);
      await vi.waitFor(() => expect(location().textContent).toBe("/plan"));
      expect(spy.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
