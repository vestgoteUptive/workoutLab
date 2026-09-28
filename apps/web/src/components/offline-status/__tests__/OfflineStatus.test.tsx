// AC-C19: offline status text/icon variants.
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
