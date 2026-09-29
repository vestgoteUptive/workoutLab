---
id: TR-0031
title: T-0318's `flows.test.ts` asserts every `flows/uf-NN.ts` is empty, which blocks all five Phase 3 feature lanes from filling their own string file
raised-by: frontend-dev (T-0307a, web-feature:UF-10)
date: 2026-09-29
status: resolved
lane-needed: web-shell
resolved-by: D-0075 (triage, 2026-09-29)
blocks: [T-0306a, T-0307a, T-0307b, T-0308a, T-0308b, and every later web-feature ticket]
---

<!-- Raised on branch `t/T-0307a-balance-screen`. Copied to `main` by triage with the resolution,
     so the five blocked lanes and the T-0334 builder can read it without waiting for T-0307a to
     merge. The branch copy carries the same resolution. -->

## What happened
`apps/web/src/lib/i18n/__tests__/flows.test.ts` (T-0318 AC-7, **web-shell** lane) contains:

```ts
it.each(NUMBERS)("uf-%s.ts exports an empty `as const` object", (n) => {
  const source = readFileSync(resolve(FLOWS_DIR, `uf-${n}.ts`), "utf8");
  expect(source).toContain(`export const uf${n} = {} as const;`);
  expect(MODULES[`uf${n}` as keyof typeof MODULES]).toEqual({});
});
```

T-0307a's scope and "Paths you may change" both require the UF-10 feature to put its strings in
`apps/web/src/lib/i18n/flows/uf-10.ts` ("Adding keys only; the `export const uf10 = {…} as const`
shape stays"). AC-A21 makes a non-empty `flows/uf-10.ts` a **pass condition**. So the ticket's own
AC-A21 and this shell test cannot both be green.

Measured, not assumed. With `flows/uf-10.ts` set to `export const uf10 = { probe: "x" } as const;`:

```
 × uf-10.ts exports an empty `as const` object
AssertionError: expected 'export const uf10 = { probe: "x" } as…' to contain
                'export const uf10 = {} as const;'
      Tests  1 failed | 28 passed (29)
```

Exactly one of the 29 cases fails, and only for the flow whose file was filled. The other 28 —
including "flows/ holds exactly uf-01.ts … uf-11.ts", "en.ufNN is reference-equal to the
flows/uf-NN.ts export", "adds no other top-level ufNN key" and the whole "pre-existing catalogue
is unchanged" block — are unaffected and are the assertions that actually protect D-0071 §1.

## Why this is the test's defect, not the ticket's
D-0071 §1 is `status: decided` and says: "T-0318 creates `lib/i18n/flows/uf-01.ts` … `uf-11.ts`,
each an empty `as const` object … Each web-feature ticket owns exactly its own `flows/uf-NN.ts`".
The emptiness is T-0318's *initial* state, not an invariant. `flows/uf-10.ts`'s own header comment
says so: "Empty until then." The test pinned a transient state as a permanent one.

This is not specific to UF-10. All five Phase 3 feature lanes now running in parallel (T-0306a
UF-05, T-0307a UF-10, T-0307b UF-06, T-0308a, T-0308b) fill their own flow file, so each will hit
the same failure in the same test, in five separate worktrees, at merge time.

## Why I did not fix it myself
`apps/web/src/lib/i18n/**` is **web-shell**, explicitly listed in T-0307a's "Not yours". Weakening
or deleting a test to make a build pass is also against the squad ground rules. So T-0307a leaves
the case red and reports it.

## Proposed fix (web-shell, one test edit, no product change)
Keep the invariant, drop the pinning of emptiness. Replace the one failing case with the two
properties that actually matter and that survive a feature ticket filling its file:

```ts
it.each(NUMBERS)("uf-%s.ts exports `ufNN` as a const object", (n) => {
  const source = readFileSync(resolve(FLOWS_DIR, `uf-${n}.ts`), "utf8");
  // The shape stays `export const ufNN = {…} as const;` (D-0071 §1); the contents are the
  // owning feature ticket's. Emptiness was T-0318's initial state, not an invariant.
  expect(source).toMatch(new RegExp(`export const uf${n} = \\{[\\s\\S]*\\} as const;`));
  const mod = MODULES[`uf${n}` as keyof typeof MODULES];
  expect(typeof mod).toBe("object");
  expect(mod).not.toBeNull();
});
```

The reference-equality case, the directory-listing case, the no-extra-`ufNN`-key case and the
"pre-existing catalogue is unchanged" block all stay exactly as they are — those are what stop a
feature ticket from colliding in `en.ts`, which is the guarantee D-0071 §1 exists to give.

## Also worth deciding while this is open
T-0320 (infra) is being built to enforce lane boundaries mechanically. It should know that
`apps/web/src/lib/i18n/flows/uf-NN.ts` is the **feature** lane's, not web-shell's, even though
`apps/web/src/lib/**` is otherwise web-shell in `.squad/ownership.yaml`. Consider making that
carve-out explicit in `.squad/ownership.yaml` rather than leaving it only in each ticket's
"Listed extras".

## Resolution
**Upheld: the test is the defect. D-0075 (`decided`).** The diagnosis in this file is right, and
raising it instead of editing web-shell's test was correct.

D-0071 §1's "each an empty `as const` object" describes T-0318's **creation** state, not an
invariant. The same sentence grants each feature ticket its own flow file, and T-0307a's listed
extra says "Adding keys only; the shape stays" — a file no ticket may ever fill would make that
grant meaningless. The header comment "Empty **until then**" says so in the source itself.

**The one assertion that comes out** is `flows.test.ts:30-34`. **Everything else in AC-7 stays and
must keep biting:** the exactly-eleven-files directory listing, the `toBe` reference-equality of
`en.ufNN` to the module export (the assertion that actually stops a feature inlining strings into
`en.ts`), the no-extra-top-level-`ufNN`-key case, and the pre-existing catalogue pinned by value as
literals rather than a `.snap`.

**Two places where the fix is stricter than proposed above.** `typeof mod === "object"` plus
`not.toBeNull()` also passes for an array and for a `Map`, and `\{[\s\S]*\}` can span to an
unrelated brace later in the file. D-0075 §Consequences specifies an anchored object-literal source
regex plus `Object.getPrototypeOf(mod) === Object.prototype`, with three fault-plants (an array
export fails; dropping `as const` fails; a genuinely filled literal passes). D-0075 also states
what the replacement does *not* pin — it does not prove the file holds a single declaration — so
the implementing ticket does not overclaim.

**T-0320 needs no change and must not get one.** Its AC-6.2 already requires zero findings when a
UF-10 branch changes `flows/uf-10.ts`, and findings for `flows/uf-06.ts` and `en.ts`. T-0320 already
assumes a feature lane writes its own flow file; before this resolution it permitted exactly what
`flows.test.ts` forbade. The two now agree: a feature lane may fill its own flow file and nothing
else in `lib/i18n/`.

**Work:** T-0334 (web-shell), one file, no product change. Five lanes resume when it lands.
**The `ownership.yaml` carve-out asked for above:** accepted as a separate follow-up for the
orchestrator, not folded in — T-0320 deliberately reads the ticket's "Paths you may change" so the
grant and the enforcement cannot drift, and a second copy in `ownership.yaml` would reintroduce
that drift. Not required for T-0334. No contract change. No human gate.
