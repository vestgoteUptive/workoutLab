# Non-functional requirements v1

- **Closes:** gap B7. **Decision:** D-0011 (revisit). **Co-owner:** security-reviewer (privacy details go in `docs/security/`).
- Every `NFR-*` has a number or a pass/fail check. The ticket that owns the named area adds the test.

## Offline
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-OFF-1 | After the first load, the app shell, the exercise library and the last 14 days of history are cached, so the app opens with no network. | Playwright: go offline, reload, UF-02.1 renders within 3 s. | T-0300 |
| NFR-OFF-2 | Once a session has started, UF-08.4 → UF-09.1–.9 → UF-03.3 work with no network, and every set is written to IndexedDB before the UI moves on. | e2e: offline mid-workout, log 10 sets, kill the tab, reopen: all 10 are there. | T-0300, T-0304 |
| NFR-OFF-3 | UF-08.1/.2 can build a suggestion offline with the on-device engine from cached history plus queued sets. | Offline: suggestion renders; output equals the online result for the same inputs. | T-0303 |
| NFR-OFF-4 | Queued sets are never dropped, not after an auth token expiry and not after 7 days offline. They flush automatically after sign-in or reconnect. | Unit: an expired token keeps the queue; after sign-in the queue is empty and the server has every row. | T-0300 |
| NFR-OFF-5 | The app calls `navigator.storage.persist()` after the first finished workout. | Unit (mock): called once. | T-0300 |
| NFR-OFF-6 | Offline state is visible but quiet: "Offline · last synced HH:MM" on UF-02.1, UF-06, UF-10 and UF-11. In focus mode (UF-09) it shows only as a small icon, never a banner (principle 1). | Component tests. | T-0300 |

## Sync conflicts
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-SYNC-1 | Sets are append-only. Each carries a client-generated UUID (`client_id`), and the server ignores duplicates (unique `user_id, client_id`). | pgTAP: inserting the same `client_id` twice gives 1 row. | T-0100 |
| NFR-SYNC-2 | Editing a set means a new version keyed by the same `client_id`, and the newest `completed_at` wins. Deleting is a soft delete. | Unit + pgTAP. | T-0100, T-0300 |
| NFR-SYNC-3 | All other rows (profile, targets, routines, check-ins) use server-wins with last write by server timestamp. The client refetches after it flushes. | Two-device test: the later server write wins, the other client shows it after refetch. | T-0300 |
| NFR-SYNC-4 | A session started offline on two devices produces two sessions and no merge. | e2e. | T-0304 |

## Performance
Reference device: a mid-range Android (Moto G Power class), Chrome, "Fast 4G" throttling in Lighthouse.
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-PERF-1 | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on UF-02.1. | Lighthouse CI budget. | T-0300, T-0402 |
| NFR-PERF-2 | Initial JS ≤ 200 KB gzip. Each route chunk ≤ 100 KB gzip. | Bundle-size check in CI. | T-0300 |
| NFR-PERF-3 | `suggest()` ≤ 50 ms and `balance()` ≤ 20 ms for 400 sets of history on Node 22 in CI (a proxy for the device). | Vitest bench with a threshold. | T-0201, T-0200 |
| NFR-PERF-4 | "Done set" (UF-09.3) shows visual feedback within 100 ms, even offline. | Component test with fake timers plus a Playwright trace. | T-0304 |
| NFR-PERF-5 | The landing page scores ≥ 95 on Lighthouse Performance. | Lighthouse CI. | T-0309 |

## Accessibility
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-A11Y-1 | WCAG 2.2 AA on every screen. | axe-core in Playwright: 0 serious or critical violations per route. | each web ticket |
| NFR-A11Y-2 | Touch targets ≥ 44×44 CSS px. UF-09.3 "Done set" ≥ 200 px tall. | Component tests on the size. | each web ticket |
| NFR-A11Y-3 | Coverage never relies on colour alone: every area on C-01/UF-10 has a text or numeric label (D-0003). | Component test. | T-0300, T-0307 |
| NFR-A11Y-4 | Timers announce through `aria-live="polite"` at 10 s and at 0 ("GO") on UF-09.5, and at 0 on UF-09.7. | Component test. | T-0304 |
| NFR-A11Y-5 | `prefers-reduced-motion` turns off ring animations and swaps motion for opacity changes. | Component test. | T-0304 |
| NFR-A11Y-6 | Every flow can be completed with a keyboard only and with VoiceOver/TalkBack labels. | Playwright keyboard run of UF-01 and UF-09. | T-0301, T-0304 |

