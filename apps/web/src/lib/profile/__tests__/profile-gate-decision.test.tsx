// T-0301a: the real `ProfileGate` component's three-way decision, and `isGatedPath`'s rule.
//
// Why this exists alongside the routing suite: a gate that redirects on `"unknown"` sends the
// user to `/welcome/save`, whose `guest-only` stand-down then renders it, and the gate on the
// route they came from fires again — an infinite render loop that *hangs* the routing suite
// rather than failing it (verified: "Maximum update depth exceeded", no test result). A hang is
// not a legible failure, so the decision is pinned here too, where it fails in milliseconds.
//
// The mechanism, not a re-implementation: `useProfileStatus` is mocked and the *real*
// `ProfileGate` is rendered inside a real router, so the assertion is on what the component
// does — which element is on the DOM, and where the router ended up.
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGate, PROFILE_SAVE_PATH } from "../ProfileGate.js";
import { EXTRA_GATED_PATHS, gatedPaths, isGatedPath } from "../gated-routes.js";
import type { ProfileStatus } from "../status.js";
import { routes } from "../../../app/routes.js";

const { useProfileStatus } = vi.hoisted(() => ({ useProfileStatus: vi.fn() }));
vi.mock("../profile-context.js", () => ({ useProfileStatus }));

function Location() {
  return <span data-testid="loc">{useLocation().pathname}</span>;
}

/** `/plan` behind the real gate, with `/welcome/*` reachable as the redirect target. */
function Harness() {
  return (
    <MemoryRouter initialEntries={["/plan"]}>
      <Location />
      <Routes>
        <Route
          path="/plan"
          element={
            <ProfileGate>
              <span data-screen-id="UF-11.2" />
            </ProfileGate>
          }
        />
        <Route path="/welcome/*" element={<span data-screen-id="UF-01.1" />} />
      </Routes>
    </MemoryRouter>
  );
}

function location(): string {
  return document.querySelector('[data-testid="loc"]')!.textContent!;
}

beforeEach(() => {
  useProfileStatus.mockReset();
});

describe("only `missing` redirects — the loop guard", () => {
  it("`missing` redirects to /welcome/save and the route's own element is gone", () => {
    useProfileStatus.mockReturnValue("missing" satisfies ProfileStatus);
    render(<Harness />);
    expect(location()).toBe("/welcome/save");
    expect(document.querySelector('[data-screen-id="UF-11.2"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-01.1"]')).toBeInTheDocument();
  });

  it.each<ProfileStatus>(["unknown", "present"])("`%s` renders the route and stays put", (s) => {
    useProfileStatus.mockReturnValue(s);
    render(<Harness />);
    expect(location()).toBe("/plan");
    expect(document.querySelector('[data-screen-id="UF-11.2"]')).toBeInTheDocument();
    expect(document.querySelector('[data-screen-id="UF-01.1"]')).not.toBeInTheDocument();
  });

  it("the gate's own target is not itself gated (the structural loop guard)", () => {
    expect(PROFILE_SAVE_PATH).toBe("/welcome/save");
    const target = routes.find((r) => r.path === "/welcome/*")!;
    expect(isGatedPath(target)).toBe(false);
    // And the target really is served by that route, not by the catch-all.
    expect(PROFILE_SAVE_PATH.startsWith("/welcome/")).toBe(true);
  });
});

describe("isGatedPath encodes the D-0071 §11 rule, not a hard-coded list", () => {
  it("every `protected` entry in the real table is gated", () => {
    const protectedRoutes = routes.filter((r) => r.guard === "protected");
    expect(protectedRoutes).toHaveLength(12);
    for (const route of protectedRoutes) {
      expect(isGatedPath(route), route.path).toBe(true);
    }
  });

  it("a `protected` route added later is gated without being named", () => {
    expect(isGatedPath({ path: "/some/route/added/later", guard: "protected" })).toBe(true);
  });

  it("`session` is gated for /session/setup only — not by prefix (principle 1)", () => {
    expect(isGatedPath({ path: "/session/setup", guard: "session" })).toBe(true);
    expect(isGatedPath({ path: "/session/:sessionId", guard: "session" })).toBe(false);
    expect(isGatedPath({ path: "/session/:sessionId/summary", guard: "session" })).toBe(false);
    // A prefix match would gate this by accident; an exact match does not.
    expect(isGatedPath({ path: "/session/setup/extra", guard: "session" })).toBe(false);
    expect([...EXTRA_GATED_PATHS]).toEqual(["/session/setup"]);
  });

  it("`guest-only` and `public` are never gated", () => {
    expect(isGatedPath({ path: "/welcome/*", guard: "guest-only" })).toBe(false);
    expect(isGatedPath({ path: "/account", guard: "guest-only" })).toBe(false);
    expect(isGatedPath({ path: "/auth/callback", guard: "public" })).toBe(false);
  });

  it("gatedPaths returns 13 entries, in table order", () => {
    const gated = gatedPaths(routes);
    expect(gated).toHaveLength(13);
    const indexIn = (p: string) => routes.findIndex((r) => r.path === p);
    for (let i = 1; i < gated.length; i++) {
      expect(indexIn(gated[i]!)).toBeGreaterThan(indexIn(gated[i - 1]!));
    }
  });
});
