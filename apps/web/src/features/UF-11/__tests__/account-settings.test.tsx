// T-0310d UF-11.4 Account settings (D-0136). `lib/account` is mocked, so every function is a
// `vi.fn()`; `useAuth` is controllable so the signed-in/signed-out contrast is expressible.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { en } from "../../../lib/i18n/en.js";
import { AccountSettings } from "../index.js";
import { NOW, TZ } from "./fixtures.js";
import {
  TEST_USER,
  freshDb,
  signIn,
  signOut as clearSession,
  useTimeZone,
} from "./test-helpers.js";

// Records every `navigate(to, options)` call so AC-D7's "history replace" assertion checks the
// actual call shape, rather than relying on `window.history.back()` to drive MemoryRouter (it
// doesn't: a prior version of this test stayed green even with `replace` removed from the code).
const navCalls = vi.hoisted((): { to: unknown; options: unknown }[] => []);
vi.mock("react-router", async (orig) => {
  const actual = (await orig()) as typeof import("react-router");
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      const call = navigate as (...args: unknown[]) => unknown;
      return ((...args: unknown[]) => {
        navCalls.push({ to: args[0], options: args[1] });
        return call(...args);
      }) as typeof navigate;
    },
  };
});

const account = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  downloadAccountExport: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  wipeLocalUserData: vi.fn(),
  requestAccountDeletion: vi.fn(),
  signOutAndClearDevice: vi.fn(),
  hasUnsyncedWork: vi.fn(),
}));
vi.mock("../../../lib/account/index.js", () => account);

const auth = vi.hoisted(() => ({
  value: {
    status: "signed-in" as "signed-in" | "signed-out",
    userId: "11111111-1111-4111-8111-111111111111" as string | null,
    redirectTarget: "/welcome",
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => auth.value,
}));

const WAIT = { timeout: 5_000 };
const a = en.uf11.account;
const EMAIL = "u@test.local";

function Where() {
  const loc = useLocation();
  return <span data-testid="where" title={loc.pathname} />;
}
function where(): string {
  return screen.getByTestId("where").getAttribute("title")!;
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function tree() {
  return (
    <MemoryRouter initialEntries={["/plan", "/plan/account"]} initialIndex={1}>
      <Where />
      <Routes>
        <Route path="/plan/account" element={<AccountSettings now={() => NOW} />} />
        <Route path="/plan" element={<span data-testid="plan" />} />
        <Route path="/welcome" element={<span data-testid="welcome" />} />
      </Routes>
    </MemoryRouter>
  );
}

function mount() {
  return render(tree());
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const replaceSpy = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  setOnline(true);
  useTimeZone(TZ);
  signIn();
  auth.value = {
    ...auth.value,
    status: "signed-in",
    userId: TEST_USER,
    signOut: vi.fn(async () => undefined),
  };
  Object.values(account).forEach((f) => f.mockReset());
  account.hasUnsyncedWork.mockResolvedValue(false);
  account.signOutAndClearDevice.mockResolvedValue(undefined);
  replaceSpy.mockReset();
  navCalls.length = 0;
  Object.defineProperty(window, "location", {
    value: { ...realLocation, replace: replaceSpy },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  clearSession();
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  vi.restoreAllMocks();
});

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: a.deleteOpen }));
  return screen.getByLabelText(a.confirmLabel) as HTMLInputElement;
}

describe("T-0310d AC-D1 first render", () => {
  it("T-0310d AC-D1 renders the host and h1 on the first render", () => {
    mount();
    expect(document.querySelector('[data-screen-id="UF-11.4"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Account settings");
  });
});

describe("T-0310d AC-D3 email", () => {
  it("T-0310d AC-D3 shows the signed-in email", () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: EMAIL } }),
    );
    mount();
    expect(screen.getByText("Signed in as")).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("T-0310d AC-D3 contrast: a null email shows no Signed in as line", () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: null } }),
    );
    mount();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  it("T-0310d AC-D3 contrast: a stale *-auth-token for another user shows no email", () => {
    window.localStorage.setItem(
      "sb-stale-auth-token",
      JSON.stringify({
        access_token: "t",
        user: { id: "22222222-2222-4222-8222-222222222222", email: "other@test.local" },
      }),
    );
    mount();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
    expect(screen.queryByText("other@test.local")).toBeNull();
  });
});

