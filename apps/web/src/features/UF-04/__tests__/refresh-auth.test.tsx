// T-0384 UF-04.1 / UF-04.2: the mount refresh runs only online and signed in, once per mount
// (D-0113 §1 to §5), a late signed-in makes the screen pending again (D-0115 §3), and a rejected
// cache read is swallowed (D-0104, D-0115 §2).
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
const hoisted = vi.hoisted(() => ({ refreshAll: vi.fn(), loadLibrary: vi.fn() }));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  hoisted.loadLibrary.mockImplementation(real.loadLibrary);
  return {
    ...real,
    refreshAll: (...a: Parameters<typeof real.refreshAll>) => hoisted.refreshAll(...a),
    loadLibrary: () => hoisted.loadLibrary(),
  };
});

const real = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
  "../../../lib/offline/history.js",
);
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { authState } = await import("./auth-mock.js");
type AuthStatus = import("./auth-mock.js").AuthStatus;
const { setOnline, rowNames, screenId } = await import("./harness.js");
const { Library, LibraryDetail } = await import("../index.js");
const { useScreenData, REFRESH_CAP_MS } = await import("../data.js");

const DOWNLOAD_COPY = "The exercise library downloads the first time you're online.";

async function seedCache(): Promise<void> {
  spy.reset();
  seedSpy(spy);
  await real.refreshAll(NOW, TZ);
  spy.reset();
  seedSpy(spy);
  spy.from.mockClear();
}