## i18n
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-I18N-1 | English only in v1, with every user-facing string in one catalogue (`apps/web/src/lib/i18n`). | Lint: no string literals in JSX outside the catalogue (allowlist for symbols). | T-0300 |
| NFR-I18N-2 | Dates, times and numbers are formatted with `Intl`, using the device locale and timezone. The window and periods use local days (D-0012, D-0013). | Unit tests with `Europe/Stockholm` and `America/New_York`. | T-0300 |
| NFR-I18N-3 | Weights are in kg only in v1, stored as `weight_kg`. | — (lb display is a Phase 5 idea). | — |

## Analytics
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-AN-1 | No third-party analytics, trackers or ad SDKs. No requests to domains other than our own and Supabase. | A CSP `connect-src` allowlist, plus an e2e check that every network request goes to an allowed host. | T-0300, T-0403 |
| NFR-AN-2 | PRD success metrics are computed with SQL on our own tables (`sessions`, `session_sets`, `profiles`, `plan_checkins`). The only extra event is `onboarding_timing` (UF-01.1 first render → UF-01.4 plan render, in ms, no PII), stored on `profiles`. | pgTAP: the metric queries run against seed data. | T-0100 |

## Privacy / GDPR
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-PRIV-1 | Data is hosted in an EU region (default Supabase `eu-north-1` Stockholm, else `eu-central-1`). | Terraform plan asserts the region. | T-0400 |
| NFR-PRIV-2 | Data minimisation: we collect email, training data and plan settings only. No DOB, sex, body weight, heart rate or location coordinates (`sessions.location` is a label such as "gym" or "home"). | Schema review in T-0100, plus a security review. | T-0100 |
| NFR-PRIV-3 | RLS: a user can read and write only their own rows. `exercises` and `areas` are read-only for everyone. | pgTAP: user A can't select, update or delete user B's rows. | T-0100 |
| NFR-PRIV-4 | Export in-app: one JSON file with every row the user owns, delivered within 10 s for 2 years of data. | Edge function or client test with a seed of 5,000 sets. | T-0307 or follow-up |
| NFR-PRIV-5 | Account deletion in-app: after confirmation, the auth user and all owned rows are deleted immediately (cascade), and local caches and the queue are cleared. | pgTAP cascade test + e2e. | follow-up (web-shell) |
| NFR-PRIV-6 | A privacy notice linked from UF-01.5 and the landing page covers what we store, why, where, and how to export or delete it. | Content review before H-06. | T-0309, T-0403 |
| NFR-PRIV-7 | No credentials or PII appear in logs. Edge Functions log request IDs, not emails. | Security review. | T-0203 |

## Timers (focus mode)
| ID | Requirement | Check | Owner ticket |
|---|---|---|---|
| NFR-TIME-1 | Every timer (UF-09.1, .2, .4, .5, .6, .7) is computed from wall-clock start timestamps, not by counting ticks. After a 90 s background or screen lock, a 120 s rest shows 30 s left, ±1 s. | Unit with fake timers and a mocked `Date.now`. | T-0304 |
| NFR-TIME-2 | The elapsed time and the projected finish (UF-09.8) come from the session's `started_at` and the engine's remaining estimate, and survive a reload. | Unit + e2e reload. | T-0304 |
| NFR-TIME-3 | A screen wake lock is held during UF-09 when "keep screen awake" is on (UF-08.4), and re-acquired after `visibilitychange`. | Unit (mock API). | T-0304 |
| NFR-TIME-4 | When the budget runs out mid-exercise, the current exercise is never interrupted. UF-09.8 appears only between exercises (v2 spec), and the over-time cuts follow engine rule 8. | Engine and component tests. | T-0201, T-0304 |
