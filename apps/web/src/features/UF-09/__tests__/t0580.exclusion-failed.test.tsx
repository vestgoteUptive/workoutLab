// T-0580 UF-09.9 / UF-09.6 (UF-08.3 spec "Write fails"): the swap applied but "Don't suggest
// again" did not save. The sheet closes, so the host shows "Couldn't save. Try again." in its
// always-mounted alert, under the screen the user returns to.
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@workoutlab/engine";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { seedRest } from "./countdown-helpers.js";
import { findEl, seedFocus } from "./set-loop-helpers.js";

const stub = vi.hoisted(() => ({ failed: true }));
vi.mock("../../UF-05/index.js", () => ({
  SwapSheet: (props: {
    workout: Workout;
    onApply(w: Workout, o: { exclusionFailed: boolean }): Promise<void> | void;
  }) => (
    <button
      type="button"
      onClick={() => void props.onApply(props.workout, { exclusionFailed: stub.failed })}
    >
      stub apply
    </button>
  ),
}));

const NOW = STARTED_AT_MS + 20 * 60_000;
const alertEl = () => document.querySelector<HTMLElement>('[data-field="exclusion-failed"]');

beforeEach(async () => {
  window.localStorage.clear();
  stub.failed = true;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function applyFrom(name: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
  fireEvent.click(await findEl(() => screen.queryByRole("button", { name: "stub apply" })));
  await flushReal();
}

describe("T-0580 AC-1/2/3 UF-09 host", () => {
  it("UF-09.9: the alert is mounted and empty before, and reads the message after the sheet closes", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.9");
    expect(alertEl()).toHaveAttribute("aria-live", "assertive");
    expect(alertEl()).toBeEmptyDOMElement();
    await applyFrom("Swap");
    expect(screen.queryByRole("button", { name: "stub apply" })).toBeNull();
    expect(screenId()).toBe("UF-09.9");
    expect(within(alertEl()!).getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });

  it("UF-09.6: the same message after the swap from Next exercise", async () => {
    seedRest(NOW, { setIndex: 3 });
    await renderSession({ locale: "en-GB" });
    await advance(120_000);
    expect(screenId()).toBe("UF-09.6");
    await applyFrom("Swap");
    expect(screenId()).toBe("UF-09.6");
    expect(within(alertEl()!).getByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
  });

  it("the pair: a swap whose exclusion saved (or was not asked for) shows nothing", async () => {
    stub.failed = false;
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
    await renderSession({ locale: "en-GB" });
    await applyFrom("Swap");
    expect(screenId()).toBe("UF-09.9");
    expect(alertEl()).toBeEmptyDOMElement();
  });
});
