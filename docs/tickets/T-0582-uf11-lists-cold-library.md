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
- Build: root cause = both bodies read library/profile once at mount (Promise.all in useEffect). Now `use-library-profile.ts` wraps `useLive` (liveQuery), so a late-filled cache re-renders. AC-2 line `libraryOffline` (one new string per screen). Tests: `cold-library.test.tsx` (library lands via Dexie write in act). Planted faults: one-shot read -> 4 red; offline line removed -> 2 red (AC-2). T-0662 tap-time reads untouched.
