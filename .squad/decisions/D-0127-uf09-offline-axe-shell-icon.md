---
id: D-0127
title: "UF-09 offline axe scans (T-0304b AC-12) drop exactly one known shell finding: the OfflineStatus icon's aria-label on a role-less span; web-shell fixes it"
status: superseded
date: 2026-10-02
by: frontend-dev (T-0304b)
area: web
builds-on: D-0086, D-0091 §1
---
## Context
T-0304b AC-12 runs axe on UF-09.3 and UF-09.4 with the browser context offline and expects 0
serious or critical violations. Offline, the UF-09 chrome renders the shell's
`<OfflineStatus variant="icon" />` (`apps/web/src/components/offline-status/`, lane `web-shell`,
NFR-OFF-6). Its icon is `<span aria-label="Offline" class="wl-offline-status__icon">` with no
role, which axe reports as `aria-prohibited-attr` (serious). Every other T-0304a/e axe row runs
online, where the icon isn't rendered, so this first shows up here.

The fix is one attribute in a web-shell component (`role="img"`). `components/**` is out of
T-0304b's scope, and the finding is not in either UF-09 view.

## Decision
- The AC-12 axe helper in `tests/e2e/uf-09-focus.spec.ts` drops a violation only if its rule is
  `aria-prohibited-attr` **and** every node it reports is `.wl-offline-status__icon`. Everything
  else, including that rule on any other node, still fails the row.
- A web-shell follow-up gives the icon a valid role (for example `role="img"`, keeping
  `aria-label="Offline"`) and adds an offline axe check to its own tests.

## Consequences
- AC-12 stays a real check of UF-09.3 and UF-09.4: their own markup must be axe-clean.
- The filter stays in the spec until the follow-up lands.

## Revisit when
- The web-shell follow-up merges. Then remove `isKnownShellIcon` from the spec (the scan becomes
  unfiltered), and this decision becomes `superseded`.

## Superseded
T-0407 gave the icon `role="img"`; the T-0304b AC-12 scans are unfiltered.
