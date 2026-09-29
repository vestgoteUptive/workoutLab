// AC-D10 (NFR-A11Y-1): axe finds 0 violations on C-01 `full` and `compact` with the zero, mixed,
// attention and loading fixtures; and the component folder passes the raw-colour guard.
//
// `vitest-axe` isn't installed yet (lockfile changes go through the orchestrator), so this runs
// the same engine, axe-core, directly; it resolves through `@axe-core/playwright`, which
// depends on it (D-0060). `color-contrast` is off: jsdom has no layout or canvas.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BodyMap } from "../index.js";
import type { BodyMapArea } from "../BodyMap.js";
import { attentionFixture, mixedFixture, zeroFixture } from "./fixtures.js";
import { mockMatchMedia, renderInRouter } from "./test-helpers.js";
import { COMPONENT_DIR } from "./paths.js";

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

beforeEach(() => {
  mockMatchMedia(false);
});

async function violations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const FIXTURES: Record<string, { areas?: BodyMapArea[]; loading?: boolean }> = {
  zero: { areas: zeroFixture },
  mixed: { areas: mixedFixture },
  attention: { areas: attentionFixture },
  loading: { loading: true },
};

describe("AC-D10 axe: 0 violations", () => {
  for (const variant of ["full", "compact"] as const) {
    for (const [name, props] of Object.entries(FIXTURES)) {
      it(`AC-D10 ${variant} / ${name}: axe reports no violations`, async () => {
        const { container } = renderInRouter(
          <main>
            <BodyMap variant={variant} {...props} />
          </main>,
        );
        expect(await violations(container)).toEqual([]);
      });
    }
  }

  it("AC-D10: the probe is sound, since axe does catch a nameless button", async () => {
    const { container } = renderInRouter(
      <main>
        <button type="button" />
      </main>,
    );
    expect((await violations(container)).map((v) => v.id)).toContain("button-name");
  });
});

describe("AC-D10 no raw colours (lint)", () => {
  it("AC-D10: wl-check-colours passes on components/body-map", () => {
    const bin = resolve(process.cwd(), "node_modules/.bin/wl-check-colours");
    const run = spawnSync(bin, [COMPONENT_DIR], { encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });
});
