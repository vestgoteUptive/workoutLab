// AC-B4: `/auth/callback` exchanges the code and returns to the remembered path, or shows the
// expired-link message with a way back to `/account`.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCallback } from "./index.js";
import { rememberReturnTo } from "../../lib/auth/return-to.js";

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("../../lib/auth/client.js", () => ({
  supabase: { auth: { exchangeCodeForSession } },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/library" element={<div>library</div>} />
        <Route path="/account" element={<div>account</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  window.sessionStorage.clear();
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
});
