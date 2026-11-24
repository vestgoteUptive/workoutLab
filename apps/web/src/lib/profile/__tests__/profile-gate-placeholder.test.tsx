// T-0985 AC1..AC11 (D-0272): while the first profile read is pending and the device is online,
// ProfileGate shows a neutral placeholder instead of the gated route; offline, after a failed
// read and after the cap the route renders as before. Same harness as `app/__tests__/
// profile-gate.test.tsx` (`MemoryRouter` + `AuthProvider` + `ProfileStatusProvider` + `Shell`,
// `vi.mock` of `lib/auth/client.js`, `seedValidSession()`), with `loadProfile` and the
// `profiles` read as controllable promises. Real timers except AC7, which fakes `setTimeout`
// only and polls on the captured real one.
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../../../app/App.js";
import { routes } from "../../../app/routes.js";
import { AuthProvider } from "../../auth/auth-context.js";
import { ProfileStatusProvider, useRecheckProfile, PROFILE_PLACEHOLDER_MAX_MS } from "../index.js";
import { PROFILE_READ_TIMEOUT_MS } from "../status.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";

const realSetTimeout = globalThis.setTimeout;

const { loadProfile, refreshProfile } = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  refreshProfile: vi.fn(),
}));
vi.mock("../../offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../offline/index.js")>();
  return {
    ...actual,
    loadProfile,
    refreshProfile,
    loadSessions: vi.fn(async () => []),
    loadEngineHistory: vi.fn(async () => []),
    loadLibrary: vi.fn(async () => []),
    loadTargets: vi.fn(async () => []),
    refreshAll: vi.fn(async () => undefined),
  };
});

type ReadResult = { data: unknown; error: unknown };
const { read, onAuthStateChange, getSession, signOut, authStateCallbacks } = vi.hoisted(() => {
  const authStateCallbacks: Array<(event: string, session: unknown) => void> = [];
  return {
    // The `profiles` read: how many times it was issued, and how to settle each one.
    read: {
      calls: 0,
      aborted: 0,
      settlers: [] as Array<(r: ReadResult | "reject") => void>,
    },
    authStateCallbacks,
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      authStateCallbacks.push(cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    getSession: vi.fn(),
    signOut: vi.fn(),
  };
});
vi.mock("../../auth/client.js", () => {
  function query(): Record<string, unknown> {
    let signal: AbortSignal | undefined;
    const q: Record<string, unknown> = {
      select: () => q,
      retry: () => q,
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return q;
      },
      maybeSingle: () =>
        new Promise<ReadResult>((res, rej) => {
          read.calls += 1;
          read.settlers.push((r) => (r === "reject" ? rej(new Error("network")) : res(r)));
          signal?.addEventListener("abort", () => {
            read.aborted += 1;
            rej(new Error("aborted"));
          });
        }),
    };
    return q;
  }
  return {
    supabase: {
      auth: { onAuthStateChange, getSession, signOut },
      from: () => query(),
    },
  };
});

const ROW = { id: "u1", goal: "build" };
const GATED = ["/", "/library", "/progress", "/balance", "/plan", "/session/setup"] as const;

let navigateRef: ((path: string) => void) | undefined;
let locationRef = "";
let recheckRef: (() => Promise<void>) | undefined;

function Probes() {
  const navigate = useNavigate();
  const location = useLocation();
  const recheck = useRecheckProfile();
  locationRef = location.pathname;
  useEffect(() => {
    navigateRef = (p: string) => navigate(p);
    recheckRef = recheck;
  }, [navigate, recheck]);
  return null;
}

function Harness({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <AuthProvider>
        <ProfileStatusProvider>
          <Probes />
          <Shell />
        </ProfileStatusProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function seedValidSession() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({
      access_token: "tok",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    }),
  );
}

const screenOf = (id: string) => document.querySelector(`[data-screen-id="${id}"]`);
const placeholder = () => document.querySelector("[data-wl-profile-pending]");
const screenIdOf = (path: string) => routes.find((r) => r.path === path)!.screenId;

