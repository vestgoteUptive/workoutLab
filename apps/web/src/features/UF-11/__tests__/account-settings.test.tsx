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

const account = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  downloadAccountExport: vi.fn(),
  deleteAccountAndSignOut: vi.fn(),
  wipeLocalUserData: vi.fn(),
  requestAccountDeletion: vi.fn(),
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

function mount() {
  return render(
    <MemoryRouter initialEntries={["/plan", "/plan/account"]} initialIndex={1}>
      <Where />
      <Routes>
        <Route path="/plan/account" element={<AccountSettings now={() => NOW} />} />
        <Route path="/plan" element={<span data-testid="plan" />} />
        <Route path="/welcome" element={<span data-testid="welcome" />} />
      </Routes>
    </MemoryRouter>,
  );
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
  replaceSpy.mockReset();
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
    expect(screen.getByText(`Signed in as ${EMAIL}`)).toBeInTheDocument();
  });

  it("T-0310d AC-D3 contrast: a null email shows no Signed in as line", () => {
    window.localStorage.setItem(
      "sb-abc-auth-token",
      JSON.stringify({ access_token: "t", user: { id: TEST_USER, email: null } }),
    );
    mount();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
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
    expect(await screen.findByRole("alert")).toHaveTextContent(a.exportFailed);
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
    await waitFor(() => expect(where()).toBe("/welcome"));
    act(() => window.history.back());
    // MemoryRouter history: /plan/account was replaced, so one entry back is /plan.
    expect(where()).not.toBe("/plan/account");
  });

  it("T-0310d AC-D7 deleted while still signed-in does a full load to /welcome", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("deleted");
    mount();
    confirmDelete();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledTimes(1));
    expect(replaceSpy).toHaveBeenCalledWith("/welcome");
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 unauthorized stays on the screen with an alert", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("unauthorized");
    mount();
    confirmDelete();
    expect(await screen.findByRole("alert")).toHaveTextContent(a.unauthorized);
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 failed re-enables and a retry calls again", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("failed");
    mount();
    confirmDelete();
    expect(await screen.findByText(a.deleteFailed)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: a.deleteConfirm });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(account.deleteAccountAndSignOut).toHaveBeenCalledTimes(2));
    expect(where()).toBe("/plan/account");
  });

  it("T-0310d AC-D7 offline outcome shows the connect message", async () => {
    account.deleteAccountAndSignOut.mockResolvedValue("offline");
    mount();
    confirmDelete();
    expect(await screen.findByText(a.connectToDelete)).toBeInTheDocument();
  });
});

describe("T-0310d AC-D8 sign out keeps the queue", () => {
  it("T-0310d AC-D8 calls signOut once and leaves the queued set and the wipe alone", async () => {
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
    expect(auth.value.signOut).toHaveBeenCalledTimes(1);
    expect(await db.sets.count()).toBe(1);
    expect(account.wipeLocalUserData).not.toHaveBeenCalled();
    expect(account.deleteAccountAndSignOut).not.toHaveBeenCalled();
  });
});
