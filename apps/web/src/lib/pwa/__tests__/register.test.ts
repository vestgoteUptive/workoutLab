// T-0429: unit checks for `registerServiceWorker` (the e2e proof is tests/e2e/sw-registration.spec.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "../register.js";

function fakeWindow(readyState: DocumentReadyState, register: () => Promise<unknown>) {
  const target = new EventTarget();
  return Object.assign(target, {
    navigator: { serviceWorker: { register: vi.fn(register) } },
    document: { readyState },
  }) as unknown as Window & {
    navigator: { serviceWorker: { register: ReturnType<typeof vi.fn> } };
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("T-0429 registerServiceWorker", () => {
  it("T-0429 does nothing outside a production build", () => {
    const win = fakeWindow("complete", () => Promise.resolve({}));
    registerServiceWorker({ prod: false, win });
    expect(win.navigator.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("T-0429 does nothing without serviceWorker support", () => {
    const win = Object.assign(new EventTarget(), {
      navigator: {},
      document: { readyState: "complete" },
    }) as unknown as Window;
    expect(() => registerServiceWorker({ prod: true, win })).not.toThrow();
  });

  it("T-0429 registers /sw.js with scope / at once when the document has loaded", () => {
    const win = fakeWindow("complete", () => Promise.resolve({}));
    registerServiceWorker({ prod: true, win });
    expect(win.navigator.serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(win.navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("T-0429 waits for the load event otherwise, and registers once", () => {
    const win = fakeWindow("interactive", () => Promise.resolve({}));
    registerServiceWorker({ prod: true, win });
    expect(win.navigator.serviceWorker.register).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("load"));
    win.dispatchEvent(new Event("load"));
    expect(win.navigator.serviceWorker.register).toHaveBeenCalledTimes(1);
  });

  it("T-0429 a rejected registration logs one warning and no error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const win = fakeWindow("complete", () => Promise.reject(new Error("t0429-register-failed")));
    registerServiceWorker({ prod: true, win });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(error).not.toHaveBeenCalled();
  });
});
