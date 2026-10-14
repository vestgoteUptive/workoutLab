// T-0332 (UF-01.1, UF-01.5): the `/welcome/*` stand-down in the real `RedirectIfSignedIn`.
// If it breaks, ProfileGate and the guard bounce each other ("Maximum update depth exceeded"),
// a synchronous loop that hangs the routing suite. Here it fails in milliseconds instead.
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedirectIfSignedIn } from "../guards.js";
import type { ProfileStatus } from "../../profile/status.js";

const { useAuth, useProfileStatus, useProfileResolved } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useProfileStatus: vi.fn(),
  useProfileResolved: vi.fn(),
}));
vi.mock("../auth-context.js", () => ({ useAuth }));
vi.mock("../../profile/profile-context.js", () => ({ useProfileStatus, useProfileResolved }));

function Where() {
  return <span data-testid="loc">{useLocation().pathname}</span>;
}

function setup(
  auth: "signed-in" | "stale" | "signed-out",
  resolved: boolean,
  status: ProfileStatus,
  path: string,
) {
  useAuth.mockReturnValue({ status: auth });
  useProfileResolved.mockReturnValue(resolved);
  useProfileStatus.mockReturnValue(status);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <RedirectIfSignedIn>
              <span data-testid="child" />
            </RedirectIfSignedIn>
          }
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const child = () => document.querySelector('[data-testid="child"]');
const loc = () => document.querySelector('[data-testid="loc"]')?.textContent ?? null;

beforeEach(() => {
  window.sessionStorage.clear();
  // A return-to makes a real redirect observable as a location change.
  window.sessionStorage.setItem("wl-return-to", "/plan");
});
afterEach(() => cleanup());

describe("RedirectIfSignedIn", () => {
  it.each(["/welcome", "/welcome/goal", "/welcome/save"])(
    "AC-1: stands down at %s while the profile is unresolved",
    (path) => {
      setup("signed-in", false, "unknown", path);
      expect(child()).not.toBeNull();
      expect(loc()).toBeNull();
    },
  );

  it.each(["signed-in", "stale"] as const)("AC-2: stands down for a missing profile (%s)", (a) => {
    setup(a, true, "missing", "/welcome/save");
    expect(child()).not.toBeNull();
    expect(loc()).toBeNull();
  });

  it("AC-3: a present profile is redirected off /welcome/goal", () => {
    setup("signed-in", true, "present", "/welcome/goal");
    expect(child()).toBeNull();
    expect(loc()).toBe("/plan");
  });

  it.each(["/account", "/welcomed"])("AC-4: no stand-down at %s", (path) => {
    setup("signed-in", false, "unknown", path);
    expect(child()).toBeNull();
    expect(loc()).toBe("/plan");
  });

  it.each(["/welcome/goal", "/account"])("AC-5: signed out is never held at %s", (path) => {
    setup("signed-out", false, "unknown", path);
    expect(child()).not.toBeNull();
    expect(loc()).toBeNull();
  });
});