/** Every `data-screen-id` that was ever attached to the document, in order. */
function watchScreens(): { seen: string[]; stop: () => void } {
  const seen: string[] = [];
  const collect = (n: Node) => {
    if (!(n instanceof Element)) return;
    const own = n.getAttribute("data-screen-id");
    if (own) seen.push(own);
    n.querySelectorAll("[data-screen-id]").forEach((e) =>
      seen.push(e.getAttribute("data-screen-id")!),
    );
  };
  const mo = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(collect);
  });
  mo.observe(document, { childList: true, subtree: true });
  return { seen, stop: () => mo.disconnect() };
}

/** Polls on the captured real `setTimeout`, inside `act` (so it works under fake timers). */
async function pollUntil(check: () => void, timeoutMs = 5000): Promise<void> {
  const end = performance.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (performance.now() > end) throw error;
    }
    await act(async () => {
      await new Promise<void>((r) => realSetTimeout(r, 10));
    });
  }
}

async function flush() {
  await act(async () => {});
  await act(async () => {});
}

async function settleRead(r: ReadResult | "reject", index = 0) {
  await pollUntil(() => expect(read.settlers.length).toBeGreaterThan(index));
  await act(async () => {
    read.settlers[index]!(r);
  });
  await flush();
}

function online(on: boolean) {
  vi.stubGlobal("navigator", { onLine: on });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  loadProfile.mockReset();
  loadProfile.mockResolvedValue(null);
  refreshProfile.mockReset();
  refreshProfile.mockResolvedValue(undefined);
  read.calls = 0;
  read.aborted = 0;
  read.settlers.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  navigateRef = undefined;
  recheckRef = undefined;
  locationRef = "";
  authStateCallbacks.length = 0;
  freshOfflineDb();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  freshOfflineDb();
});

describe("T-0985 AC1/AC2 new user, online, read pending", () => {
  it("T-0985 AC1 shows the placeholder, never the route, and stays on /", async () => {
    seedValidSession();
    online(true);
    const w = watchScreens();
    render(<Harness start="/" />);
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(placeholder()?.closest("main")).not.toBeNull();
    expect(w.seen).not.toContain("UF-02.1");
    expect(screenOf("UF-02.1")).not.toBeInTheDocument();
    expect(locationRef).toBe("/");
    w.stop();
  });

  it.each(GATED)(
    "T-0985 AC2 %s: no row -> /welcome/save, the route never in the DOM",
    async (path) => {
      seedValidSession();
      online(true);
      const w = watchScreens();
      render(<Harness start={path} />);
      await pollUntil(() => expect(read.calls).toBe(1));
      await flush();
      expect(placeholder()).toBeInTheDocument();
      await settleRead({ data: null, error: null });
      await pollUntil(() => expect(screenOf("UF-01.5-save")).toBeInTheDocument());
      expect(locationRef).toBe("/welcome/save");
      expect(placeholder()).not.toBeInTheDocument();
      expect(w.seen).not.toContain(screenIdOf(path));
      expect(w.seen).not.toContain("UF-02.1");
      w.stop();
    },
  );
});

describe("T-0985 AC3/AC4 returning user", () => {
  it("T-0985 AC3 cached profile: route renders, no network read, no lasting placeholder", async () => {
    seedValidSession();
    online(true);
    loadProfile.mockResolvedValue(ROW);
    render(<Harness start="/" />);
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(placeholder()).not.toBeInTheDocument();
    expect(read.calls).toBe(0);
    expect(locationRef).toBe("/");
  });

  it("T-0985 AC4 no cache, read finds a row: placeholder until it settles, then the route", async () => {
    seedValidSession();
    online(true);
    const w = watchScreens();
    render(<Harness start="/" />);
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(w.seen).not.toContain("UF-02.1");
    await settleRead({ data: ROW, error: null });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(placeholder()).not.toBeInTheDocument();
    expect(locationRef).toBe("/");
    expect(w.seen).not.toContain("UF-01.5-save");
    w.stop();
  });
});

