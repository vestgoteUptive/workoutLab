---
id: T-0395
title: "UF-02.1 Resume workout: a UF-09 ResumeCard on Today for the newest unfinished, non-stale session on this device, mounted via features/UF-02/slots.tsx"
lane: web-feature:UF-09
screens: [UF-02.1, UF-09, UF-09.9]
decisions: [D-0139, D-0123, D-0111, D-0071, D-0106]
deps: [T-0304e, T-0302a]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-web. About ½ day. The product half is done in this groom: D-0139 picks Today only, and user flows v2 gained the "UF-02 Today" section. What is left is a build ticket, so the board row moves from lane product / wl-idea to lane web-feature:UF-09 / wl-build-web. Deps are done. It shares the UF-09 lane with T-0304c (doing) and T-0414, and `features/UF-02/slots.tsx` + `Today.tsx` with T-0308c, so the orchestrator runs it when those paths are free. -->

## Why
A PWA reopens at its start URL, `/` (UF-02.1 Today). The D-0111 §7 restore runs only when `/session/<id>` is opened. So after the app is killed mid-workout, the phone restarts, or the user presses Back on UF-09.9 (D-0123 §3), there is no way back into the workout, and starting again makes a second unfinished session (D-0123 §4). D-0139 adds one "Workout in progress" card on Today that links back to it.

