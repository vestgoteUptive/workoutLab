// T-0446 UF-09 (D-0164 §6): the host's resolved timeZone reaches `ctx.timeZone` and the UF-05.1
// swap sheet, from UF-09.9 and from UF-09.6.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSession } from "../session.js";
import type { SeamAction } from "../seams.js";
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

const swapProps = vi.hoisted(() => ({ calls: [] as Array<{ timeZone: string | undefined }> }));
vi.mock("../../UF-05/index.js", () => ({
  SwapSheet: (props: { timeZone?: string }) => {
    swapProps.calls.push({ timeZone: props.timeZone });
    return <div data-testid="swap-stub" />;
  },
}));

const NOW = STARTED_AT_MS + 20 * 60_000;
const runtimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

beforeEach(async () => {
  window.localStorage.clear();
  swapProps.calls.length = 0;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openFromPause(props: Parameters<typeof renderSession>[0], name: string) {
  seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
  await renderSession({ locale: "en-GB", ...props });
  expect(screenId()).toBe("UF-09.9");
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
}

describe("T-0446 AC-1 ctx.timeZone", () => {
  const seen: FocusSession[] = [];
  const probe: SeamAction = {
    id: "how-to",
    label: "Probe",
    keepsClockRunning: false,
    render: (ctx) => {
      seen.push(ctx);
      return <div data-testid="probe" />;
    },
  };
  beforeEach(() => {
    seen.length = 0;
  });

  it("is the timeZone prop", async () => {
    await openFromPause({ timeZone: "Pacific/Auckland", seams: { pause: [probe] } }, "Probe");
    expect(seen.at(-1)!.timeZone).toBe("Pacific/Auckland");
  });
  it("the pair: with no prop it is the runtime zone", async () => {
    await openFromPause({ seams: { pause: [probe] } }, "Probe");
    expect(seen.at(-1)!.timeZone).toBe(runtimeZone);
  });
});

describe("T-0446 AC-2 the swap sheet", () => {
  it("UF-09.9 Swap passes Pacific/Auckland", async () => {
    await openFromPause({ timeZone: "Pacific/Auckland" }, "Swap");
    await findEl(() => screen.queryByTestId("swap-stub"));
    expect(swapProps.calls.at(-1)).toEqual({ timeZone: "Pacific/Auckland" });
  });
  it("UF-09.6 Swap passes Pacific/Auckland", async () => {
    seedRest(NOW, { setIndex: 3 });
    await renderSession({ locale: "en-GB", timeZone: "Pacific/Auckland" });
    await advance(120_000);
    expect(screenId()).toBe("UF-09.6");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    await findEl(() => screen.queryByTestId("swap-stub"));
    expect(swapProps.calls.at(-1)).toEqual({ timeZone: "Pacific/Auckland" });
  });
  it("the pair: UTC passes UTC", async () => {
    await openFromPause({ timeZone: "UTC" }, "Swap");
    await findEl(() => screen.queryByTestId("swap-stub"));
    expect(swapProps.calls.at(-1)).toEqual({ timeZone: "UTC" });
  });
});
