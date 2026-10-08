// T-0301a AC-1..AC-4 and the AC-11 half that belongs to the hook: `useProfileStatus()` /
// `useRecheckProfile()` in isolation, with `lib/offline` and `supabase.from` mocked.
// Assertions are on the returned status and on which spy was called — never on internals.
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/auth-context.js";
import {
  PROFILE_STATUSES,
  ProfileStatusProvider,
  useProfileStatus,
  useRecheckProfile,
  type ProfileStatus,
} from "../index.js";
import { createSelectSpy, type SelectSpy } from "../../offline/__tests__/select-spy.js";

const { loadProfile, refreshProfile } = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  refreshProfile: vi.fn(),
}));
vi.mock("../../offline/index.js", () => ({ loadProfile, refreshProfile }));

const { selectSpy, rejectNext, onAuthStateChange, getSession, signOut } = vi.hoisted(() => {
  // Required inside `vi.hoisted`: the factory below runs before module-scope initialisers.
  return {
    // A mutable holder, because `vi.hoisted` runs before module scope.
    selectSpy: { current: null as SelectSpy | null },
    rejectNext: { current: false },
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    getSession: vi.fn(),
    signOut: vi.fn(),
  };
});
vi.mock("../../auth/client.js", () => ({
  supabase: {
    auth: { onAuthStateChange, getSession, signOut },
    // `from` is delegated, so the spy can be created at module scope and swapped per test.
    from: (table: string) =>
      rejectNext.current
        ? {
            select: () => {
              const q = {
                retry: () => q,
                abortSignal: () => q,
                maybeSingle: () => Promise.reject(new TypeError("Failed to fetch")),
              };
              return q;
            },
          }
        : selectSpy.current!.from(table),
  },
}));
selectSpy.current = createSelectSpy();
const spy = selectSpy.current;

const PROFILE_ROW = { id: "u1", goal: "build", experience: "some" };

function seedSignedIn() {
  window.localStorage.setItem(
    "sb-abc-auth-token",
    JSON.stringify({
      access_token: "tok",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "u1" },
    }),
  );
}

/** Publishes the current status to `seen`, so a test can assert the *first committed* value. */
const seen: ProfileStatus[] = [];
function Probe() {
  const status = useProfileStatus();
  seen.push(status);
  return <span data-testid="status">{status}</span>;
}

let recheckRef: (() => Promise<void>) | undefined;
function RecheckHelper() {
  recheckRef = useRecheckProfile();
  return null;
}

function Harness({ children }: { children?: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <ProfileStatusProvider>
          <RecheckHelper />
          <Probe />
          {children}
        </ProfileStatusProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function status(): string {
  return document.querySelector('[data-testid="status"]')!.textContent!;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  seen.length = 0;
  recheckRef = undefined;
  loadProfile.mockReset();
  loadProfile.mockResolvedValue(null);
  refreshProfile.mockReset();
  refreshProfile.mockResolvedValue(undefined);
  spy.reset();
  rejectNext.current = false;
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AC-1 three states, exhaustive", () => {
  // The source-level pin (the T-0318 AC-1 pattern): `ProfileStatus` is *derived* from
  // `PROFILE_STATUSES`, so this array is the only place a fourth state could be added.
  it("PROFILE_STATUSES is exactly the three states", () => {
    expect([...PROFILE_STATUSES]).toEqual(["unknown", "present", "missing"]);
  });

  it("the type has no member outside the array (a type-level assertion)", () => {
    // If a fourth member were added to `ProfileStatus` without the array, `Exhaustive` would
    // stop being assignable and `pnpm -w typecheck` would fail.
    type Exhaustive = ProfileStatus extends (typeof PROFILE_STATUSES)[number] ? true : never;
    const pinned: Exhaustive = true;
    expect(pinned).toBe(true);
    // And the other direction, so the array cannot grow without the type.
    const fromArray: ProfileStatus = PROFILE_STATUSES[0];
    expect(fromArray).toBe("unknown");
  });

  it("the first committed render is `unknown` while loadProfile never settles", () => {
    seedSignedIn();
    loadProfile.mockReturnValue(new Promise(() => {}));
    render(<Harness />);
    // Synchronous: no await before this.
    expect(seen[0]).toBe("unknown");
    expect(status()).toBe("unknown");
  });
});

describe("AC-2 cached fast path: `present` with no network wait", () => {
  it("online, with `fetch` never resolving: still reaches `present`, and never selects profiles", async () => {
    seedSignedIn();
    loadProfile.mockResolvedValue(PROFILE_ROW);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<Harness />);
    await waitFor(() => expect(status()).toBe("present"));
    expect(spy.countFor("profiles")).toBe(0);
    expect(spy.from).not.toHaveBeenCalledWith("profiles");
  });

  it("offline, with a cache: still `present` (the cache needs no network)", async () => {
    seedSignedIn();
    vi.stubGlobal("navigator", { onLine: false });
    loadProfile.mockResolvedValue(PROFILE_ROW);
    render(<Harness />);
    await waitFor(() => expect(status()).toBe("present"));
    expect(spy.countFor("profiles")).toBe(0);
  });
});

