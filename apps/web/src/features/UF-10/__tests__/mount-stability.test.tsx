// T-0307a regression: a screen mounted WITHOUT the `now` test seam (the real router path) loads
// its data once, not once per render. Found by the e2e: `new Date()` per render changed the
// hook's `nowIso` dependency every render and froze the page in a render loop, which no other
// test caught because every one of them passes a fixed `now`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import * as history from "../../../lib/offline/history.js";
import { Balance } from "../index.js";
import { LIBRARY, defaultTargets } from "./fixtures.js";
import { freshDb, rowAreas, seedCache, signIn, signOut } from "./test-helpers.js";

// D-0113 §5: UF-10 reads `useAuth()`; this suite runs signed in (T-0383).
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

beforeEach(() => {
  signIn();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("mounting without a `now` prop", () => {
  it("reads the cache a bounded number of times (no render loop)", async () => {
    const db = freshDb();
    await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
    const spy = vi.spyOn(history, "loadTargets");
    render(
      <MemoryRouter initialEntries={["/balance"]}>
        <Balance />
      </MemoryRouter>,
    );
    await waitFor(() => expect(rowAreas()).toHaveLength(9));
    // Let any loop show itself: each iteration is at least one IDB round trip.
    await new Promise((r) => setTimeout(r, 300));
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
