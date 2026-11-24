// T-1008: AutoSync starts the ledger sync once per signed-in user, and restarts it when another
// user signs in without a signed-out render in between (the effect depends on the user id).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

describe("T-1008 AutoSync ledger sync", () => {
  const useAuthMock = vi.fn();
  const startLedger = vi.fn();
  const stopLedger = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    startLedger.mockReset().mockReturnValue({ stop: stopLedger });
    stopLedger.mockReset();
    vi.doMock("../../auth/auth-context.js", () => ({ useAuth: useAuthMock }));
    vi.doMock("../sync.js", () => ({
      startSync: () => ({ flushNow: () => Promise.resolve(), stop: () => undefined }),
    }));
    vi.doMock("../history.js", () => ({ refreshAll: () => Promise.resolve() }));
    vi.doMock("../edit-ledger-sync.js", () => ({ startLedgerSync: startLedger }));
    vi.doMock("../unilateral-flags.js", () => ({ warmUnilateralFlags: () => Promise.resolve() }));
  });
  afterEach(() => {
    cleanup();
    vi.doUnmock("../../auth/auth-context.js");
    vi.doUnmock("../sync.js");
    vi.doUnmock("../history.js");
    vi.doUnmock("../edit-ledger-sync.js");
    vi.doUnmock("../unilateral-flags.js");
  });

  it("starts once per user, stops the old one on a user switch, and does nothing signed out", async () => {
    const { AutoSync } = await import("../AutoSync.js");
    useAuthMock.mockReturnValue({ status: "signed-out", userId: null });
    const view = render(<AutoSync />);
    expect(startLedger).not.toHaveBeenCalled();
    useAuthMock.mockReturnValue({ status: "signed-in", userId: "u1" });
    view.rerender(<AutoSync />);
    expect(startLedger).toHaveBeenCalledTimes(1);
    useAuthMock.mockReturnValue({ status: "signed-in", userId: "u2" });
    view.rerender(<AutoSync />);
    expect(stopLedger).toHaveBeenCalledTimes(1);
    expect(startLedger).toHaveBeenCalledTimes(2);
  });
});
