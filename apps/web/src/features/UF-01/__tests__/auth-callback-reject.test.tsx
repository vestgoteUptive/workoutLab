// T-0380b AC1..AC3 (UF-01.5 `/auth/callback`, D-0104, D-0115 §2): a rejected
// `exchangeCodeForSession` (a network `TypeError`) is handled exactly like a resolved `{ error }`:
// the expired state with the `/account` link, the plan line when a saveable plan is kept, no
// navigation, no unhandled rejection and no `console.error`. The `{ error: null }` and `{ error }`
// paths stay as they are. `react-router`'s `useNavigate` is wrapped in a spy.
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

const { auth, navigate } = vi.hoisted(() => ({
  auth: {
    exchangeCodeForSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    getSession: vi.fn(() => new Promise(() => {})),
  },
  navigate: vi.fn(),
}));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { auth, from: vi.fn() } }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

const { AuthCallback } = await import("../index.js");
const { readSaveablePlan } = await import("../pending-plan.js");

const KEY = "wl-onboarding";
const NOW = 100_000_000;
const PLAN = {
  version: 1,
  goal: "get_stronger",
  level: "advanced",
  equipmentProfile: "dumbbells",
  rhythmMin: 2,
  rhythmMax: 3,
  startedAtMs: 1_000_000,
  timingMs: 42_000,
  planShown: true,
  savedAtMs: NOW - 60_000,
};

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

function renderCallback(code = "abc") {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback?code=${code}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Lets the exchange settle and gives Node a macrotask turn to report unhandled rejections. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function callbackRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-screen-id="UF-01.5-auth-callback"]');
  expect(el).not.toBeNull();
  return el!;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(Date, "now").mockImplementation(() => NOW);
  auth.exchangeCodeForSession.mockReset();
  navigate.mockReset();
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  consoleError = vi.spyOn(console, "error");
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.restoreAllMocks();
});

function expectExpiredState(): void {
  const root = callbackRoot();
  expect(root).toHaveTextContent(en.auth.linkExpired);
  const link = screen.getByRole("link", { name: en.auth.sendNewLink });
  expect(link).toHaveAttribute("href", "/account");
  expect(root.contains(link)).toBe(true);
}

describe("AC1 a rejected exchange shows the expired state", () => {
  it("TypeError('Failed to fetch'): linkExpired + /account link, no navigate, no unhandled rejection, no console.error", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new TypeError("Failed to fetch"));
    renderCallback();
    await settle();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expectExpiredState();
    expect(screen.queryByText(en.screens.authCallback)).toBeNull();
    expect(screen.queryByText(en.uf01.callback.planKept)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("an aborted fetch (DOMException AbortError) is handled the same way", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new DOMException("aborted", "AbortError"));
    renderCallback();
    await settle();
    expectExpiredState();
    expect(navigate).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC2 a rejected exchange keeps the saveable plan", () => {
  it("shows planKept, and the plan is still readable afterwards", async () => {
    const raw = JSON.stringify(PLAN);
    window.localStorage.setItem(KEY, raw);
    expect(readSaveablePlan()).not.toBeNull();
    auth.exchangeCodeForSession.mockRejectedValue(new TypeError("Failed to fetch"));
    renderCallback();
    await settle();
    expectExpiredState();
    expect(screen.getByText(en.uf01.callback.planKept)).toBeInTheDocument();
    expect(readSaveablePlan()).not.toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(navigate).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC3 the resolved paths are unchanged", () => {
  it("{ error: null } navigates to consumeReturnTo() with replace: true", async () => {
    window.sessionStorage.setItem("wl-return-to", "/history");
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    renderCallback();
    await settle();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/history", { replace: true });
    expect(window.sessionStorage.getItem("wl-return-to")).toBeNull();
    expect(screen.queryByText(en.auth.linkExpired)).toBeNull();
    expect(unhandled).toEqual([]);
  });

  it("{ error: null } with no return path navigates to /", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    renderCallback();
    await settle();
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("{ error: {...} } shows the expired state and does not navigate", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid_grant" } });
    renderCallback();
    await settle();
    expectExpiredState();
    expect(navigate).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
