// T-0594 AC3: SessionProgress structure, pause wiring, extremes and the one-line counter.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProgress } from "../SessionProgress.js";

afterEach(cleanup);

function setup(done: number, total: number, onPause = vi.fn()) {
  render(
    <SessionProgress
      done={done}
      total={total}
      onPause={onPause}
      pauseLabel="Pause"
      counter={`${done} of ${total}`}
    />,
  );
  const segs = [...document.querySelectorAll(".wl-session-progress__segment")];
  return { segs, onPause };
}
const filled = (el: Element) => el.classList.contains("wl-session-progress__segment--done");

describe("T-0594 AC3 SessionProgress", () => {
  it("2 of 5: five segments, two filled, counter shown, all aria-hidden", () => {
    const { segs } = setup(2, 5);
    expect(segs).toHaveLength(5);
    expect(segs.map(filled)).toEqual([true, true, false, false, false]);
    expect(document.querySelector(".wl-session-progress__segments")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  it("pause button has the given name and fires once", () => {
    const { onPause } = setup(1, 3);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("done 0 is all unfilled, done = total is all filled", () => {
    expect(setup(0, 4).segs.some(filled)).toBe(false);
    cleanup();
    expect(setup(4, 4).segs.every(filled)).toBe(true);
  });

  it("CSS: filled segments use --wl-ink, unfilled --wl-progress-off, counter is nowrap, pause is 44 px", () => {
    const css = readFileSync(resolve(__dirname, "../session-progress.css"), "utf8");
    const rule = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      expect(i).toBeGreaterThanOrEqual(0);
      return css.slice(i, css.indexOf("}", i));
    };
    expect(rule(".wl-session-progress__segment")).toContain("var(--wl-progress-off)");
    expect(rule(".wl-session-progress__segment--done")).toContain("var(--wl-ink)");
    expect(rule(".wl-session-progress__segment")).toContain("var(--wl-radius-progress)");
    expect(rule(".wl-session-progress__counter")).toContain("white-space: nowrap");
    expect(rule(".wl-session-progress__pause")).toMatch(/inline-size: 44px/);
  });
});
