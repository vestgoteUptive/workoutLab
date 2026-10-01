// AC-C19: offline status text/icon variants.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineStatus } from "../OfflineStatus.js";

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

describe("OfflineStatus (AC-C19)", () => {
  afterEach(() => {
    setOnline(true);
  });

  it('text variant reads "Offline · last synced 14:05" (en-GB, Europe/Stockholm)', () => {
    setOnline(false);
    render(
      <OfflineStatus
        variant="text"
        lastSyncedAt="2026-09-28T12:05:00Z"
        locale="en-GB"
        timeZone="Europe/Stockholm"
      />,
    );
    expect(screen.getByText("Offline · last synced 14:05")).toBeInTheDocument();
  });

  // T-0355 AC5: the default en-GB locale zero-pads the hour (D-0045 §9 `timeStyle: "short"`).
  it('text variant reads "Offline · last synced 08:10" with the default locale', () => {
    setOnline(false);
    render(
      <OfflineStatus
        variant="text"
        lastSyncedAt="2026-09-27T06:10:00Z"
        timeZone="Europe/Stockholm"
      />,
    );
    const line = document.querySelector(".wl-offline-status__text");
    expect(line?.textContent).toBe("Offline · last synced 08:10");
  });

  it('text variant reads "Offline · not synced yet" when nothing has synced', () => {
    setOnline(false);
    render(<OfflineStatus variant="text" lastSyncedAt={null} />);
    expect(screen.getByText("Offline · not synced yet")).toBeInTheDocument();
  });

  it("renders nothing when online", () => {
    setOnline(true);
    const { container } = render(<OfflineStatus variant="text" lastSyncedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('icon variant renders only an aria-label="Offline" element, no text, no alert/banner', () => {
    setOnline(false);
    render(<OfflineStatus variant="icon" lastSyncedAt={null} />);
    const icon = screen.getByLabelText("Offline");
    expect(icon).toBeInTheDocument();
    expect(icon.textContent).toBe("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});

// The icon variant carries no text (AC-C19), so it is invisible unless the stylesheet gives it a
// size. jsdom doesn't apply imported CSS, so assert against the stylesheet source instead.
describe("offline-status.css backs the classes the component renders", () => {
  const dir = "src/components/offline-status";
  const css = readFileSync(`${dir}/offline-status.css`, "utf8");

  it("is imported by the component, so the classes are not dead", () => {
    const tsx = readFileSync(`${dir}/OfflineStatus.tsx`, "utf8");
    expect(tsx).toContain('import "./offline-status.css"');
  });

  it("gives the icon variant a non-zero size, so it is actually visible", () => {
    const iconRule = css.slice(css.indexOf(".wl-offline-status__icon"));
    expect(iconRule).toMatch(/inline-size:\s*[1-9]/);
    expect(iconRule).toMatch(/block-size:\s*[1-9]/);
  });

  it("defines every class the component uses", () => {
    for (const cls of [".wl-offline-status__icon", ".wl-offline-status__text"]) {
      expect(css).toContain(cls);
    }
  });

  it("uses only design-token colours, no hex literals (D-0019)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/var\(--wl-color-/);
  });
});
