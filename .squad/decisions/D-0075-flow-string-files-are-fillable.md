---
id: D-0075
title: A flow's own `lib/i18n/flows/uf-NN.ts` is fillable by its owning feature ticket — T-0318 AC-7's "empty object" assertion pinned a transient state and is replaced by a shape-and-wiring assertion
status: decided
date: 2026-09-29
by: triage (TR-0031)
area: web
supersedes: T-0318 AC-7's emptiness assertion only (the AC's other four guarantees stand, restated below)
---
## Context
TR-0031, raised by frontend-dev on T-0307a (web-feature:UF-10) rather than worked around, which was the right call: `apps/web/src/lib/i18n/**` is web-shell's lane and T-0307a's "Not yours" lists it explicitly.

`apps/web/src/lib/i18n/__tests__/flows.test.ts:30-34` (T-0318 AC-7) asserts, for all eleven flow files:

```ts
expect(source).toContain(`export const uf${n} = {} as const;`);
expect(MODULES[`uf${n}`]).toEqual({});
```

Every Phase 3 web-feature ticket is required by its own scope to put its strings in its own `flows/uf-NN.ts` (D-0071 §1), and T-0307a's AC-A21 makes a **non-empty** `flows/uf-10.ts` a pass condition. T-0307a's AC-A21 and this shell test cannot both be green. Measured in TR-0031: filling `flows/uf-10.ts` fails exactly 1 of 29 cases, and only for the filled flow.

This is not specific to UF-10. All five feature lanes now running in parallel (T-0306a, T-0307a, T-0307b, T-0308a, T-0308b) fill their own flow file, so each hits the same failure in the same test, in five separate worktrees.

## Decision
**The emptiness assertion is wrong and comes out. Everything else in AC-7 stays and must keep biting.**

1. **Emptiness was never the invariant.** D-0071 §1 (`status: decided`) says "T-0318 creates `lib/i18n/flows/uf-01.ts` … `uf-11.ts`, **each an empty `as const` object** … Each web-feature ticket **owns exactly its own** `flows/uf-NN.ts`". The emptiness describes T-0318's *creation* state; the ownership is the invariant. `flows/uf-10.ts`'s own header comment says "Empty **until then**", and T-0307a's granted extra says "**Adding keys only**; the `export const uf10 = {…} as const` shape stays". A file that no ticket may ever fill would make D-0071 §1's per-ticket grant meaningless.

2. **What AC-7 actually protects** (fault-proven by QA on T-0318, and all of it load-bearing):
   - `flows/` holds **exactly** `uf-01.ts` … `uf-11.ts` — an extra or missing file fails. This is the pinned file set: a feature cannot smuggle in a twelfth module.
   - `en.ufNN` is **reference-equal** (`toBe`, not `toEqual`) to the module export. This is the assertion that stops a feature inlining a copy of its strings into `en.ts`, and is the real mechanical backing for "no feature ticket edits `en.ts`".
   - **No extra top-level `ufNN` key** on `en`.
   - Every **pre-existing `en` key pinned by value**, as literals in the test file rather than a `.snap`, so `vitest -u` cannot silently rewrite it. Formatters compared by calling them.
   These four are untouched by this decision and must not be weakened, reordered into a snapshot, or moved to a `.snap` file.

3. **The replacement.** The single case `"uf-%s.ts exports an empty \`as const\` object"` becomes a shape-and-wiring case: the file exists, exports `ufNN` as an `as const` **object literal**, and the export is a plain object. Contents are the owning feature ticket's business. Exact shape in the Consequences below, so the implementing ticket needs no further interpretation.

4. **Stricter than TR-0031 proposed, in two places.** TR-0031's suggested `expect(typeof mod).toBe("object")` plus `not.toBeNull()` also passes for an **array** and for a `Map`, and its `\\{[\\s\\S]*\\}` regex is unanchored and greedy, so it can span from the object's opening brace to an unrelated closing brace later in the file. The replacement below anchors at the start of a line and terminates lazily at the first `\n} as const;`, and uses `Object.getPrototypeOf(mod) === Object.prototype` so only a plain object passes. A test that merely stops failing is not the goal; the goal is that the *remaining* guarantee is as sharp as the one removed.

5. **This agrees with T-0320's enforcement, by construction.** T-0320 (infra, just landed) adds a `check:repo` sub-check whose AC-6.2 requires that a UF-10-lane branch changing `apps/web/src/lib/i18n/flows/uf-10.ts` yields **zero** findings (its own flow file, listed as an extra), while `flows/uf-06.ts` yields `shared-i18n-other-flow` and `en.ts` yields `shared-i18n-en-edited`. T-0320 therefore already assumes a feature lane *writes* its own flow file. Before this decision, T-0320 permitted exactly what `flows.test.ts` forbade; after it, the two agree: **a feature lane may fill its own flow file and nothing else in `lib/i18n/`.** No change to T-0320 is needed or permitted by this decision.

