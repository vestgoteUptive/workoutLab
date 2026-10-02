---
id: D-0123
title: Back after Start (TR-0038) — keep the single REPLACE and the setup PUSHes, Back from focus mode may land on UF-08.1 but never on UF-08.4; UF-09 turns a Back in a running machine state into Pause (UF-09.9); a second unfinished session is accepted in v1
status: revisit
date: 2026-10-02
by: triage (TR-0038)
area: product
builds-on: D-0107 §1, D-0110 §3 §4, D-0111 §3 §6 §7, D-0066 §12, NFR-SYNC-4
amends: D-0110 §4 (its consequence sentence only)
---
## Context
TR-0038. The UF-08 setup steps are PUSHes inside one route (D-0107 §1, pinned by T-0303a and T-0303b AC-8), so at Start the history is `[…, /session/setup, ?step=suggested, ?step=ready]`. D-0110 §4 replaces only the last entry with `/session/<id>`. Back from focus mode therefore goes to `?step=suggested`, and the host, which has no setup state left, replaces it with `/session/setup` (UF-08.1). D-0110 §4's sentence "Back from focus mode then goes to the entry before setup (normally `/`)" doesn't follow from its own mechanism, and T-0303d AC-10's row "Back doesn't land on any `/session/setup` URL" can't pass.

The orchestrator also asked about a worse effect: a user who presses Back mid-workout (the browser button, or the Android system Back, which exists even in a standalone PWA with no browser chrome) leaves focus mode with no confirmation, lands on setup, and can tap Start again. That creates a second session while the first is unfinished. Principle 1 says everything other than the current step lives behind Pause (UF-09.9). Nothing in D-0066, D-0110 or D-0111 handles Back during focus mode. D-0110's "Revisit when" already names "a confirm on leaving focus mode instead of the replace".

Options weighed:
1. Amend AC-10 to match the mechanism. No code change, but Back mid-workout still leaves focus mode silently.
2. Unwind the setup entries on Start (`history.go(-n)` then replace). The app uses a declarative `BrowserRouter` (`apps/web/src/app/App.tsx`), so this needs `history.state.idx`, which MemoryRouter tests don't have. Each Start flashes UF-08.1 during the POP, and AC-4/AC-5's "navigates once, a REPLACE" pins would change. It still doesn't stop the problem: Back would land on Today, where "Start workout" is one tap away, so the second-session path is the same.
3. Make the setup steps REPLACEs. This reverses D-0107 §1 and the T-0303a/T-0303b pins, and breaks Back inside setup. It also doesn't stop the problem.

The real fix is not where Back lands. It is that Back should not leave a running workout without a decision. That belongs to UF-09, the screen the user is on.

## Decision
1. **UF-08 is unchanged.** D-0107 §1 (PUSH between setup steps) and D-0110 §4 (one `navigate("/session/<id>", {replace: true})` after the write) stand. T-0303d AC-4 and AC-5 are unchanged.
2. **What D-0110 §4 guarantees, restated.** Back from focus mode never lands on `?step=ready` or UF-08.4, so no Start button for the session just started is ever under the workout. It may land on UF-08.1 (via `?step=suggested`, which the host replaces with `/session/setup`). UF-08.1 shows no stale state from the started session. This replaces D-0110 §4's "goes to the entry before setup (normally `/`)" sentence. T-0303d AC-10's Back row encodes this.
3. **Back in focus mode means Pause (UF-09.9), owned by UF-09 (T-0394).**
   - While the host shows a machine state other than `paused` (UF-09.1–UF-09.8), a Back (browser button, Android system Back, `history.back()`) shows UF-09.9, exactly as "Pause workout" would (the `PAUSE` event, same `atMs` rules). The URL stays `/session/<id>`.
   - Mechanism: a declarative-router-friendly guard inside `features/UF-09/**`. When a machine state first renders, the host pushes one guard entry with the same URL (`history.pushState({...history.state, wlFocusGuard: true}, "", location.href)`). On `popstate` that lands on `/session/<id>` without the guard flag, while a non-paused machine state is shown, it dispatches `PAUSE` and pushes the guard again. No `useBlocker` (it needs a data router; `App.tsx` is out of the UF-09 lane).
   - **Back while paused leaves.** On UF-09.9 the guard is not re-armed, so a Back there (a second, deliberate Back) navigates normally to whatever entry is below. The focus state is already persisted (D-0111 §6), so nothing is lost, and the user is never trapped.
   - **A seam overlay open** (swap, how-to, list view): Back closes the overlay back to UF-09.9 and re-arms the guard once. This keeps "Back closes the top layer", the Android convention.
   - **Host-level states** (loading, not on this device, ended, stale, `done`) don't arm the guard. Back behaves normally there.
   - **Leaving by the app's own navigation** (End workout → `/session/<id>/summary`, the not-on-device link to `/`) uses `replace` for that navigation when the guard entry is on top, so the guard entry doesn't linger in history. Back from the summary may land on `/session/<id>`, which then shows "This workout has ended" (D-0111 §7). That is accepted.
   - Chromium may skip a history entry on Back when the page got no user activation after the entry was made ("history manipulation intervention"). After Start the guard is pushed within the Start tap's activation, and a workout is tapped through (Done set, Save), so in practice the guard holds. A Back on a cold restore before any tap may skip it and leave focus mode. That is accepted (the focus state is persisted, D-0111 §6), and nothing re-arms on a timer.
4. **A second unfinished session is accepted in v1.** If a user does leave (Back on UF-09.9, closing the app, a killed tab) and taps Start again, a new session starts. NFR-SYNC-4 already allows many sessions, no logged set is lost (sets belong to the session they were logged in), the first session stays `ended_at` null and becomes "stale" after 12 h (D-0111 §7). No guard is added to UF-08.1 now.
5. **Resume entry is a product follow-up, not part of this resolution.** A PWA reopens at its start URL, so the D-0111 §7 restore is reached today only by reopening `/session/<id>`. A "Resume workout" entry on Today (UF-02.1) and/or UF-08.1 for an unfinished, non-stale session on this device needs a user-flows v2 addition. Product-owner grooms it (no ticket id assigned here).

## Consequences
- T-0303d: AC-10's Back row is amended (no code change in UF-08). The `test.fail(true, "TR-0038: …")` row is replaced by the amended row, written so it also passes once T-0394 lands.
- T-0394 (new, `web-feature:UF-09`, after T-0304d): the Back → Pause guard, with unit tests over a real `BrowserRouter` + `window.history` (jsdom) and e2e rows in `tests/e2e/uf-09-focus.spec.ts`. It also tightens the T-0303d Back row in `tests/e2e/uf-08-setup.spec.ts` to "Back shows UF-09.9 and the URL stays `/session/<id>`" (listed extra in T-0394).
- D-0110 gets an amendment banner pointing here. D-0110 §4's mechanism is unchanged.

## Revisit when
- Users report getting stuck in focus mode, or browsers stop honouring the guard entry. Then replace the guard with a confirm ("Leave the workout?") or drop it.
- The app moves to a data router (`createBrowserRouter`). Then use `useBlocker` instead of the pushState guard.
- Real use shows second unfinished sessions are common. Then build the resume entry (§5) and/or an in-progress guard on UF-08.1.