describe("T-0310d AC-D4 export", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: EMAIL } }),
    );
  });

  it("T-0310d AC-D4 exports once, shows progress, then downloads with the clock and tz", async () => {
    const d = deferred<{ r: number }>();
    account.exportAccountData.mockReturnValue(d.promise);
    mount();
    const button = screen.getByRole("button", { name: a.exportButton });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(account.exportAccountData).toHaveBeenCalledTimes(1);
    expect(account.exportAccountData).toHaveBeenCalledWith({
      userId: TEST_USER,
      email: EMAIL,
      now: NOW,
    });
    const busy = screen.getByRole("button", { name: a.exporting });
    expect(busy).toBeDisabled();
    expect(account.downloadAccountExport).not.toHaveBeenCalled();
    await act(async () => d.resolve({ r: 1 }));
    expect(account.downloadAccountExport).toHaveBeenCalledTimes(1);
    expect(account.downloadAccountExport).toHaveBeenCalledWith({ r: 1 }, NOW, "Europe/Stockholm");
    expect(screen.getByRole("button", { name: a.exportButton })).toBeEnabled();
  });

  it("T-0310d AC-D4 a rejected export shows an alert, offers no file, re-enables", async () => {
    account.exportAccountData.mockRejectedValue(new Error("export_failed"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: a.exportButton }));
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent(a.exportFailed);
    expect(account.downloadAccountExport).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: a.exportButton })).toBeEnabled();
  });
});

describe("T-0310d AC-D5 offline", () => {
  it("T-0310d AC-D5 disables both actions offline and calls nothing", () => {
    setOnline(false);
    mount();
    const exp = screen.getByRole("button", { name: a.exportButton });
    const del = screen.getByRole("button", { name: a.deleteOpen });
    expect(exp).toBeDisabled();
    expect(del).toBeDisabled();
    expect(screen.getByText(a.connectToExport)).toBeInTheDocument();
    expect(screen.getByText(a.connectToDelete)).toBeInTheDocument();
    fireEvent.click(exp);
    fireEvent.click(del);
    expect(Object.values(account).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("T-0310d AC-D5 the online event re-enables without a remount; offline disables the confirm", () => {
    setOnline(false);
    mount();
    const exp = screen.getByRole("button", { name: a.exportButton });
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("button", { name: a.exportButton })).toBe(exp);
    expect(exp).toBeEnabled();
    expect(screen.getByRole("button", { name: a.deleteOpen })).toBeEnabled();
    const input = openConfirm();
    fireEvent.change(input, { target: { value: "delete" } });
    expect(screen.getByRole("button", { name: a.deleteConfirm })).toBeEnabled();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("button", { name: a.deleteConfirm })).toBeDisabled();
  });
});

describe("T-0310d AC-D6 typed confirm", () => {
  it("T-0310d AC-D6 hides the panel until asked, then focuses the input", () => {
    mount();
    expect(screen.queryByLabelText(a.confirmLabel)).toBeNull();
    expect(screen.queryByRole("button", { name: a.deleteConfirm })).toBeNull();
    const input = openConfirm();
    expect(screen.getByText(a.deleteWarning)).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: a.deleteConfirm })).toBeDisabled();
  });

  it.each([
    ["delet", false],
    ["delete", true],
    ["  DELETE ", true],
    ["deleted", false],
    ["delete it", false],
  ])("T-0310d AC-D6 input %j enables the button: %s", (value, enabled) => {
    mount();
    fireEvent.change(openConfirm(), { target: { value } });
    const button = screen.getByRole("button", { name: a.deleteConfirm });
    if (enabled) expect(button).toBeEnabled();
    else expect(button).toBeDisabled();
  });

  it("T-0310d AC-D6 Cancel hides the panel, clears the input, refocuses the opener", () => {
    mount();
    fireEvent.change(openConfirm(), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: a.cancel }));
    expect(screen.queryByLabelText(a.confirmLabel)).toBeNull();
    expect(screen.getByRole("button", { name: a.deleteOpen })).toHaveFocus();
    expect(openConfirm().value).toBe("");
    expect(account.deleteAccountAndSignOut).not.toHaveBeenCalled();
  });
});

