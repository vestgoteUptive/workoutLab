// T-0606 (D-0208, D-0210, D-0211, D-0213; UF-01.5): the plan-state markup of the sign-in and save
// screens. The computed look is proven in a real browser (`tests/e2e/uf-01-onboarding.spec.ts`);
// this file proves the DOM contract, the aria-invalid wiring and the stylesheet rules jsdom can read.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const { Account } = await import("../index.js");

const CSS = readFileSync(resolve(__dirname, "../uf-01.css"), "utf8");
const SRC = readFileSync(resolve(__dirname, "../AccountScreen.tsx"), "utf8");

function mount() {
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route path="/account" element={<Account />} />
      </Routes>
    </MemoryRouter>,
  );
}
const root = () => document.querySelector<HTMLElement>('[data-screen-id="UF-01.5"]')!;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("AC1 state", () => {
  it("/account is a plan-state page root with a stop title", () => {
    mount();
    expect(root()).toHaveAttribute("data-wl-state", "plan");
    expect(root()).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
    const h1 = within(root()).getByRole("heading", { level: 1, name: "Sign in" });
    expect(h1).toHaveClass("wl-type-page-title", "wl-title--stop");
  });
});

describe("AC2 inputs and errors", () => {
  it("an invalid email sets aria-invalid on the email input only and the status is the error", async () => {
    mount();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveClass("wl-input");
    expect(email).not.toHaveAttribute("aria-invalid");
    fireEvent.change(email, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    const status = await screen.findByText(en.auth.invalidEmail);
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("data-error", "true");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", status.id);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("a sent link is a plain label: no error flag and no aria-invalid", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    const status = await screen.findByText(en.auth.linkSent);
    expect(status).not.toHaveAttribute("data-error");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("an invalid code sets aria-invalid on the code input, not the email", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Enter code" }));
    const code = screen.getByLabelText("6-digit code");
    expect(code).toHaveClass("wl-input");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(code, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(code).toHaveAttribute("aria-invalid", "true"));
    expect(code).toHaveAttribute("aria-describedby", screen.getByRole("status").id);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("status")).toHaveTextContent(en.auth.invalidCode);
  });

  it("a rate-limit error is the error colour but marks no field invalid", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { status: 429, message: "rate" } });
    mount();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    const status = await screen.findByText(en.auth.rateLimited);
    expect(status).toHaveAttribute("data-error", "true");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });
});

describe("AC3 segmented", () => {
  it("the tabs are a .wl-segmented tablist that keeps its roles and names", () => {
    mount();
    const list = screen.getByRole("tablist", { name: en.uf01.account.modesName });
    expect(list).toHaveClass("wl-segmented");
    for (const name of ["Send link", "Enter code"]) {
      expect(within(list).getByRole("tab", { name }).parentElement).toBe(list);
    }
    expect(within(list).getByRole("tab", { name: "Send link" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("the selected tab gets the plan.selected pill from the aria-selected rule", () => {
    const rule = /\.wl-uf01-plan__tabs > button\[aria-selected="true"\][^{]*\{([^}]*)\}/.exec(CSS);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--wl-on-selected\)/);
    expect(rule![1]).toMatch(/background:\s*var\(--wl-selected\)/);
  });
});

describe("buttons and links", () => {
  it("Send link is the primary, Google the secondary (aria-disabled when offline), Privacy a text button", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    mount();
    expect(screen.getByRole("button", { name: "Send link" })).toHaveClass("wl-button--primary");
    const google = screen.getByRole("button", { name: "Continue with Google" });
    expect(google).toHaveClass("wl-button--secondary");
    expect(google).toHaveAttribute("aria-disabled", "true");
    expect(google).not.toHaveAttribute("disabled");
    fireEvent.click(google);
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveClass("wl-button--text");
    expect(screen.getByText(en.auth.offline)).toHaveClass("wl-type-label");
  });
});

describe("AC5 guards", () => {
  it("the sign-in rules hold no px font size, raw colour, transition or animation", () => {
    const from = CSS.indexOf("UF-01.5 Account and /welcome/save (T-0606");
    expect(from).toBeGreaterThan(0);
    const mine = CSS.slice(from);
    expect(mine).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(mine).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(mine).not.toMatch(/transition|animation/);
    expect(mine).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it("no legacy sign-in class is left in the sources", () => {
    expect(CSS).not.toMatch(/\.wl-uf01(?!-plan)(?!__sr)[_a-z-]*\s*[{,.:]/);
    expect(SRC).not.toMatch(/wl-uf01__(?!sr)/);
  });
});
