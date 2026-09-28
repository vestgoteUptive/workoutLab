// AC-B4: `/auth/callback` exchanges the code and returns to the remembered path, or shows the
// expired-link message with a way back to `/account`, pre-filled with the last email used.
//
// Lives in `lib/auth/`, not `features/UF-01/`: `features/UF-01` is only a stub path for this
// ticket (T-0301 replaces it with the designed screens), while this behaviour belongs to the
// auth flow itself.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Account, AuthCallback } from "../../features/UF-01/index.js";
import { rememberReturnTo } from "./return-to.js";

const { exchangeCodeForSession, signInWithOtp } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signInWithOtp: vi.fn(),
}));
vi.mock("./client.js", () => ({
  supabase: { auth: { exchangeCodeForSession, signInWithOtp } },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/library" element={<div>library</div>} />
        <Route path="/account" element={<Account />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  signInWithOtp.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

it("exchanges the code and navigates to the remembered return-to path", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  rememberReturnTo("/library");

  renderAt("/auth/callback?code=abc");

  expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  await waitFor(() => expect(screen.getByText("library")).toBeInTheDocument());
});

it("navigates to / when no return-to was stored", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: null });

  renderAt("/auth/callback?code=abc");

  await waitFor(() => {
    // "/" isn't in this harness's routes, so the router just shows nothing matched;
    // what matters is we left the callback screen.
    expect(document.querySelector('[data-screen-id="UF-01.5-auth-callback"]')).toBeNull();
  });
});

describe("expired or already-used link", () => {
  it("shows the expired message for error_code=otp_expired, with a way to /account", async () => {
    renderAt("/auth/callback?error_code=otp_expired");
    expect(await screen.findByText("This link has expired. Send a new one.")).toBeInTheDocument();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Send a new one" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("shows the expired message when the exchange fails (already used)", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid_grant" } });
    renderAt("/auth/callback?code=used");
    expect(await screen.findByText("This link has expired. Send a new one.")).toBeInTheDocument();
  });

  it("AC-B4: /account pre-fills the last email after following the expired-link button", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    // First, send a link from /account, which remembers the email (magic-link.ts).
    const first = renderAt("/account");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled());
    first.unmount();

    // The link turns out to be expired; the user lands back on /account via "Send a new one".
    const second = renderAt("/auth/callback?error_code=otp_expired");
    fireEvent.click(await screen.findByRole("link", { name: "Send a new one" }));
    second.unmount();

    // A fresh mount of /account (simulating the real navigation) must pre-fill that email.
    renderAt("/account");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });
});