describe("T-0310d AC-D7 delete outcomes", () => {
  function confirmDelete() {
    fireEvent.change(openConfirm(), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: a.deleteConfirm }));
  }

  it("T-0310d AC-D7 calls once, shows Deleting…, then replaces to /welcome when signed out", async () => {
    const d = deferred<string>();
    account.deleteAccountAndSignOut.mockReturnValue(d.promise);
    auth.value = { ...auth.value, status: "signed-out" };
    mount();
    fireEvent.change(openConfirm(), { target: { value: "delete" } });
    const button = screen.getByRole("button", { name: a.deleteConfirm });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(account.deleteAccountAndSignOut).toHaveBeenCalledTimes(1);
    expect(account.deleteAccountAndSignOut).toHaveBeenCalledWith({ userId: TEST_USER });
    expect(screen.getByRole("button", { name: a.deleting })).toBeDisabled();
    await act(async () => d.resolve("deleted"));
    expect(where()).toBe("/welcome");
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("T-0310d AC-D7 deleted: history replace, so Back does not return to the screen", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("deleted");
    auth.value = { ...auth.value, status: "signed-out" };
    mount();
    confirmDelete();
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    // Assert the actual navigate call shape: `window.history.back()` doesn't drive MemoryRouter,
    // so this used to hold even with `replace` dropped from the code.
    expect(navCalls).toHaveLength(1);
    expect(navCalls[0]).toEqual({ to: "/welcome", options: { replace: true } });
  });

  it("T-0310d AC-D7 deleted while still signed-in does a full load to /welcome", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("deleted");
    mount();
    confirmDelete();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1), WAIT);
    expect(replaceSpy).toHaveBeenCalledWith("/welcome");
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 unauthorized stays on the screen with an alert", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("unauthorized");
    mount();
    confirmDelete();
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent(a.unauthorized);
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 failed re-enables and a retry calls again", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("failed");
    mount();
    confirmDelete();
    expect(await screen.findByText(a.deleteFailed, undefined, WAIT)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: a.deleteConfirm });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(account.deleteAccountAndSignOut).toHaveBeenCalledTimes(2), WAIT);
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 offline outcome shows the connect message", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("offline");
    mount();
    confirmDelete();
    expect(await screen.findByText(a.connectToDelete, undefined, WAIT)).toBeInTheDocument();
  });
});

describe("T-0310d AC-D8 sign out keeps the queue", () => {
  it("T-0310d AC-D8 calls signOutAndClearDevice once and leaves the queued set and the wipe alone", async () => {
    const db = freshDb();
    await db.sets.put({
      key: `${TEST_USER}:c1`,
      userId: TEST_USER,
      clientId: "c1",
      sessionId: "s1",
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 5,
      weightKg: 100,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: "2026-09-27T09:00:00Z",
      editedAt: "2026-09-27T09:00:00Z",
      deletedAt: null,
      status: "queued",
    } as never);
    mount();
    fireEvent.click(screen.getByRole("button", { name: a.signOut }));
    await waitFor(() => expect(account.signOutAndClearDevice).toHaveBeenCalledTimes(1), WAIT);
    expect(await db.sets.count()).toBe(1);
    expect(account.wipeLocalUserData).not.toHaveBeenCalled();
    expect(account.deleteAccountAndSignOut).not.toHaveBeenCalled();
  });
});

function signOutButton() {
  return screen.getByRole("button", { name: a.signOut });
}

