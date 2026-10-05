// T-0399 AC1: the `press()` harness drives Home and End like every other key — a real keydown
// then keyup on the focused element, `code` equal to `key`, and no default action (focus stays).
import { afterEach, describe, expect, it } from "vitest";
import { press } from "./keyboard.js";

let button: HTMLButtonElement | undefined;

afterEach(() => {
  button?.remove();
  button = undefined;
  // T-0443 AC-4: nothing is left behind on the body.
  expect(document.body.childElementCount).toBe(0);
});

describe("keyboard.ts press()", () => {
  it("T-0399 AC1 Home then End dispatch keydown and keyup on the focused button, focus unchanged", async () => {
    button = document.createElement("button");
    button.type = "button";
    button.textContent = "tab";
    document.body.append(button);
    const seen: { type: string; key: string; code: string }[] = [];
    const record = (e: KeyboardEvent) => seen.push({ type: e.type, key: e.key, code: e.code });
    button.addEventListener("keydown", record);
    button.addEventListener("keyup", record);
    button.focus();

    await press("Home");
    await press("End");

    expect(seen).toEqual([
      { type: "keydown", key: "Home", code: "Home" },
      { type: "keyup", key: "Home", code: "Home" },
      { type: "keydown", key: "End", code: "End" },
      { type: "keyup", key: "End", code: "End" },
    ]);
    expect(document.activeElement).toBe(button);
  });
});
