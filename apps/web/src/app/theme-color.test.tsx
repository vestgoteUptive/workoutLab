// T-0589 AC6: <meta name="theme-color"> follows the outermost screen root's state.
import { tokens } from "@workoutlab/design-tokens";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useThemeColor } from "./theme-color.js";

function Probe({ route }: { route: string }) {
  useThemeColor(route);
  return null;
}

const meta = () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const flush = () => act(async () => {});

describe("T-0589 AC6 theme-color from the screen root's state", () => {
  beforeEach(() => {
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = tokens.color.bg;
    document.head.appendChild(m);
  });
  afterEach(() => cleanup());

  it("plan, then lift after the attribute switches, bg without a state", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const screen = document.createElement("main");
    screen.setAttribute("data-screen-id", "UF-02.1");
    screen.setAttribute("data-wl-state", "plan");
    host.appendChild(screen);
    render(<Probe route="/" />);
    expect(meta()!.content).toBe(tokens.color.plan.bg);
    screen.setAttribute("data-wl-state", "lift");
    await flush();
    expect(meta()!.content).toBe(tokens.color.lift.bg);
    screen.setAttribute("data-wl-state", "rest");
    await flush();
    expect(meta()!.content).toBe(tokens.color.rest.bg);
    screen.removeAttribute("data-wl-state");
    await flush();
    expect(meta()!.content).toBe(tokens.color.bg);
    host.remove();
  });

  it("a sheet inside a lift root does not change it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = `<main data-screen-id="UF-09.3" data-wl-state="lift"><div class="wl-sheet" data-wl-state="plan"></div></main>`;
    render(<Probe route="/session" />);
    await flush();
    expect(meta()!.content).toBe(tokens.color.lift.bg);
    host.remove();
  });

  it("creates the meta when none exists", () => {
    meta()!.remove();
    render(<Probe route="/" />);
    expect(meta()!.content).toBe(tokens.color.bg);
  });
});