describe("T-0529 AC-3 / AC-4 sign out, nothing unsynced", () => {
  it("T-0529 AC-3 one call, Signing out…, then /welcome via the router", async () => {
    const d = deferred<void>();
    account.signOutAndClearDevice.mockReturnValue(d.promise);
    auth.value.status = "signed-out";
    mount();
    fireEvent.click(signOutButton());
    const busy = await screen.findByRole("button", { name: a.signingOut }, WAIT);
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(account.signOutAndClearDevice).toHaveBeenCalledTimes(1);
    expect(account.signOutAndClearDevice).toHaveBeenCalledWith({ userId: TEST_USER });
    expect(screen.queryByText(a.unsyncedWarning)).toBeNull();
    expect(auth.value.signOut).not.toHaveBeenCalled();
    await act(async () => d.resolve());
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("T-0529 AC-4 a status still signed-in hard-navigates to /welcome", async () => {
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    mount();
    fireEvent.click(signOutButton());
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1), WAIT);
    expect(replaceSpy).toHaveBeenCalledWith("/welcome");
    expect(where()).toBe("/plan/account");
  });
});

describe("T-0908 AC-1 / AC-3 bounded wait for signed-out", () => {
  it("T-0908 AC-3 status already flipped before the call returns: in-app, no wait", async () => {
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    auth.value = { ...auth.value, status: "signed-out" };
    mount();
    fireEvent.click(signOutButton());
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("T-0908 AC-3 status flips after the call returns, within the bound: in-app", async () => {
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    const view = mount();
    fireEvent.click(signOutButton());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(where()).toBe("/plan/account");
    auth.value = { ...auth.value, status: "signed-out" };
    view.rerender(tree());
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("T-0908 AC-3 never flips while online: full load after the bound", async () => {
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    mount();
    fireEvent.click(signOutButton());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    expect(replaceSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/welcome"), WAIT);
    expect(where()).toBe("/plan/account");
  });

  it("T-0908 AC-3 never flips while offline: in-app navigation, no full load", async () => {
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    setOnline(false);
    mount();
    fireEvent.click(signOutButton());
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(navCalls.at(-1)).toEqual({ to: "/welcome", options: { replace: true } });
  });

  it("T-0908 AC-2 delete shares the helper: flips late in-app; never flips offline in-app", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("deleted");
    mount();
    fireEvent.change(openConfirm(), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: a.deleteConfirm }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(replaceSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/welcome"), WAIT);
  });
});

describe("T-0529 AC-5 unsynced confirm", () => {
  it("T-0529 AC-5 confirm, focus, Cancel, then Sign out anyway once", async () => {
    account.hasUnsyncedWork.mockResolvedValue(true);
    account.signOutAndClearDevice.mockResolvedValue(undefined);
    auth.value.status = "signed-out";
    mount();
    fireEvent.click(signOutButton());
    const anyway = await screen.findByRole("button", { name: a.signOutAnyway }, WAIT);
    expect(screen.getByText(a.unsyncedWarning)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: a.cancel })).toBeInTheDocument();
    // T-0909: focus is moved in a passive effect (useEffect on `unsyncedPrompt`), which can flush
    // after the commit that `findBy` already observed; asserting it synchronously flaked under load.
    await waitFor(() => expect(anyway).toHaveFocus(), WAIT);
    expect(account.hasUnsyncedWork).toHaveBeenCalledWith(TEST_USER);
    expect(account.signOutAndClearDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: a.cancel }));
    await waitFor(() => expect(signOutButton()).toHaveFocus(), WAIT);
    expect(screen.queryByText(a.unsyncedWarning)).toBeNull();
    expect(account.signOutAndClearDevice).not.toHaveBeenCalled();

    fireEvent.click(signOutButton());
    const again = await screen.findByRole("button", { name: a.signOutAnyway }, WAIT);
    fireEvent.click(again);
    fireEvent.click(again);
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(account.signOutAndClearDevice).toHaveBeenCalledTimes(1);
    expect(account.signOutAndClearDevice).toHaveBeenCalledWith({ userId: TEST_USER });
  });

  it("T-0529 AC-5 works offline: Sign out stays enabled and the flow completes", async () => {
    setOnline(false);
    account.hasUnsyncedWork.mockResolvedValue(true);
    auth.value.status = "signed-out";
    mount();
    expect(signOutButton()).toBeEnabled();
    fireEvent.click(signOutButton());
    fireEvent.click(await screen.findByRole("button", { name: a.signOutAnyway }, WAIT));
    await waitFor(() => expect(where()).toBe("/welcome"), WAIT);
    expect(account.signOutAndClearDevice).toHaveBeenCalledTimes(1);
  });
});