describe("AC-3 online, a row → `present` + refreshProfile exactly once", () => {
  it("resolves `present` and warms the cache once", async () => {
    seedSignedIn();
    spy.setRows("profiles", [PROFILE_ROW]);
    render(<Harness />);
    await waitFor(() => expect(status()).toBe("present"));
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(spy.countFor("profiles")).toBe(1);
  });

  it("a recheck in the same mount does not warm it a second time for the same resolution", async () => {
    seedSignedIn();
    spy.setRows("profiles", [PROFILE_ROW]);
    render(<Harness />);
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    await act(async () => {
      await recheckRef!();
    });
    expect(status()).toBe("present");
    // The status was already `present` from the cache-less network read; the recheck re-reads,
    // but the cache warm is not repeated for a resolution that did not change the answer.
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });
});

describe("AC-4 no row → `missing`; error or offline → `unknown`", () => {
  it("`{data: null, error: null}` → `missing`", async () => {
    seedSignedIn();
    spy.setRows("profiles", []);
    render(<Harness />);
    await waitFor(() => expect(status()).toBe("missing"));
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it("`{data: null, error: {status: 500}}` → `unknown`", async () => {
    seedSignedIn();
    spy.fail("profiles", { code: "500", message: "internal_server_error" });
    render(<Harness />);
    await waitFor(() => expect(spy.countFor("profiles")).toBe(1));
    // `unknown` is also the pre-resolution value, so settle a tick and re-assert it held.
    await act(async () => {});
    expect(status()).toBe("unknown");
    expect(seen).not.toContain("missing");
  });

  it("a rejected promise (`Failed to fetch`) → `unknown`", async () => {
    seedSignedIn();
    rejectNext.current = true;
    render(<Harness />);
    await waitFor(() => expect(loadProfile).toHaveBeenCalled());
    await act(async () => {});
    await act(async () => {});
    expect(status()).toBe("unknown");
    expect(seen).not.toContain("missing");
  });

  it("offline with no cache → `unknown`, and profiles was never selected", async () => {
    seedSignedIn();
    vi.stubGlobal("navigator", { onLine: false });
    spy.setRows("profiles", []);
    render(<Harness />);
    await waitFor(() => expect(loadProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(status()).toBe("unknown");
    expect(spy.countFor("profiles")).toBe(0);
    expect(spy.from).not.toHaveBeenCalledWith("profiles");
  });
});

describe("AC-11 recheckProfile re-evaluates, and is unmount-safe", () => {
  it("`missing` → `present` once the mocked row appears and recheck() is called", async () => {
    seedSignedIn();
    spy.setRows("profiles", []);
    render(<Harness />);
    await waitFor(() => expect(status()).toBe("missing"));

    spy.setRows("profiles", [PROFILE_ROW]);
    await act(async () => {
      await recheckRef!();
    });
    expect(status()).toBe("present");
  });

  it("a recheck in flight when the tree unmounts sets no state and logs no error", async () => {
    seedSignedIn();
    let release: (() => void) | undefined;
    loadProfile.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const errors: unknown[] = [];
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => errors.push(args));
    try {
      const { unmount } = render(<Harness />);
      await waitFor(() => expect(release).toBeDefined());
      unmount();
      await act(async () => {
        release!();
      });
      expect(errors).toEqual([]);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // QA (T-0301a): the assertion above is on `console.error` only, and React 18/19 no longer warns
  // on a setState after unmount — so it cannot fail. Deleting the whole
  // `if (!mounted.current || mine !== generation.current) return;` guard left all 106 gate tests
  // green. These two assert the *mechanism* AC-11 names, so the guard cannot be dropped silently.
  it("a resolution that settles after unmount commits no state (the mounted guard)", async () => {
    seedSignedIn();
    spy.setRows("profiles", [PROFILE_ROW]);
    let release: ((v: null) => void) | undefined;
    loadProfile.mockImplementation(
      () => new Promise<null>((resolve) => (release = resolve as (v: null) => void)),
    );
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(release).toBeDefined());
    const rendersBeforeUnmount = seen.length;
    unmount();
    // Let the in-flight read settle. Without the mounted guard this calls setStatus on an
    // unmounted tree; React drops the update silently, so the observable mechanism is that no
    // further render was produced *and* `refreshProfile` — the side effect this resolution would
    // have fired, which is not inside any React state batch — was never called.
    await act(async () => {
      release!(null);
    });
    await act(async () => {});
    expect(seen.length).toBe(rendersBeforeUnmount);
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it("a stale in-flight resolution cannot overwrite a newer one (the generation guard)", async () => {
    seedSignedIn();
    // The first read hangs; the recheck below overtakes it.
    const releases: Array<(v: unknown) => void> = [];
    loadProfile.mockImplementation(
      () => new Promise((resolve) => releases.push(resolve as (v: unknown) => void)),
    );
    render(<Harness />);
    await waitFor(() => expect(releases.length).toBe(1));

    const recheckDone = recheckRef!();
    await waitFor(() => expect(releases.length).toBe(2));
    await act(async () => {
      releases[1]!(PROFILE_ROW);
      await recheckDone;
    });
    expect(status()).toBe("present");

    // Now the *first*, superseded read settles with the opposite answer. The generation guard is
    // the only thing stopping it from clobbering `present` with a stale `missing`.
    spy.setRows("profiles", []);
    await act(async () => {
      releases[0]!(null);
    });
    await act(async () => {});
    expect(status()).toBe("present");
  });
});

describe("the gate is inert when signed out (principle 5)", () => {
  it("no stored session: `unknown`, and no loader or select is called", async () => {
    render(<Harness />);
    expect(seen[0]).toBe("unknown");
    await act(async () => {});
    expect(status()).toBe("unknown");
    expect(loadProfile).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(spy.from).not.toHaveBeenCalled();
  });
});
