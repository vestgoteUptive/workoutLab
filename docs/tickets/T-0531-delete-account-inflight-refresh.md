# T-0531: account deletion must not race an in-flight cache refresh

- Lane: web-shell
- Depends on: T-0530
- Source: T-0530 code review (D-0195, D-0136 §5)

## Why
T-0530 added a cache-generation counter that sign-out bumps, so a refresh still in flight can't write the user's rows back after the clear. `wipe.ts` / `deleteAccountAndSignOut` have the same race but don't bump the counter. A refresh that resolves after the wipe can leave a deleted user's cached rows on the device.

## Acceptance criteria
- AC-1: `deleteAccountAndSignOut` (and `wipeLocalUserData`, if it's called separately) bumps the counter before the wipe and again after the server delete or `signOut` returns. Test: the refresh resolves after the wipe and writes nothing. A planted fault (no bump) fails it.
- AC-2: existing `lib/account` and `lib/offline` tests stay green, and the delete flow's behaviour is unchanged otherwise.

## Paths you may change
- `apps/web/src/lib/account/**`, `apps/web/src/lib/offline/**`

## Contract impact
None.

## Build / accept log
