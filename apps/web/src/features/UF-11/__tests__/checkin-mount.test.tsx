// T-0471 UF-11.1 CheckinCard mounts: AC-1 (UF-11.2 Plan, first sibling after <h1>), AC-2 (UF-02.1
// Today, through the REAL `features/UF-02/slots.js`, after C-01/the attention line and before the
// suggestion card), AC-3 (never during a workout — the mount mechanism itself: UF-02 is the only
// flow wired to the slot, and principle-1 import bans on UF-03/UF-08/UF-09 already pin that UF-11
// is unreachable from there; `app/__tests__/import-bans.test.ts` — web-shell lane — covers those
// bans and runs unedited).
//
// AC-2 imports `Today` from `features/UF-02/index.js` on purpose (D-0071 §3: a feature is reached
// through its index), exercising the real, unmocked `slots.tsx` this ticket ships. It seeds the
// SAME `lib/offline` cache tables UF-02's own loaders read (`use-today.ts`), using UF-11's own
// `freshDb`/`seedCache`, so no UF-02 test file is touched for this.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { en } from "../../../lib/i18n/en.js";
import { Plan } from "../index.js";
import { NOW, TZ, profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";
import { BENCH, sessionsFrom } from "./checkin-writes-helpers.js";

const u = en.uf11;
const uc = en.uf11.checkin;

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
    refreshRoutines: vi.fn(async () => undefined),
  };
});

// AC-2 only: `Today` (imported from `features/UF-02/index.js`, D-0071 §3) needs an `AuthProvider`
// ancestor; mocked `signed-in` the same way `UF-02/__tests__/today.test.tsx` does, so this file
// doesn't have to pull in UF-02's own real-auth test setup.
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({
    status: "signed-in" as const,
    redirectTarget: "/welcome" as const,
    signOut: vi.fn(),
  }),
}));

/** P2 = 7, P3 = 3, rhythm 3-4 (fixture F): the engine proposes a step down from 3-4 to 2-3. */
async function seedAc1Proposal() {
  const db = freshDb();
  const p2 = sessionsFrom("p2-", "2026-08-30", 7);
  const p3 = sessionsFrom("p3-", "2026-09-13", 3);
  await seedCache(db, {
    profile: profileF({ rhythmMin: 3, rhythmMax: 4 }),
    targets: targetsF(),
    library: [BENCH],
    sessions: [...p2.sessions, ...p3.sessions],
    sets: [...p2.sets, ...p3.sets],
  });
  return db;
}

/** A P3 = 5 history: on plan, no proposal, no card (the AC-1 "P3 = 5" contrast). */
async function seedNoProposal() {
  const db = freshDb();
  const p3 = sessionsFrom("p3-", "2026-09-13", 5);
  await seedCache(db, {
    profile: profileF({ rhythmMin: 3, rhythmMax: 4 }),
    targets: targetsF(),
    library: [BENCH],
    sessions: p3.sessions,
    sets: p3.sets,
  });
  return db;
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0471 AC-1 UF-11.2: CheckinCard is the first sibling after <h1>, red on main", () => {
  it("with the AC-1 proposal cached, the card sits directly after <h1>, before PlanBody's content", async () => {
    await seedAc1Proposal();
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan now={() => NOW} />} />
        </Routes>
      </MemoryRouter>,
    );

    const root = await waitFor(() => {
      const el = document.querySelector('[data-screen-id="UF-11.2"]');
      expect(el).not.toBeNull();
      return el!;
    });
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeNull(),
    );

    const h1 = root.querySelector("h1")!;
    expect(h1.textContent).toBe(en.screens.plan);
    const card = document.querySelector('[data-part="checkin-card"]')!;
    // T-0529 (D-0195 §1): the h1 now sits in `.wl-plan__header`; the card follows that header.
    expect(h1.parentElement!.nextElementSibling).toBe(card);
    expect(card.getAttribute("aria-label")).toBe(uc.cardName);

    // PlanBody's own content still renders, after the card.
    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
  });

  it("with P3 = 5 (on plan, no proposal): no card, and the Plan body text matches the no-card render", async () => {
    await seedNoProposal();
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan now={() => NOW} />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(listRows(u.headings.targets)).toHaveLength(9));
    expect(document.querySelector('[data-part="checkin-card"]')).toBeNull();
    expect(document.body.textContent).not.toContain(uc.accept);
  });

  it("Plan's own clock pins the card's clock too (same `now`, no separate instant)", async () => {
    await seedAc1Proposal();
    const pinned = NOW;
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <Routes>
          <Route path="/plan" element={<Plan now={() => pinned} />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeNull(),
    );
    // The copy names the fixture F period end (26 Sep), which only lines up if the card used
    // the SAME `now` Plan was given, not its own `systemClock` default.
    expect(document.body.textContent).toContain("13 Sep–26 Sep");
  });
});