## Scope
- In:
  - `apps/web/src/features/UF-09/resume.ts` (new): `findResumable(now: Date, storage?: FocusStorage | null): Promise<Resumable | null>`, where `Resumable = { sessionId, startedAt, done, total }`, per D-0139 §2:
    - `offlineDb().sessions` rows with `userId === currentUserId()`, `row.ended_at` null, `now − started_at ≤ STALE_AFTER_MS`, `parseSessionPlan(row.plan)` ok and non-null, and `storage.getItem(focusKey(id))` non-null;
    - newest `started_at` wins, a tie goes to the smaller `id`;
    - `done` = `loggedSets.length` of the stored JSON (0 when it doesn't parse or has no array), `total` = the sum of `setsInItem(item)` over the plan;
    - any thrown or rejected IndexedDB or storage call resolves `null`.
  - `apps/web/src/features/UF-09/resume-card.tsx` (new): `ResumeCard({ now?, locale?, timeZone? })`. Renders nothing until `findResumable` resolves, and nothing for `null`. Otherwise a `section` with `data-part="resume"`, an `h2` `en.uf09.resumeTitle`, a `p` `en.uf09.resumeLine(time, done, total)` and a `Link` to `/session/<id>` with `en.uf09.resumeAction` (a PUSH). `time` is `started_at` as `HH:MM` in `locale`/`timeZone` (`formatTime` from `lib/format/intl.ts`, as `host.tsx` imports it). Styling uses tokens only (`packages/design-tokens`).
  - `features/UF-09/index.tsx`: export `ResumeCard`. The export pin in `__tests__/exports-and-lint.test.ts` becomes `["ResumeCard", "SessionHost", "useFocusSession"]`.
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: `resumeTitle` = "Workout in progress", `resumeLine` = `` (time, done, total) => `Started ${time} · ${done} of ${total} sets` ``, `resumeAction` = "Resume workout".
  - `features/UF-02/slots.tsx`: `todayResumeSlot: ComponentType<{ now?: Date; locale?: string; timeZone?: string }> | null`, set to `lazy(() => import("../UF-09/index.js").then((m) => ({ default: m.ResumeCard })))`.
  - `features/UF-02/Today.tsx`: renders the slot inside `Suspense` with a `null` fallback, after the header and before the compact C-01 (or before the no-plan line). It shows in all three Today states: `loading`, `ready` and `no-plan`. It passes Today's `now`, `locale` and `timeZone`. "Start workout" is unchanged.
  - Tests: `features/UF-09/__tests__/resume.test.ts(x)` (fake-indexeddb + the real `upsertSession`, a signed-in user stubbed as T-0304a does, a storage stub), a Today test in `features/UF-02/__tests__/`, and an e2e row.
- Out:
  - UF-08.1 (D-0139 §1). A guard against a second session (D-0123 §4).
  - The stale state, the restore and the host (D-0111 §7 unchanged). "Resume anyway" for stale sessions.
  - Any change to what Start does.

### Edge cases that are in scope
- **Offline:** IndexedDB and `localStorage` only; the same card offline (AC5).
- **Returning after 10 days off:** a 10-day-old unfinished session is stale, so Today shows no card (AC2).
- **Zero history:** a first workout started and abandoned still shows (the card doesn't read the history).
- **Several unfinished sessions** (D-0123 §4): one card, the newest (AC3).
- **Another user signed in on the same device:** their rows never show (AC2).
- **Time running out:** not applicable; the card shows no budget.

## Acceptance criteria
Each new test title starts with `T-0395 ACn`. `now` = `2026-10-02T10:00:00Z`, `timeZone` "UTC", `locale` "en-GB". The plan is UF-09's P1 fixture (4 + 3 + 3 + 2 = 12 sets). "Seeded" = written with `upsertSession` for user `u1` (signed in) and a `wl-focus:<id>` value from `initialFocusState` with the given `loggedSets`.
- **AC1 (the card, red on unfixed code)** **Given** a seeded session `s1`, `started_at` 09:30, `ended_at` null, 3 logged sets, **When** `ResumeCard` renders, **Then** it shows "Workout in progress", "Started 09:30 · 3 of 12 sets", and one link "Resume workout" with `href` `/session/s1`. On main, `features/UF-09/index.tsx` has no `ResumeCard` and Today shows no `[data-part="resume"]`.
- **AC2 (when it shows, both values of each condition)** `findResumable(now)` is `null`, and the card renders nothing, for each of: `ended_at` set; `started_at` 12 h + 1 ms before `now`; `started_at` 10 days before; `userId` "u2"; no `wl-focus:s1` key; plan `null`; a plan that fails `parseSessionPlan`. With `started_at` exactly 12 h before `now`, it is `s1`.
- **AC3 (the newest wins)** **Given** seeded sessions `s1` (09:00) and `s2` (09:30), **Then** the card links to `/session/s2`. With both at 09:30, it links to `/session/s1`.
- **AC4 (the sets count)** A `wl-focus:s1` value that is not JSON, or has no `loggedSets` array, gives "0 of 12 sets". A plan with a back-off on item 0 gives `total` 13.
- **AC5 (offline and failure)** With `navigator.onLine` false and a `fetch` spy, the card is the same as AC1 and `fetch` is never called. When `offlineDb().sessions` rejects, or `storage.getItem` throws, the card renders nothing and there is no unhandled rejection and no `console.error`.
- **AC6 (Today mounts it)** **Given** Today with a resumable session, **Then** `[data-part="resume"]` comes after the header and before the compact C-01 in DOM order, and the "Start workout" link is still there. In the `no-plan` state the card still shows. With no resumable session, Today's DOM equals today's (the existing UF-02 tests pass unedited).
- **AC7 (Resume reopens the workout)** In a `MemoryRouter` at `/` with the `/session/:id` route, a click on "Resume workout" shows the UF-09 host for `s1`, restored from `wl-focus:s1` (the same phase, item and set). Back returns to `/`.
- **AC8 (export pin)** `features/UF-09/index.tsx` exports exactly `ResumeCard`, `SessionHost`, `useFocusSession`.
- **AC9 (e2e, the cold start)** In `tests/e2e/uf-02-today.spec.ts`: start a workout from UF-08.4, Done set once (UF-09.3 → UF-09.4 → saved), then `page.goto("/")`. Today shows "Workout in progress" with "1 of N sets". "Resume workout" lands on `/session/<id>` on the step it was left on. axe has no violations on Today with the card.
- **AC10 (no regression)** Every existing `features/UF-02/__tests__/*` and `features/UF-09/__tests__/*` test passes unedited, except the export-pin line (AC8).
- **Red proof:** run AC1 and AC6 against main. Both fail. Record this in the build log.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras:**
  - `apps/web/src/features/UF-02/slots.tsx`: the `todayResumeSlot` entry.
  - `apps/web/src/features/UF-02/Today.tsx`: mount the slot.
  - `apps/web/src/features/UF-02/__tests__/**`: the AC6 test.
  - `apps/web/src/lib/i18n/flows/uf-09.ts`: the three strings.
  - `tests/e2e/uf-02-today.spec.ts`: the AC9 row.
  - `docs/tickets/T-0395-resume-workout-on-today.md`: this file, for the build and accept log.

## Contract impact
none. It reads the existing IndexedDB `sessions` table and the D-0111 §6 `wl-focus:<id>` key. No schema, API, engine or token change.

## Coordination
- Product half done in the groom: D-0139, and the "UF-02 Today" section in `Design-docs/docs/product/user-flows.md`.
- Board (orchestrator): move T-0395 to lane `web-feature:UF-09`, flow `wl-build-web`, status `ready`.
- UF-09 lane: T-0304c (doing) and T-0414 change `machine.ts`. This ticket adds new files plus `index.tsx` and the export-pin test, so it can merge in any order with them, but the lane runs one at a time.
- T-0308c (UF-11, todo) also edits `features/UF-02/slots.tsx` and `Today.tsx`. Run them one after the other. Whichever lands second rebases its slot next to the other's.
- T-0394 (Back → Pause) is unaffected: Resume is a PUSH to `/session/<id>`, and the guard arms there as on any load.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · e2e green · contracts unchanged · commit messages start with `T-0395` and cite the screen (e.g. `T-0395 UF-02.1: Resume workout card for an unfinished session`).

## Build / accept log