describe("T-0985 AC5 offline: no placeholder, route at once", () => {
  it.each(GATED)("T-0985 AC5 %s renders on the first commit, no read", async (path) => {
    seedValidSession();
    online(false);
    const w = watchScreens();
    render(<Harness start={path} />);
    expect(placeholder()).not.toBeInTheDocument();
    await pollUntil(() => expect(screenOf(screenIdOf(path))).toBeInTheDocument());
    expect(w.seen).toContain(screenIdOf(path));
    expect(locationRef).toBe(path);
    expect(read.calls).toBe(0);
    w.stop();
  });

  it("T-0985 AC5 the placeholder is never in the DOM at any commit", async () => {
    seedValidSession();
    online(false);
    let sawPlaceholder = false;
    const mo = new MutationObserver(() => {
      if (placeholder()) sawPlaceholder = true;
    });
    mo.observe(document, { childList: true, subtree: true });
    render(<Harness start="/" />);
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    await flush();
    mo.disconnect();
    expect(sawPlaceholder).toBe(false);
  });
});

describe("T-0985 AC6 online, read fails: route after the failure, never a redirect", () => {
  it.each([
    ["rejects", "reject" as const],
    ["resolves { error }", { data: null, error: { message: "boom" } }],
  ])("T-0985 AC6 read %s", async (_name, result) => {
    seedValidSession();
    online(true);
    render(<Harness start="/" />);
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(screenOf("UF-02.1")).not.toBeInTheDocument();
    await settleRead(result);
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(placeholder()).not.toBeInTheDocument();
    expect(locationRef).toBe("/");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("T-0985 AC7 the cap", () => {
  it("T-0985 AC7 a never-settling cache read: 3499 ms placeholder, 3500 ms route, late missing redirects", async () => {
    seedValidSession();
    online(true);
    let lateMissing!: (v: null) => void;
    loadProfile.mockReturnValue(new Promise<null>((r) => (lateMissing = r)));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start="/" />);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROFILE_PLACEHOLDER_MAX_MS - 1);
    });
    expect(placeholder()).toBeInTheDocument();
    expect(screenOf("UF-02.1")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(placeholder()).not.toBeInTheDocument();
    expect(locationRef).toBe("/");
    // The read then settles late with no row: a late `missing` still redirects.
    await act(async () => {
      lateMissing(null);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await pollUntil(() => expect(read.calls).toBe(1));
    await settleRead({ data: null, error: null });
    await pollUntil(() => expect(locationRef).toBe("/welcome/save"));
  });

  it("T-0985 AC7 a profiles read that never settles is aborted at 3000 ms and the route renders then", async () => {
    expect(PROFILE_READ_TIMEOUT_MS).toBeLessThan(PROFILE_PLACEHOLDER_MAX_MS);
    seedValidSession();
    online(true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start="/" />);
    await pollUntil(() => expect(read.calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROFILE_READ_TIMEOUT_MS - 1);
    });
    expect(placeholder()).toBeInTheDocument();
    expect(read.aborted).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(read.aborted).toBe(1);
    expect(placeholder()).not.toBeInTheDocument();
    expect(locationRef).toBe("/");
  });
});

describe("T-0985 cap: one per pending window, and no timer outlives the provider", () => {
  it("T-0985 cap fires once: navigating to a second gated route renders at once, no new blank", async () => {
    seedValidSession();
    online(true);
    loadProfile.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start="/" />);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROFILE_PLACEHOLDER_MAX_MS);
    });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    // Leave through a never-gated route first, so the next gated route mounts a fresh gate.
    await act(async () => {
      navigateRef!("/session/0b9e1f");
    });
    await pollUntil(() => expect(screenOf("UF-09")).toBeInTheDocument(), 8000);
    let sawPlaceholder = false;
    const mo = new MutationObserver(() => {
      if (placeholder()) sawPlaceholder = true;
    });
    mo.observe(document, { childList: true, subtree: true });
    await act(async () => {
      navigateRef!("/library");
    });
    expect(placeholder()).not.toBeInTheDocument();
    await pollUntil(() => expect(screenOf(screenIdOf("/library"))).toBeInTheDocument());
    mo.disconnect();
    expect(sawPlaceholder).toBe(false);
  });

  it("T-0985 cap: no timer is left pending after unmount", async () => {
    seedValidSession();
    online(true);
    loadProfile.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness start="/" />);
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("T-0985 AC8 never gated, never held", () => {
  it.each([
    ["/session/0b9e1f", "UF-09"],
    ["/session/0b9e1f/summary", "UF-03.3"],
    ["/welcome", "UF-01.1"],
  ])("T-0985 AC8 %s renders %s with no placeholder", async (path, id) => {
    seedValidSession();
    online(true);
    const w = watchScreens();
    render(<Harness start={path} />);
    expect(placeholder()).not.toBeInTheDocument();
    await pollUntil(() => expect(screenOf(id)).toBeInTheDocument(), 8000);
    expect(placeholder()).not.toBeInTheDocument();
    w.stop();
  });
});

describe("T-0985 AC9 transitions", () => {
  it("T-0985 AC9 sign-in in place: placeholder on the gated route, no UF-02.1 before the read settles", async () => {
    online(true);
    const w = watchScreens();
    render(<Harness start="/account" />);
    await pollUntil(() => expect(screenOf("UF-01.5")).toBeInTheDocument());
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u1" } }));
    });
    await act(async () => {
      navigateRef!("/");
    });
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(w.seen).not.toContain("UF-02.1");
    await settleRead({ data: ROW, error: null });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    w.stop();
  });

  it("T-0985 AC9 account switch: the placeholder shows again until B's read settles", async () => {
    seedValidSession();
    online(true);
    loadProfile.mockResolvedValue(ROW);
    render(<Harness start="/" />);
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    loadProfile.mockResolvedValue(null);
    await act(async () => {
      authStateCallbacks.forEach((cb) => cb("SIGNED_IN", { user: { id: "u2" } }));
    });
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    expect(placeholder()).toBeInTheDocument();
    expect(screenOf("UF-02.1")).not.toBeInTheDocument();
    await settleRead({ data: ROW, error: null });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(placeholder()).not.toBeInTheDocument();
  });

  it("T-0985 AC9 recheck() after a resolution does not bring the placeholder back", async () => {
    seedValidSession();
    online(true);
    loadProfile.mockResolvedValue(ROW);
    render(<Harness start="/" />);
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    // The recheck's own read hangs, so a placeholder (if any) would stay visible.
    loadProfile.mockReturnValue(new Promise(() => {}));
    let sawPlaceholder = false;
    const mo = new MutationObserver(() => {
      if (placeholder()) sawPlaceholder = true;
    });
    mo.observe(document, { childList: true, subtree: true });
    await act(async () => {
      void recheckRef!();
    });
    await flush();
    mo.disconnect();
    expect(sawPlaceholder).toBe(false);
    expect(placeholder()).not.toBeInTheDocument();
    expect(screenOf("UF-02.1")).toBeInTheDocument();
  });
});

