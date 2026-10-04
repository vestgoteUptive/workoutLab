// T-0485: `AutoSync`'s mount `flushNow()` is gated on `navigator.onLine`, the same as the
// `refreshAll` call beside it (D-0045 §6, D-0116). Offline at mount, a flush can only fail into
// backoff; the `online` listener `startSync` registers (and the enqueue path in `sync.ts`) covers
// the return of the network, so this guard loses no coverage. AC-1 and AC-3 mock `../sync.js`
// directly (the flush loop isn't under test there); AC-2 drives the real `startSync` to prove the
// `online` event still flushes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("T-0485 AC-1 / AC-3: mocked startSync", () => {
  let useAuthMock: ReturnType<typeof vi.fn>;
  let startSyncMock: ReturnType<typeof vi.fn>;
  let flushNowMock: ReturnType<typeof vi.fn>;
  let stopMock: ReturnType<typeof vi.fn>;
  let refreshAllMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    flushNowMock = vi.fn(() => Promise.resolve());
    stopMock = vi.fn();
    startSyncMock = vi.fn(() => ({ flushNow: flushNowMock, stop: stopMock }));
    refreshAllMock = vi.fn(() => Promise.resolve());
    useAuthMock = vi.fn();

    vi.doMock("../../auth/auth-context.js", () => ({ useAuth: useAuthMock }));
    vi.doMock("../sync.js", () => ({ startSync: startSyncMock }));
    vi.doMock("../history.js", () => ({ refreshAll: refreshAllMock }));
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock("../../auth/auth-context.js");
    vi.doUnmock("../sync.js");
    vi.doUnmock("../history.js");
  });

  it("AC-1 offline mount: startSync runs, flushNow and refreshAll don't", async () => {
    useAuthMock.mockReturnValue({ status: "signed-in" });
    setOnLine(false);
    const { AutoSync } = await import("../AutoSync.js");

    render(<AutoSync />);
    await wait(50);

    expect(startSyncMock).toHaveBeenCalledTimes(1);
    expect(flushNowMock).toHaveBeenCalledTimes(0);
    expect(refreshAllMock).toHaveBeenCalledTimes(0);
  });

  it("AC-1 pair: online mount calls flushNow and refreshAll exactly once", async () => {
    useAuthMock.mockReturnValue({ status: "signed-in" });
    setOnLine(true);
    const { AutoSync } = await import("../AutoSync.js");

    render(<AutoSync />);
    await wait(50);

    expect(startSyncMock).toHaveBeenCalledTimes(1);
    expect(flushNowMock).toHaveBeenCalledTimes(1);
    expect(refreshAllMock).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "AC-3 signed out (onLine=%s): startSync is never called",
    async (onLine) => {
      useAuthMock.mockReturnValue({ status: "signed-out" });
      setOnLine(onLine);
      const { AutoSync } = await import("../AutoSync.js");

      render(<AutoSync />);
      await wait(50);

      expect(startSyncMock).toHaveBeenCalledTimes(0);
    },
  );
});

describe("T-0485 AC-2: real startSync, the online event still flushes", () => {
  const USER = "11111111-1111-4111-8111-111111111111";
  let flushMock: ReturnType<typeof vi.fn>;
  let currentUserIdMock: ReturnType<typeof vi.fn>;
  let refreshAllMock: ReturnType<typeof vi.fn>;
  let useAuthMock: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    flushMock = vi.fn(() => Promise.resolve("empty" as const));
    currentUserIdMock = vi.fn(() => USER);
    refreshAllMock = vi.fn(() => Promise.resolve());
    useAuthMock = vi.fn(() => ({ status: "signed-in" }));
    unsubscribe = vi.fn();

    vi.doMock("../../auth/auth-context.js", () => ({ useAuth: useAuthMock }));
    vi.doMock("../flush.js", () => ({
      flush: flushMock,
      clearAuthBlocked: vi.fn(),
      markAuthBlocked: vi.fn(),
    }));
    vi.doMock("../current-user.js", () => ({ currentUserId: currentUserIdMock }));
    vi.doMock("../history.js", () => ({
      refreshAll: refreshAllMock,
      refreshHistory: vi.fn(() => Promise.resolve()),
      refreshTargets: vi.fn(() => Promise.resolve()),
      refreshProfile: vi.fn(() => Promise.resolve()),
      refreshLibrary: vi.fn(() => Promise.resolve()),
      refreshSessions: vi.fn(() => Promise.resolve()),
      refreshCheckins: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("../../auth/client.js", () => ({
      supabase: {
        auth: {
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
        },
      },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock("../../auth/auth-context.js");
    vi.doUnmock("../flush.js");
    vi.doUnmock("../current-user.js");
    vi.doUnmock("../history.js");
    vi.doUnmock("../../auth/client.js");
  });

  it("AC-2 offline mount: no flush for 50ms, then the online event flushes once", async () => {
    setOnLine(false);
    const { AutoSync } = await import("../AutoSync.js");

    render(<AutoSync />);
    await wait(50);
    expect(flushMock).toHaveBeenCalledTimes(0);

    setOnLine(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(flushMock).toHaveBeenCalledTimes(1));
    expect(flushMock).toHaveBeenCalledWith(USER, expect.anything());
  });

  it("AC-2 contrast: online at mount flushes once before any online event", async () => {
    setOnLine(true);
    const { AutoSync } = await import("../AutoSync.js");

    render(<AutoSync />);
    await vi.waitFor(() => expect(flushMock).toHaveBeenCalledTimes(1));
    expect(flushMock).toHaveBeenCalledWith(USER, expect.anything());
  });
});
