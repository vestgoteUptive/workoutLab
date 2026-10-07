---
id: T-0509
title: "auth-patch.mjs hardening: write a filtered full snapshot of the live auth config before --apply's PATCH (and after), refuse to PATCH if it can't be written, and retry the post-apply read-back with backoff until the changed keys settle (T-0404b follow-up, D-0185 §4)"
lane: infra
screens: []
decisions: [D-0185, D-0186, D-0190]
deps: [T-0404b, T-0508]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §5). Build flow:
wl-build-infra. About ¼ day. Waits for T-0508 (lint fixes may touch auth-patch.mjs). T-0515's
human --apply should run on this hardened version. -->

## Why
`infra/scripts/auth-patch.mjs` is the only way prod auth settings change (D-0185 §4). Its
`--apply` path does one GET, the PATCH, then one GET to check the result. Two gaps showed up in
T-0404b:
1. **Stale read-back.** Supabase's config API is eventually consistent. T-0404b's first read-back
   showed the old values, so the script reported a mismatch for a PATCH that had in fact landed.
2. **No snapshot.** When `others_sha256` moves, the script names the moved keys but keeps nothing
   to diff them against. Only the hash of "everything else" is printed, by design, so nothing
   leaks to the terminal. The human can't see what changed, or roll it back.

## Scope
- **In** (`infra/scripts/auth-patch.mjs`, `.github/scripts/auth-patch.test.mjs`, `.gitignore`):
  - **Snapshot.** With `--apply`, before the PATCH, write
    `infra/auth/.snapshots/<ref>-<UTC yyyymmddThhmmssZ>-before.json` (mode `0600`). It holds the
    **whole** live config, filtered:
    - keys matching `SECRET_KEY` become `"<set>"` or `"<unset>"`;
    - keys matching `LONG_KEY` become `"len=<n> sha256=<hex>"`;
    - everything else is kept verbatim.

    Reuse `showValue`'s rules so the filter and the preview can't drift. After the final
    read-back, write `…-after.json` the same way, whether the result is ok or a mismatch.
  - **If the before-snapshot can't be written** (the dir isn't creatable, or a write error),
    print `error: cannot write snapshot; nothing sent` and exit 1 with **zero** PATCH requests.
  - **No snapshot in preview mode** (no `--apply`), since nothing is sent.
  - `.gitignore`: add `infra/auth/.snapshots/`.
  - **Read-back retry.** After a 2xx PATCH, GET up to 5 times, waiting 1 s, 2 s, 4 s and 8 s
    between tries (injectable `sleep`, so tests don't wait).
    - Stop at the first read where every changed key matches the planned after-view (the
      existing comparison, secrets by set-ness).
    - Compute `others_sha256` and the moved-keys report on **that** read. If every try is stale,
      report the mismatch from the last one, as today.
    - Print `read-back settled after <n> tries`.
    - A GET error on a try counts as a stale try. If all five fail, exit 1 with today's message.
  - Update the header comment: snapshots, retry, and where the files go.
- **Out:**
  - Changing the PATCH body, the confirm lock, or the preview output.
  - Committing snapshots.
  - `auth-drift-check.mjs`.

## Acceptance criteria
Every test title starts with `T-0509 AC-n`. Extend `auth-patch.test.mjs`'s fake `fetchImpl`, and add
injectable `sleep`, `writeFile`, `mkdir` and `now` the same way `readFile` is injected today.

- **AC-1 (before-snapshot, filtered, red on main)**
  - **Given** a live config with `smtp_pass: "SENTINEL-PASS"`,
    `mailer_templates_magic_link_content: "<html>SENTINEL-TPL</html>"`,
    `site_url: "https://app.workout.vestgote.com"` and 3 other plain keys, plus
    `--set rate_limit_email_sent=12 --apply` with the confirm lock.
  - **When** run.
  - **Then**:
    - one `…-before.json` is written **before** the PATCH call (compare call order);
    - it parses to an object with every live key;
    - `smtp_pass` is `"<set>"`;
    - the template is `len=… sha256=…`;
    - `site_url` is verbatim;
    - the serialised file contains neither `SENTINEL-PASS` nor `SENTINEL-TPL`;
    - its mode is `0600`.

  **Red:** on main, nothing is written.
- **AC-2 (snapshot failure means no PATCH)** With `writeFile` throwing: exit 1, stderr has
  `cannot write snapshot`, and the fake fetch saw exactly one GET and no PATCH.
- **AC-3 (preview writes nothing)** Without `--apply`: `writeFile` is never called.
- **AC-4 (stale then settled)**
  - **Given** the fake GET returns the old value on read-backs 1 and 2 and the new one on read 3.
  - **Then**:
    - exit 0;
    - stdout has `read-back settled after 3 tries`;
    - `sleep` was called with `[1000, 2000]`;
    - no `mismatch` on stderr;
    - an `…-after.json` was written holding the new value.

  **Red:** on main, the same fake exits 1 with `mismatch: rate_limit_email_sent`.
- **AC-5 (never settles)** If all 5 read-backs are stale: exit 1, stderr has today's
  `mismatch: …` line, and `sleep` was called with `[1000, 2000, 4000, 8000]`.
- **AC-6 (others moved, reported on the settled read)** If read 2 settles the changed key but
  `mailer_otp_length` moved from 6 to 8: exit 1, stderr names
  `others_sha256 changed (keys: mailer_otp_length)`, and the after-snapshot shows `8`.
- **AC-7 (gitignore)** `git check-ignore infra/auth/.snapshots/x.json` exits 0 (run through
  `spawnSync` in the test).
- **AC-8 (planted faults)** On a backup copy of `auth-patch.mjs`, restored with `cp`:
  - move the snapshot write after the PATCH → AC-1's order assertion fails;
  - set the retry count to 1 → AC-4 fails.

  Record both.
- Every existing T-0402c, T-0404b and T-0402d test in `auth-patch.test.mjs` passes unchanged.

## Paths you may change
- `infra/scripts/auth-patch.mjs`, `.github/scripts/auth-patch.test.mjs`,
  `.github/scripts/fixtures/auth-patch/**`, `.gitignore` (the lane: `infra`).
- **Listed extras:**
  - `docs/tickets/T-0509-auth-patch-snapshot-and-readback-retry.md`, for the build and accept
    logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red runs and the planted faults recorded.
- T-0508's `repo-scripts-lint.test.mjs` stays green.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green through `scripts/locked.sh small`.
- No prod call: every test uses the fake fetch.
- Commits start `T-0509`.

## Notes
- **Parallel:** after T-0508. Shares no file with T-0514b, T-0507 or T-0513. T-0515 waits for
  it.
- A snapshot holds non-secret config only (SMTP host and user, the Google client id, URLs). It is
  local and gitignored, and the human can delete it after review.

## Build / accept log
Archived in `docs/tickets/log/T-0509.md` (D-0157).