describe("T-0985 AC10 signed out is inert", () => {
  it("T-0985 AC10 /welcome: no placeholder, no loadProfile, no network call", async () => {
    online(true);
    render(<Harness start="/welcome" />);
    expect(placeholder()).not.toBeInTheDocument();
    await pollUntil(() => expect(screenOf("UF-01.1")).toBeInTheDocument(), 8000);
    await flush();
    expect(placeholder()).not.toBeInTheDocument();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(read.calls).toBe(0);
  });
});

describe("T-0985 AC11 accessibility", () => {
  it("T-0985 AC11 no role, live region, label, text or focusable child; focus stays on body", async () => {
    seedValidSession();
    online(true);
    expect(document.activeElement).toBe(document.body);
    render(<Harness start="/" />);
    await pollUntil(() => expect(read.calls).toBe(1));
    await flush();
    const el = placeholder()!;
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("aria-live")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
    expect(el.hasAttribute("aria-labelledby")).toBe(false);
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.textContent).toBe("");
    expect(el.querySelector("*")).toBeNull();
    expect(document.querySelector('[role="status"], [role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(document.body);
    await settleRead({ data: ROW, error: null });
    await pollUntil(() => expect(screenOf("UF-02.1")).toBeInTheDocument());
    expect(document.activeElement).toBe(document.body);
  });

  it("T-0985 AC11 source: the css uses --wl-bg only, no hex colour and no font-family", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/lib/profile/profile-gate.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const tsx = readFileSync(resolve(process.cwd(), "src/lib/profile/ProfileGate.tsx"), "utf8");
    expect(css).toContain("background: var(--wl-bg)");
    expect(css).toContain("min-height: 100dvh");
    for (const src of [css, tsx.replace(/\/\/.*$/gm, "")]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/font-family|rgb\(|hsl\(/);
    }
    expect(css).not.toMatch(/animation|transition/);
  });
});
