---
id: D-0101
title: "One feature file may import `lib/profile`: the lazy `/welcome/save` module, with `useRecheckProfile` only; T-0301a's import-ban source tests get an exact one-entry allow-list"
status: revisit
date: 2026-10-01
by: product-owner (groom T-0301c)
area: web
builds-on: D-0064 §8–§9, D-0073 (Consequences), D-0100
---
## Context
D-0073 (Consequences) says "T-0301c calls `useRecheckProfile()` after its writes land", and
`lib/profile/index.ts` names T-0301c's `/welcome/save` as one of its two consumers. T-0301a's
AC-12 and AC-10, as built, ban that call:
- `apps/web/src/app/__tests__/profile-gate.source.test.ts` "no file under features/ imports
  lib/profile". Its regex matches `import type` too.
- The same file's "nor through a dynamic import()".
- The same file's "features/UF-01 does not import lib/profile or lib/offline".

Without the recheck, the gate keeps its `missing` answer after the save. Navigating to `/` then
bounces straight back to `/welcome/save`: T-0301a's AC-11 contrast test proves this. The other ways
round it are each worse:
- a full reload (`location.assign("/")`), which D-0064 §8 and T-0301a AC-4 rule out ("without a
  reload");
- a window event that `lib/profile` listens for, which is a hidden channel, a new web-shell API and
  a second way to reach the gate;
- the shell passing the recheck as a prop, which needs a `routes.ts`/`App.tsx` change for one route.

The bans exist for two reasons:
- **AC-12:** no feature re-implements or bypasses the gate.
- **AC-10:** a signed-out first render can't pull the Dexie chunk.

One lazy module calling `useRecheckProfile` threatens neither. It reads no status, renders no
`ProfileGate`, and `lib/profile` already sits in the entry chunk through `app/App.tsx`. The rule
"`lib/profile` reaches `lib/offline` only through a dynamic `import()`" is unchanged.

## Decision
1. **The one exception.** `apps/web/src/features/UF-01/SaveScreen.tsx` may contain exactly one
   import from `lib/profile`: `import { useRecheckProfile } from "../../lib/profile/index.js";`.
   - The only named binding is `useRecheckProfile`. No other named binding, no namespace import, no
     type import and no dynamic `import()` of `lib/profile`.
   - No other file under `apps/web/src/features/**` may import `lib/profile`.
   - The `lib/offline` ban for `features/UF-01/**` stays total.
2. **`SaveScreen.tsx` is lazy.** `WelcomeRoutes.tsx` reaches it only through
   `lazy(() => import("./SaveScreen.js"))`, as it does UF-01.2–.4. It takes `pending-plan.ts` through
   the type-only `store` prop (the AC-A6 manifest reason in `WelcomeRoutes.tsx`). The static graphs
   of `index.tsx` and `WelcomeRoutes.tsx` still reach no `lib/profile` (T-0301b's `source.test.ts`).
3. **The source tests follow, narrowly.** In `profile-gate.source.test.ts`, T-0301c replaces the
   two blanket feature bans with an exact allow-list:
   `{"features/UF-01/SaveScreen.tsx": ["useRecheckProfile"]}`.
   - Every other feature file must still have zero `lib/profile` specifiers, static or dynamic.
   - The allow-listed file's `lib/profile` imports must be exactly that one named binding, so a
     second symbol, a namespace import or a `ProfileGate` mention fails.
   - A contrast case proves the check fires: a synthetic source string that imports
     `useProfileStatus` from the allow-listed path fails it.
   - The "no file outside app/ and lib/ renders ProfileGate" test is unchanged.
   - This narrows a ban that a decision names. It doesn't weaken it: every file the bans covered
     before is still covered, except one call that D-0073 itself planned.
4. **What the call does.** `SaveScreen` awaits the recheck after both writes land and before it
   navigates to `/`. It also does so when the existing profile wins (D-0100 §3.1). It never reads
   the gate's status.

## Consequences
- T-0301c lists `apps/web/src/app/__tests__/profile-gate.source.test.ts` as a listed extra, limited to
  §3.
- T-0333 and T-0328 (the gate seam) should keep `useRecheckProfile()`'s contract, "resolves once the
  new status has committed", or update `SaveScreen` in the same ticket.
- `lib/profile/index.ts`'s header comment already names this consumer, and stays as it is.

## Revisit when
- A second feature wants anything from `lib/profile`. Then move the recheck behind a documented
  shell seam (for example an `onProfileSaved` callback on the route) instead of growing the list.
- T-0328 replaces `resolved` with a fourth status or a Suspense boundary.