function tree(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/library" element={<Library timeZone={TZ} />} />
        <Route path="/library/:exerciseId" element={<LibraryDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

function mount(path: "/library" | "/library/back-squat" = "/library") {
  window.history.replaceState(null, "", path);
  const view = render(tree());
  return { ...view, rerenderSame: () => view.rerender(tree()) };
}

const macrotask = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  setOnline(true);
  authState.status = "signed-in";
  hoisted.refreshAll.mockReset();
  hoisted.refreshAll.mockResolvedValue(undefined);
  hoisted.loadLibrary.mockClear();
  hoisted.loadLibrary.mockImplementation(real.loadLibrary);
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  authState.status = "signed-in";
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

describe("AC1 online + signed-in refreshes once and re-reads", () => {
  it("UF-04.1 calls refreshAll exactly once and re-reads the cache after it settles", async () => {
    await seedCache();
    mount();
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    await waitFor(() => expect(hoisted.loadLibrary).toHaveBeenCalledTimes(2));
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
    expect(hoisted.loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("re-reads at the 3 s cap when the refresh hangs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hoisted.refreshAll.mockReturnValue(new Promise(() => {}));
    const read = vi.fn(() => Promise.resolve("v"));
    const { result } = renderHook(() =>
      useScreenData(read, "k", { refresh: true, status: "signed-in" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_CAP_MS - 1));
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });
});

describe("D-0113 §5 both values: status × online", () => {
  const CASES: ReadonlyArray<readonly [AuthStatus, boolean, number]> = [
    ["signed-in", true, 1],
    ["signed-in", false, 0],
    ["stale", true, 0],
    ["stale", false, 0],
    ["signed-out", true, 0],
    ["signed-out", false, 0],
  ];
  it.each(CASES)("%s, online=%s → %i refreshAll calls", async (status, online, calls) => {
    await seedCache();
    authState.status = status;
    setOnline(online);
    mount();
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(calls);
    expect(hoisted.loadLibrary).toHaveBeenCalledTimes(calls === 1 ? 2 : 1);
  });
});

describe("AC2 online + stale renders from the cache, as offline does", () => {
  it("makes 0 refreshAll and 0 supabase.from calls, and shows the seeded list", async () => {
    await seedCache();
    authState.status = "stale";
    mount();
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
    expect(rowNames()).toHaveLength(24);
  });

  it("an empty cache shows the never-downloaded copy at once (pending is false)", async () => {
    authState.status = "stale";
    mount();
    expect(await screen.findByText(DOWNLOAD_COPY)).toBeInTheDocument();
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
  });

  it("hook: pending is false after the first read", async () => {
    const read = vi.fn(() => Promise.resolve("v"));
    const { result } = renderHook(() =>
      useScreenData(read, "k", { refresh: true, status: "stale" }),
    );
    await waitFor(() => expect(result.current.data).toBe("v"));
    expect(result.current.pending).toBe(false);
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("AC3 online + signed-out", () => {
  it("makes 0 refreshAll calls after 50 ms", async () => {
    authState.status = "signed-out";
    mount();
    expect(await screen.findByText(DOWNLOAD_COPY)).toBeInTheDocument();
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
  });
});

describe("AC4 stale → signed-in during the mount", () => {
  it("refreshes exactly once, pending until the following re-read lands, and never again", async () => {
    spy.reset();
    seedSpy(spy);
    authState.status = "stale";
    let fill = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      fill = () => resolve(real.refreshAll(NOW, TZ).then(() => undefined));
    });
    hoisted.refreshAll.mockReturnValue(inFlight);
    const view = mount();
    expect(await screen.findByText(DOWNLOAD_COPY)).toBeInTheDocument();
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();

    authState.status = "signed-in";
    view.rerenderSame();
    await waitFor(() => expect(hoisted.refreshAll).toHaveBeenCalledTimes(1));
    // Pending again: the "never downloaded" claim is withdrawn while the refresh fills the cache.
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
    await macrotask();
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
    expect(rowNames()).toHaveLength(0);

    await act(async () => {
      fill();
      await inFlight;
    });
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();

    await macrotask();
    view.rerenderSame();
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
  });

  it("hook: pending is true from the late start until the re-read after the refresh", async () => {
    let settle = (): void => {};
    hoisted.refreshAll.mockReturnValue(new Promise<void>((r) => (settle = r)));
    let n = 0;
    const read = vi.fn(() => Promise.resolve(++n));
    const { result, rerender } = renderHook(
      ({ status }: { status: AuthStatus }) => useScreenData(read, "k", { refresh: true, status }),
      { initialProps: { status: "stale" as AuthStatus } },
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(result.current.pending).toBe(false);

    rerender({ status: "signed-in" });
    expect(result.current.pending).toBe(true);
    await macrotask();
    expect(result.current.pending).toBe(true);
    expect(result.current.data).toBe(1);

    await act(async () => settle());
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(result.current.pending).toBe(false);
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
  });

  it("signed-in → stale → signed-in in one mount still refreshes once (the once-per-mount flag)", async () => {
    const read = vi.fn(() => Promise.resolve("v"));
    const { result, rerender } = renderHook(
      ({ status }: { status: AuthStatus }) => useScreenData(read, "k", { refresh: true, status }),
      { initialProps: { status: "signed-in" as AuthStatus } },
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender({ status: "stale" });
    await macrotask();
    rerender({ status: "signed-in" });
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it("a status change does not cancel the refresh in flight", async () => {
    let settle = (): void => {};
    hoisted.refreshAll.mockReturnValue(new Promise<void>((r) => (settle = r)));
    let n = 0;
    const read = vi.fn(() => Promise.resolve(++n));
    const { result, rerender } = renderHook(
      ({ status }: { status: AuthStatus }) => useScreenData(read, "k", { refresh: true, status }),
      { initialProps: { status: "signed-in" as AuthStatus } },
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(result.current.pending).toBe(true);
    rerender({ status: "stale" });
    await act(async () => settle());
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(result.current.pending).toBe(false);
  });

  it("StrictMode's double effect still makes exactly 1 call", async () => {
    await seedCache();
    window.history.replaceState(null, "", "/library");
    render(<StrictMode>{tree()}</StrictMode>);
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
  });
});

describe("AC5 the cap is measured from the refresh start (D-0113 §4)", () => {
  it("stale at mount, signed-in at t = 1000 ms: the re-read lands at 4000 ms, not 3000 ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    hoisted.refreshAll.mockReturnValue(new Promise(() => {}));
    const read = vi.fn(() => Promise.resolve("v"));
    const { result, rerender } = renderHook(
      ({ status }: { status: AuthStatus }) => useScreenData(read, "k", { refresh: true, status }),
      { initialProps: { status: "stale" as AuthStatus } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(read).toHaveBeenCalledTimes(1);
    rerender({ status: "signed-in" });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(2000)); // t = 3000
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(999)); // t = 3999
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1)); // t = 4000
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });
});

describe("AC6 UF-04.2 online + signed-in", () => {
  it("LibraryDetail calls refreshAll exactly once", async () => {
    await seedCache();
    mount("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    await macrotask();
    expect(hoisted.refreshAll).toHaveBeenCalledTimes(1);
  });

  it("contrast: LibraryDetail stale calls it 0 times", async () => {
    await seedCache();
    authState.status = "stale";
    mount("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    await macrotask();
    expect(hoisted.refreshAll).not.toHaveBeenCalled();
  });
});

describe("AC7 a rejected cache read (D-0104)", () => {
  it("hook: no unhandled rejection or console.error; data lands on the re-read", async () => {
    const consoleError = vi.spyOn(console, "error");
    let settle = (): void => {};
    hoisted.refreshAll.mockReturnValue(new Promise<void>((r) => (settle = r)));
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("idb"))
      .mockResolvedValue("fresh");
    const { result } = renderHook(() =>
      useScreenData(read, "k", { refresh: true, status: "signed-in" }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await macrotask();
    expect(result.current.data).toBeUndefined();
    expect(result.current.pending).toBe(true);
    await act(async () => settle());
    await waitFor(() => expect(result.current.data).toBe("fresh"));
    expect(result.current.pending).toBe(false);
    await macrotask();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("UF-04.1: a first read that rejects, then the re-read shows the rows", async () => {
    await seedCache();
    const consoleError = vi.spyOn(console, "error");
    hoisted.loadLibrary.mockRejectedValueOnce(new Error("idb"));
    mount();
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    await macrotask();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("UF-04.1: both reads reject → the empty wrapper, no error screen", async () => {
    await seedCache();
    const consoleError = vi.spyOn(console, "error");
    hoisted.loadLibrary.mockRejectedValue(new Error("idb"));
    mount();
    await waitFor(() => expect(hoisted.loadLibrary).toHaveBeenCalledTimes(2));
    await macrotask();
    expect(screenId()).toBe("UF-04.1");
    expect(rowNames()).toHaveLength(0);
    expect(screen.queryByText(DOWNLOAD_COPY)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