6. **No contract change, no human gate.** `lib/i18n/**` is not a contract file (`docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md`, `packages/design-tokens/src/tokens.json` are untouched). Nothing in `.squad/gates.md` is crossed.

## Why a decision and not just a test fix
The assertion is the mechanical expression of a `decided` decision (D-0071 §1) and was signed off through a full accept log (T-0318 AC-7, "met", with QA fault-planting). Overturning part of an accepted AC is exactly the case the decisions log exists for, and five lanes will read this file when their own flow file goes red. The test edit alone would leave the next reader unable to tell whether the emptiness was dropped on purpose or eroded.

## Consequences
- **Follow-up ticket T-0334 (web-shell), one file, no product change:** `apps/web/src/lib/i18n/__tests__/flows.test.ts`. Replace lines 30–34 with:

  ```ts
  it.each(NUMBERS)("uf-%s.ts exports `ufNN` as an `as const` object literal", (n) => {
    const source = readFileSync(resolve(FLOWS_DIR, `uf-${n}.ts`), "utf8");
    // The shape stays `export const ufNN = {…} as const;` (D-0071 §1, D-0075). The contents
    // are the owning feature ticket's: emptiness was T-0318's initial state, not an invariant.
    // Either the untouched one-liner, or a filled literal whose `} as const;` closes at
    // column 0 — which is what Prettier produces and what keeps this a single declaration.
    expect(source).toMatch(
      new RegExp(`^export const uf${n} = \\{(\\} as const;|[\\s\\S]*?\\n\\} as const;)$`, "m"),
    );
    const mod = MODULES[`uf${n}` as keyof typeof MODULES];
    expect(Object.getPrototypeOf(mod)).toBe(Object.prototype);
  });
  ```

  Both halves must bite, and the implementing ticket verifies that by fault-planting rather than by reading:
  - (a) an **array** export (`export const ufNN = [] as const;`) fails. This is what `Object.getPrototypeOf(mod) === Object.prototype` buys over TR-0031's `typeof mod === "object"`, which an array passes.
  - (b) a filled literal with real keys **passes**. This is the anti-vacuity half: without it the replacement could be as over-tight as the assertion it replaces, and the whole point is that a feature can fill its file.
  - (c) dropping `as const` (`export const ufNN = {};`) fails, so the `as const` in D-0071 §1 stays pinned.

  **What this replacement deliberately does not pin, so the implementing ticket does not overclaim:** it does not prove the file holds exactly *one* declaration. The regex is anchored at the line start and terminates at the first `\n} as const;`, so a second exported const appended below would still match. That is acceptable — a stray extra export in a flow file is caught by the no-extra-top-level-`ufNN`-key case and by review, and the guarantee D-0071 §1 needs is about *which file* a flow writes, not how many consts are in it. Do not add a "single declaration" assertion and claim the regex enforces it.

  Also update the file's header comment (lines 2–4), which currently says "each an empty `as const` object", to say the shape is pinned and the contents are the owning flow's, citing D-0075 and TR-0031.
- The `it.each` name, the `NUMBERS`/`MODULES` tables, the directory-listing case, the reference-equality case, the no-extra-key case and the whole "pre-existing catalogue is unchanged" `describe` block are **unchanged**.
- T-0318's Accept log gets a one-line amendment note pointing at D-0075 and TR-0031 (the accept log is the only edit allowed to a done ticket's record). AC-7's other four guarantees remain "met".
- T-0307a's AC-A21 needs no change: it already asserts the right thing.
- No feature ticket is re-groomed and no feature lane changes scope. The five blocked lanes resume as soon as T-0334 lands.
- **The ownership carve-out TR-0031 raises last is accepted as a follow-up, not folded in here.** `.squad/ownership.yaml` gives all of `apps/web/src/lib/**` to web-shell, and the per-flow grant lives only in each ticket's "Listed extras". That is *consistent* today because T-0320 reads the ticket file's `## Paths you may change` section, which is deliberate (T-0320 §"Decision to record" 4). Making the carve-out explicit in `ownership.yaml` would be a second source of truth for the same grant, so it is an orchestrator judgement, not a triage one. Recorded as a follow-up; not required for T-0333.

## Revisit if
A flow file grows beyond strings (a formatter needing a unit test of its own, for instance). The shape assertion pins an object literal; a flow file that needs to export a function would need this decision revisited rather than the assertion loosened.
