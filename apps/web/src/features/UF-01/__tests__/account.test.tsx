// T-0301c AC-1..AC-4 (UF-01.5 Account, D-0014, D-0064 §6 and §10, D-0098 §2): the two headings,
// the magic link and code (T-0300b's `lib/auth/magic-link.ts`, reused), "Continue with Google",
// the privacy link, and `/auth/callback`'s expired state keeping the plan. `lib/auth/client.js`
// is mocked with an `auth` spy; `Date.now` is faked, because the record's age decides the heading.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

const { auth, from } = vi.hoisted(() => ({
  auth: {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    getSession: vi.fn(() => new Promise(() => {})),
  },
  from: vi.fn(),
}));
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { auth, from } }));

const { Account, AuthCallback } = await import("../index.js");

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
const UNSHOWN = { ...PLAN, planShown: false };
const EXPIRED = { ...PLAN, savedAtMs: NOW - 86_400_001 };

const where = { current: "" };
function Probe() {
  where.current = useLocation().pathname;
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/account" element={<Account />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/welcome/schedule" element={<div data-screen-id="UF-01.4" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function root(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-screen-id="UF-01.5"]');
  expect(el).not.toBeNull();
  return el!;
}

function store(record: unknown): string {
  const raw = JSON.stringify(record);
  window.localStorage.setItem(KEY, raw);
  return raw;
}

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

const google = () => screen.getByRole("button", { name: "Continue with Google" });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(Date, "now").mockImplementation(() => NOW);
  setOnline(true);
  for (const fn of Object.values(auth)) fn.mockClear();
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.exchangeCodeForSession.mockReset();
  from.mockClear();
});
afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe("AC-1 UF-01.5 layout (D-0064 §10, D-0098 §2)", () => {
  it("with PLAN stored: one h1 'Save your plan' and a Back link to /welcome/schedule", () => {
    store(PLAN);
    renderAt("/account");
    const headings = within(root()).getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(root().querySelectorAll("h1")).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Save your plan");
    expect(within(root()).getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/welcome/schedule",
    );
  });

  it.each([
    ["no record", null],
    ["UNSHOWN", UNSHOWN],
    ["an expired PLAN (now − 86 400 001)", EXPIRED],
  ])("with %s: the h1 is 'Sign in' and nothing links to /welcome/schedule", (_name, record) => {
    if (record) store(record);
    renderAt("/account");
    const headings = within(root()).getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Sign in");
    expect(within(root()).queryByRole("link", { name: "Back" })).toBeNull();
    expect(root().querySelector('a[href="/welcome/schedule"]')).toBeNull();
  });

  it.each([
    ["PLAN", PLAN],
    ["no record", null],
    ["UNSHOWN", UNSHOWN],
  ])("in every case (%s): tabs, email, Send link, code mode, Google and Privacy", (_n, record) => {
    if (record) store(record);
    renderAt("/account");
    const r = root();
    const tabs = within(r).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Send link", "Enter code"]);
    expect(within(r).getByRole("tab", { name: "Send link" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const email = within(r).getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(within(r).getByRole("button", { name: "Send link" })).toBeInTheDocument();
    expect(within(r).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(within(r).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://workout.vestgote.com/privacy/",
    );

    fireEvent.click(within(r).getByRole("tab", { name: "Enter code" }));
    expect(within(r).getByRole("tab", { name: "Enter code" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const code = within(r).getByLabelText("6-digit code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("maxlength", "6");
    expect(within(r).getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(within(r).getByRole("button", { name: "Verify code" })).toBeInTheDocument();
    expect(within(r).getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });

  it.each([
    ["PLAN", PLAN],
    ["UNSHOWN", UNSHOWN],
  ])("rendering /account leaves a valid %s record byte-identical", async (_n, record) => {
    const raw = store(record);
    renderAt("/account");
    fireEvent.click(screen.getByRole("tab", { name: "Enter code" }));
    await act(async () => {});
    expect(window.localStorage.getItem(KEY)).toBe(raw);
  });

  it("creates no record when none was stored", async () => {
    renderAt("/account");
    await act(async () => {});
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["expired", JSON.stringify(EXPIRED)],
    ["unparseable", "{not json"],
    ["wrong version", JSON.stringify({ ...PLAN, version: 2 })],
  ])("an %s record is deleted on read (D-0064 §6)", (_n, raw) => {
    window.localStorage.setItem(KEY, raw);
    renderAt("/account");
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("AC-2 magic link and code (T-0300b reused)", () => {
  it("Send link trims and lower-cases, calls signInWithOtp once, and shows linkSent", async () => {
    renderAt("/account");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Ada@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(en.auth.linkSent));
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: expect.objectContaining({
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }),
    });
  });

  it.each([
    [
      "invalid_email",
      "not-an-email",
      () => {},
      en.auth.invalidEmail,
      0, // rejected before any call
    ],
    ["offline", "ada@example.com", () => setOnline(false), en.auth.offline, 0],
    [
      "rate_limited",
      "ada@example.com",
      () => auth.signInWithOtp.mockResolvedValue({ error: { status: 429, message: "slow" } }),
      en.auth.rateLimited,
      1,
    ],
  ])("%s shows its en.auth text in role=status", async (_n, value, arrange, text, calls) => {
    arrange();
    renderAt("/account");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(calls);
  });

  it("Verify code with 123456 calls verifyOtp with the normalised email", async () => {
    renderAt("/account");
    fireEvent.click(screen.getByRole("tab", { name: "Enter code" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Ada@Example.com " } });
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledTimes(1));
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("12345 shows invalidCode and makes no call", async () => {
    renderAt("/account");
    fireEvent.click(screen.getByRole("tab", { name: "Enter code" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(en.auth.invalidCode));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("AC-3 Continue with Google", () => {
  it("online, activated twice quickly: signInWithOAuth is called once, with the callback", async () => {
    renderAt("/account");
    expect(google()).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(google());
    fireEvent.click(google());
    await act(async () => {});
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it("a resolved {error} shows en.auth.unknown and re-enables the button", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: "provider off" } });
    renderAt("/account");
    fireEvent.click(google());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(en.auth.unknown));
    expect(google()).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(google());
    await act(async () => {});
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2);
  });

  it("a successful start keeps the button busy (the browser is leaving)", async () => {
    renderAt("/account");
    fireEvent.click(google());
    await act(async () => {});
    expect(google()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offline at render: aria-disabled, described by en.auth.offline, and no call", async () => {
    setOnline(false);
    renderAt("/account");
    const button = google();
    expect(button).toHaveAttribute("aria-disabled", "true");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(en.auth.offline);
    expect(document.getElementById(describedBy!)!.textContent).toBe(en.auth.offline);
    fireEvent.click(button);
    await act(async () => {});
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("a window online event re-enables it without a remount", async () => {
    setOnline(false);
    renderAt("/account");
    const before = google();
    expect(before).toHaveAttribute("aria-disabled", "true");
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(google()).toBe(before);
    expect(before).toHaveAttribute("aria-disabled", "false");
    expect(before).not.toHaveAttribute("aria-describedby");
    fireEvent.click(before);
    await act(async () => {});
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });
});

describe("AC-4 an expired link keeps the plan", () => {
  it("with PLAN: linkExpired plus the plan line; the record is byte-identical", async () => {
    const raw = store(PLAN);
    renderAt("/auth/callback?error_code=otp_expired");
    expect(await screen.findByText(en.auth.linkExpired)).toBeInTheDocument();
    expect(screen.getByText("Your plan is still saved on this device.")).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("Send a new one leads to /account with the h1 'Save your plan'", async () => {
    const raw = store(PLAN);
    renderAt("/auth/callback?error_code=otp_expired");
    fireEvent.click(await screen.findByRole("link", { name: "Send a new one" }));
    await waitFor(() => expect(where.current).toBe("/account"));
    expect(within(root()).getByRole("heading", { level: 1 })).toHaveTextContent("Save your plan");
    expect(window.localStorage.getItem(KEY)).toBe(raw);
  });

  it.each([
    ["no record", null],
    ["UNSHOWN", UNSHOWN],
  ])("with %s, the extra line is absent", async (_n, record) => {
    if (record) store(record);
    renderAt("/auth/callback?error_code=otp_expired");
    expect(await screen.findByText(en.auth.linkExpired)).toBeInTheDocument();
    expect(screen.queryByText("Your plan is still saved on this device.")).toBeNull();
  });

  it("a failed exchange (already used) shows the same line with PLAN", async () => {
    store(PLAN);
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid_grant" } });
    renderAt("/auth/callback?code=used");
    expect(await screen.findByText(en.auth.linkExpired)).toBeInTheDocument();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("used");
    expect(screen.getByText("Your plan is still saved on this device.")).toBeInTheDocument();
  });
});