describe("T-0471 AC-2 UF-02.1: CheckinCard through the real slots.js, red on main", () => {
  it("renders once, after C-01 and the attention line, before the suggestion card; h1 and Start are in the DOM before the lazy chunk resolves", async () => {
    const { Today } = await import("../../UF-02/index.js");
    await seedAc1Proposal();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Today now={NOW} timeZone={TZ} locale="en-GB" />} />
        </Routes>
      </MemoryRouter>,
    );

    // The host and Start are on the first render, before the lazy CheckinCard chunk resolves
    // (the lazy import is a real dynamic import even in Vitest, so this is a real race, not a
    // simulated one).
    expect(document.querySelector('[data-screen-id="UF-02.1"]')).not.toBeNull();
    expect(document.querySelector("h1")!.textContent).toBe(en.screens.today);

    await waitFor(() =>
      expect(document.querySelectorAll('[data-part="checkin-card"]')).toHaveLength(1),
    );
    const c01 = document.querySelector('[data-component="C-01"]')!;
    const card = document.querySelector('[data-part="checkin-card"]')!;
    const follows = (a: Node, b: Node): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(c01, card)).toBe(true);

    await waitFor(() => expect(document.querySelector('[data-part="start"]')).not.toBeNull());
    const start = document.querySelector('[data-part="start"]')!;
    expect(follows(card, start)).toBe(true);
  });
});

describe("T-0471 AC-2 follow-up (QA fault injection): the card never mounts before Today's own data is ready", () => {
  it("delaying only Today's own loadTargets (not any loader CheckinCard itself reads) still keeps the card unmounted until Today leaves 'loading'", async () => {
    // `useToday` imports `loadTargets` straight from `lib/offline/history.js`; `useCheckinData`
    // (the card's own hook, `use-checkin-data.ts`) never calls `loadTargets` at all — it reads
    // `loadProfile`/`loadSessions`/`loadEngineHistory`/`loadLibrary`/`loadCheckins` through
    // `lib/offline/index.js`. Delaying only `loadTargets` here therefore slows Today's own cache
    // read (`use-today.ts`'s `Promise.all`) without touching any loader the card's read depends
    // on, isolating the ordering guarantee the same way QA's own fault injection did: if
    // `Today.tsx`'s `CheckinSlot` gate were removed, the card (fast) would mount and become
    // interactive while Today's own state (artificially slow) is still "loading".
    const real = await vi.importActual<typeof import("../../../lib/offline/history.js")>(
      "../../../lib/offline/history.js",
    );
    let releaseTargets: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseTargets = resolve;
    });
    vi.doMock("../../../lib/offline/history.js", () => ({
      ...real,
      loadTargets: async () => {
        await gate;
        return real.loadTargets();
      },
    }));

    vi.resetModules();
    const { Today } = await import("../../UF-02/index.js");
    await seedAc1Proposal();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Today now={NOW} timeZone={TZ} locale="en-GB" />} />
        </Routes>
      </MemoryRouter>,
    );

    // `loadTargets` is still gated, so Today's own cache read can't resolve. Wait long enough
    // for the card's own (fast, ungated) read and its lazy chunk to settle on their own — if the
    // gate in `CheckinSlot` were ever removed, the card would mount here, well before
    // `loadTargets` (and so Today's own state) ever does. `.wl-today__status` (`Today.tsx`'s
    // `OfflineStatus` wrapper) only renders once `state.status !== "loading"` — the same state
    // value `CheckinSlot`'s own gate reads — so this is a direct check of Today's own state, not
    // an inference from timing.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(document.querySelector('[data-part="checkin-card"]')).toBeNull();
    expect(document.querySelector(".wl-today__status")).toBeNull();

    releaseTargets();

    await waitFor(() => expect(document.querySelector(".wl-today__status")).not.toBeNull());
    await waitFor(() =>
      expect(document.querySelector('[data-part="checkin-card"]')).not.toBeNull(),
    );
  });
});

describe("T-0471 AC-3: the mount mechanism never reaches a workout flow", () => {
  it("UF-02 is the only registry that loads CheckinCard; UF-03/UF-08/UF-09 are covered by the existing import-ban pins (app/__tests__/import-bans.test.ts), unedited by this ticket", async () => {
    const { todayCheckinSlot } = await import("../../UF-02/slots.js");
    expect(todayCheckinSlot).not.toBeNull();
  });
});
