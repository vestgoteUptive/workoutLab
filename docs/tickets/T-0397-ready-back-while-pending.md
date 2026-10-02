---
id: T-0397
title: "UF-08.4: Back is disabled while Start's upsertSession is pending (no orphan session, no second Start); test the unmount-while-pending branch"
lane: web-feature:UF-08
screens: [UF-08.4, UF-08.2]
decisions: [D-0065, D-0110, D-0123]
deps: [T-0303d]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ⅙ day. Follow-up from the T-0303d review. It stays todo until T-0303d is done (now in QA and review). It becomes ready as written, unless the accepted T-0303d Ready.tsx differs from the branch read here (worktree T-0303d). -->

## Why
In T-0303d's `features/UF-08/Ready.tsx`, Start calls `upsertSession(row)` and navigates to `/session/<id>` only once the write resolves (NFR-OFF-2). While that write is pending, the Back `<Link>` to `?step=suggested` still works. Tapping it does two bad things:
- It unmounts Ready, so the `mounted` guard skips the navigate. The written `sessions` row is left as an orphan pending session that nobody opens.
- The next visit to Ready gets a new id (D-0110 §3), so the next Start makes a second session.

The fix is the review's first option: Back is inert while Start is pending, matching Start's own `aria-disabled` (T-0303d AC-4). The other option, navigating to `?step=suggested` once the write lands, still leaves the orphan, so it is rejected. A system or browser Back during the pending write can't be blocked here. That case keeps today's behaviour (no navigate, no state update after unmount), and AC-3 pins it with a test. Principle 1 is unaffected, and so is the write-first order.

## Scope
- In:
  - `features/UF-08/Ready.tsx`: while `pending` is true, the Back link has `aria-disabled="true"` and its click handler calls `preventDefault()`, so it doesn't navigate. When nothing is pending, it has no `aria-disabled`, and it navigates as in T-0303d AC-8.
  - The link stays a link (no `href` removal), so focus order and the ≥ 44 × 44 px target don't change.
  - A disabled style via the existing `wl-uf08` CSS, using design tokens only.
  - New tests in `features/UF-08/__tests__/` (for example `ready-back-pending.test.tsx`).
- Out:
  - `lib/offline/**`: no delete or cancel of a written row.
  - The browser or system Back during a pending write (UF-09 Back is T-0394).
  - Changing the D-0110 §3 id-per-visit rule.
  - `routes.ts`, `en.ts`, `components/**` and the shell tests.

## Acceptance criteria
Test setup as in T-0303d:
- Vitest + Testing Library, using the `__tests__/harness.tsx` and fixtures.
- W-R7E4 at F-tz, `clock` injected.
- `upsertSession` is a spy held on a deferred promise.
- Negative asserts wait a real 50 ms macrotask.

Each test title starts with `T-0397 AC-n`.
- AC-1 (Back is inert while pending, red on unfixed code) **Given** UF-08.4 with `upsertSession` pending after one Start tap, **When** the user clicks Back, **Then**:
  - after 50 ms the location is still `/session/setup?step=ready`, and `[data-screen-id="UF-08.4"]` is still rendered;
  - Back has `aria-disabled="true"`;
  - on resolve, the location becomes `/session/<id>` by REPLACE, with the `id` of the single `upsertSession` call;
  - `upsertSession` was called exactly once.
  - Pressing Enter on the focused Back link while pending gives the same result.
  - On main plus T-0303d, the click navigates to `?step=suggested`, so this AC is red. Record that in the build log.
- AC-2 (the pair: Back works when nothing is pending)
  - **Before any Start:** Back has no `aria-disabled` attribute and goes to `?step=suggested`. The T-0303d AC-8 test passes unedited.
  - **After a rejected write:** `upsertSession` rejects and "Couldn't start the workout. Try again." shows. Back then has no `aria-disabled` and navigates to `?step=suggested`.
- AC-3 (unmount while pending) **Given** Start pending, **When** Ready unmounts (the test unmounts the tree, or navigates the router to `?step=suggested` from outside the component), and then `upsertSession` resolves, **Then**:
  - after 50 ms the location is not `/session/<id>`;
  - no `console.error` was logged (spy);
  - there was no unhandled rejection.
  - The same holds when the write rejects after unmount: no alert is rendered and no error is logged.
  - **Red proof by planted fault:** remove the `if (!mounted.current) return` guard. The resolve case must turn red. Record that in the build log.
- AC-4 (a11y) The e2e a11y row from T-0303d AC-10 still passes: axe shows 0 serious or critical violations on UF-08.4, and Back is ≥ 44 × 44 px. There are no new strings, and `react/jsx-no-literals` is green.
- AC-5 (no regression) Every existing `features/UF-08/__tests__/*` test and `tests/e2e/uf-08-setup.spec.ts` passes unedited.

## Paths you may change
- `apps/web/src/features/UF-08/**` (the lane: `web-feature:UF-08`).
- **Listed extras:**
  - `docs/tickets/T-0397-ready-back-while-pending.md`: this file, for the accept log.

## Contract impact
none

## Coordination
- Files: `apps/web/src/features/UF-08/Ready.tsx`, `apps/web/src/features/UF-08/uf-08.css` and the new test file.
- Same lane as T-0386 and T-0391 (UF-08), so they run one after another. It is disjoint by files from T-0394 (UF-09) and T-0385 (`lib/offline`).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green · `format:check` and `check:repo` green · contracts unchanged · commit messages start with `T-0397` and cite UF-08.4 (e.g. `T-0397 UF-08.4: Back is inert while Start is pending`).

## Build / accept log
