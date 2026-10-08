---
id: T-0582
title: "UF-11.5 and UF-11.6 re-read when the library cache arrives (a cold direct load shows no groups)"
lane: web-feature:UF-11
screens: [UF-11.5, UF-11.6]
decisions: [D-0199, D-0202]
deps: []
status: todo
---

## Why
T-0569 build finding. UF-11.5 (Excluded) and UF-11.6 (Favorites) read the library and profile once at mount. Opened cold, e.g. by deep link or first load before the library cache is warm, they show no names or groups until a reload.

## Acceptance criteria
- AC-1: on a cold load, both screens render the names and groups once the library cache fills, without a reload. Subscribe to the cache, or re-read on refreshAll completion.
- AC-2: on a cold load with no network and no cache, they show a neutral "Exercises aren't available offline yet" line instead of an empty list.
- AC-3: tests per screen, each proven by a planted fault.

## Paths you may change
- `apps/web/src/features/UF-11/**`, `apps/web/src/lib/i18n/flows/uf-11.ts`

## Contract impact
None.

## Build / accept log
