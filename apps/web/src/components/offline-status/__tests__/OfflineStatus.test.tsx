// AC-C19: offline status text/icon variants.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

// T-0407 (D-0127 superseded, D-0060): the offline status is axe-clean offline and online, and the
// icon is a named `img` (UF-08.1 header, UF-09 chrome). It stays silent: no alert, banner, status
// or live region (principle 1). `vitest-axe` isn't installed (lockfile changes go through the
// orchestrator), so this runs axe-core directly, resolved through `@axe-core/playwright` (D-0060),
// as BodyMap.a11y does. `color-contrast` is off: jsdom has no layout or canvas.
interface AxeViolation {
  id: string;
  nodes: { html: string }[];
}
type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: AxeViolation[] }> };
let axe: Axe;

beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});

async function violations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

describe("OfflineStatus axe and roles (T-0407)", () => {
  afterEach(() => {
    setOnline(true);
  });

  it("T-0407 AC1: offline, the icon variant has 0 axe violations (no aria-prohibited-attr)", async () => {
    setOnline(false);
    const { container } = render(
      <main>
        <OfflineStatus variant="icon" lastSyncedAt={null} />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it("T-0407 AC2: offline, the text variant has 0 axe violations", async () => {
    setOnline(false);
    const { container } = render(
      <main>
        <OfflineStatus variant="text" lastSyncedAt={null} />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });

  for (const variant of ["icon", "text"] as const) {
    it(`T-0407 AC2: online, the ${variant} variant renders nothing and has 0 axe violations`, async () => {
      setOnline(true);
      const { container } = render(
        <main>
          <OfflineStatus variant={variant} lastSyncedAt={null} />
        </main>,
      );
      expect(container.querySelector("main")).toBeEmptyDOMElement();
      expect(await violations(container)).toEqual([]);
    });
  }

  it('T-0407 AC3: offline, the icon is exactly one img named "Offline", empty, and silent', () => {
    setOnline(false);
    const { container } = render(<OfflineStatus variant="icon" lastSyncedAt={null} />);
    const imgs = screen.getAllByRole("img", { name: "Offline" });
    expect(imgs).toHaveLength(1);
    const icon = screen.getByRole("img", { name: "Offline" });
    expect(icon).toHaveClass("wl-offline-status__icon");
    expect(icon.textContent).toBe("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("T-0407 AC1: the probe is sound, since axe does catch aria-label on a role-less span", async () => {
    const { container } = render(
      <main>
        <span aria-label="Offline" />
      </main>,
    );
    expect((await violations(container)).map((v) => v.id)).toContain("aria-prohibited-attr");
  });
});
