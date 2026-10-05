---
id: T-0404b
title: "Prod auth mails through Resend: SMTP settings + branded magic-link and confirm-signup templates (link + 6-digit code) via the human-run keys-only PATCH, expected file extended in the same ticket (UF-01.5; D-0012, D-0185 §4, D-0186 §3)"
lane: infra
screens: [UF-01.5]
decisions: [D-0011, D-0012, D-0185, D-0186]
deps: [T-0404a, T-0402c, T-0500]
status: todo
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §3). Build flow:
wl-build-infra. About ½ day across run A (templates, tests, a no-apply preview of the PATCH,
stop), the human's PATCH, and a read-only verify. It reuses T-0402c's auth-patch.mjs. SMTP
settings are prod auth settings: D-0185 §4 applies, never Terraform. -->

## Why
UF-01.5 signs users in with a magic link, or the 6-digit code in the same mail
(`apps/web/src/lib/auth/magic-link.ts` calls `verifyOtp` with `type: "email"`). Prod still uses
Supabase's built-in mailer. It allows 2 mails an hour, sends from a Supabase address, and uses
the unbranded default template. A second sign-up in the same hour fails.

D-0012 moves auth mail to Resend over SMTP, from the domain T-0404a verified. Two templates
matter:
- **magic link,** for existing users;
- **confirm signup,** which `signInWithOtp` with `shouldCreateUser: true` sends to a **new**
  user.

Both must carry the link **and** the code: the code is the fallback when the link opens in
another browser, such as the installed PWA (board note from the T-0300 groom).

The settings include the SMTP password (`RESEND_API_KEY`). So this goes through the D-0185 §4
keys-only PATCH, run by the human, with the expected file extended in the same ticket.

## Scope
- **In:**
  - **Templates,** committed under `infra/auth/templates/`:
    - `magic-link.html` and `confirmation.html`, each with a matching `.subject.txt`;
    - each HTML holds exactly one `{{ .ConfirmationURL }}` as a button `href`, and exactly one
      `{{ .Token }}`, shown as the 6-digit code with a line telling the user they can type it
      in the app instead;
    - branded per Chalk & Iron: background `#121210`, text `#F2EFE8`, button `#D4F25A` with
      text `#121210`, muted `#A8A398`. Fonts are `font-family: 'DM Sans', Arial, sans-serif`
      for the body and `'Big Shoulders Display', Impact, sans-serif` for the heading, with no
      web-font `<link>`. Table layout with inline styles only, no `<style>` dependence for
      layout, and no images. It renders in clients that strip CSS;
    - copy is plain and short: the product name "workoutLab", one sentence, the button, the
      code, and "Didn't ask for this? Ignore this mail." It needs no person's or Uptive's name
      (gate 6);
    - subjects: `Your workoutLab sign-in link` and `Confirm your workoutLab account`.
  - `infra/scripts/auth-patch.mjs` (from T-0402c) gains `--set-from-file <key>=<path>`, which
    reads the file's contents verbatim.
  - **The PATCH,** human-run with `--apply` and `CONFIRM_PROD_AUTH`. It sends exactly these
    keys:
    - `smtp_host=smtp.resend.com`, `smtp_port=465`, `smtp_user=resend`;
    - `smtp_pass` from the env var `RESEND_API_KEY`;
    - `smtp_admin_email=no-reply@workout.vestgote.com`, `smtp_sender_name=workoutLab`;
    - `rate_limit_email_sent=10` (per hour, project-wide, which keeps a busy day under Resend's
      100 a day);
    - `mailer_subjects_magic_link`, `mailer_templates_magic_link_content`,
      `mailer_subjects_confirmation` and `mailer_templates_confirmation_content`, all from the
      files.
  - **`infra/auth/expected-auth.json` and the drift script (T-0500):**
    - `keys` gain `smtp_host`, `smtp_port`, `smtp_user`, `smtp_admin_email`,
      `smtp_sender_name`, `rate_limit_email_sent`, `mailer_subjects_magic_link` and
      `mailer_subjects_confirmation`;
    - new `DERIVED` entries: `smtp_pass_set` (non-empty, boolean only),
      `mailer_templates_magic_link_matches` and `mailer_templates_confirmation_matches`. These
      compare the live template with the committed file after trimming trailing whitespace;
    - `infra/scripts/auth-drift-check.mjs` gets the three derived functions, with tests.
  - `.github/scripts/auth-templates.test.mjs`, for the template rules below.
  - `docs/infra-costs.md`: the email row says "Resend free, live" with its limits, and still
    costs 0.
- **Out:**
  - Local `supabase/config.toml` and Mailpit. Local dev keeps the default mailer.
  - Other templates (recovery, email change, invite, reauthentication). The app doesn't use
    them. A follow-up brands them if any flow starts to.
  - Any Resend API call by an agent beyond what the human's PATCH implies.
  - The OTP length and expiry: unchanged (`mailer_otp_length` 6 stays pinned by T-0500).

### Edge cases that are in scope
- **The confirmation template is never sent** in some configs (`mailer_autoconfirm` true, which
  sends the magic link to new users too). Record the live `mailer_autoconfirm` value through
  `--print`, filtered, and brand both either way.
- **Resend rejects the sender** because the domain isn't verified. T-0404a AC-5 is a dep. If
  verification has lapsed, stop, and return `blocked`.
- **A mail client rewrites the link** (safe-links scanners pre-fetch it and burn the one-time
  token). That's why the code is in the mail. AC-6 covers the code path too.
- **The Supabase template variable syntax** must be `{{ .ConfirmationURL }}` and `{{ .Token }}`
  exactly, spaces included. The AC-1 test enforces that.
- **PATCH partially accepted** (one key rejected, for example the port as a number versus a
  string). The tool's after-view shows it, and so does the drift check. Fix the value type and
  rerun the human step. `others_sha256` must still be unchanged.

## Acceptance criteria
Node:test titles start with `T-0404b AC-n`.

- **AC-1 [static] Template rules.** For each of the two HTML files:
  - exactly one `href="{{ .ConfirmationURL }}"`, and exactly one `{{ .Token }}`;
  - no `<script`, `<link`, `<img`, `@import` or `url(`, and no `http://` or `https://` URL
    other than the template variable;
  - every `#RRGGBB` in the file is a value in `packages/design-tokens/src/tokens.json` (read at
    test time, not copied);
  - under 50 KB;
  - each subject is a single line under 78 characters, holding `workoutLab`.
  - Planted fault, recorded: a copy with `#FFFFFF` goes red; a copy without `{{ .Token }}` goes
    red.
- **AC-2 [static] PATCH body.**
  - **Given** a fake live config and the full argument list from `infra/auth/README.md`, **when**
    `auth-patch.mjs` runs with `--apply`, **then** the PATCH body has exactly the 11 keys
    listed in Scope.
  - **And** `smtp_pass` equals the env sentinel, which appears in neither stdout nor stderr.
  - **And** each template key equals its file's bytes.
- **AC-3 [static] Drift check additions.**
  - **Given** a fixture whose templates equal the files and whose `smtp_pass` is set, **then**
    the three derived values are `true` and exit 0.
  - **Given** one changed template character, **then** the matching `_matches` is `false` and
    exit 1.
  - **Given** `smtp_pass` empty, **then** `smtp_pass_set: expected true, live false`.
  - T-0500's AC-5 (expected file secret-free) still passes with the new keys.
- **AC-4 [live, run A, read-only]** `auth-patch.mjs` without `--apply` prints the before/after
  of the 11 keys (`smtp_pass` as `<unset>` → `<set>`, templates as a length and a SHA-256), plus
  `others_sha256`. It goes in the log as the H-item's review material.
- **AC-5 [live, after the human's apply, read-only]**
  - The tool's after-view equals AC-4's after-view, and `others_sha256` is unchanged.
  - **And** the T-0500 drift check exits 0 with the extended file.
- **AC-6 [live, human] The mail arrives and both paths work (UF-01.5).** On the newest preview
  (T-0402c allows its origin), the human requests sign-in for:
  - **(a)** an address that has never signed in. The confirmation mail arrives from
    `workoutLab <no-reply@workout.vestgote.com>`, branded, and the link signs them in on the
    preview origin;
  - **(b)** their existing address. The magic-link mail arrives, and **typing the 6-digit code**
    in UF-01.5 signs them in.
  - **And** the mail's headers show `spf=pass` and `dkim=pass` for `workout.vestgote.com` (the
    human copies the `Authentication-Results` line).
  - The orchestrator records the human's report.
- **AC-7 [static]** `docs/infra-costs.md`'s email row says Resend (free tier, live), at 0 USD.

## Paths you may change
- `infra/auth/templates/**` (new), `infra/auth/expected-auth.json`, `infra/auth/README.md`,
  `infra/scripts/auth-patch.mjs`, `infra/scripts/auth-drift-check.mjs`, `docs/infra-costs.md`.
- `.github/scripts/auth-templates.test.mjs` (new), `.github/scripts/auth-patch.test.mjs`,
  `.github/scripts/auth-drift-check.test.mjs`, `.github/scripts/fixtures/auth-patch/**`,
  `.github/scripts/fixtures/auth-drift/**`.
- **Listed extras:**
  - `docs/tickets/T-0404b-supabase-smtp-and-templates.md`, for the build and accept logs.

## Contract impact
None to the schema, API, engine or tokens. The template colours read `tokens.json` and don't
change it. No recurring cost: the Resend free tier (D-0012).

## Definition of done
- **Gate (D-0185 §4, D-0186 §2):**
  - **Run A:** the templates, the tests, the expected-file update and AC-4's preview. The
    builder commits and hands back `blocked` with "PATCH ready for human review".
  - The human runs `CONFIRM_PROD_AUTH=<ref> node infra/scripts/auth-patch.mjs <args> --apply`
    with `RESEND_API_KEY` loaded from `.env.local`.
  - **Verify run:** AC-5 and AC-6.
  - An agent never sends the PATCH.
- Every `[static]` AC passes, and the planted faults are recorded.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass. Nothing under `apps/` or `packages/` changes
  (D-0178).
- Commits start `T-0404b` and cite UF-01.5.

## Notes
- **The human runs it in their own terminal,** with this exact line: `set -a; . .env.local; set
  +a; CONFIRM_PROD_AUTH=<ref> node infra/scripts/auth-patch.mjs …`. The builder writes it into
  `infra/auth/README.md`.
- **The copy is minimal and functional.** If the human wants different wording, it's a one-line
  template change plus another human-run PATCH.

## Build / accept log

### Run A, 2026-10-05 (devops; worktree from b75b54a, clean)
- **Changed:** `infra/auth/templates/` (magic-link + confirmation HTML and subjects: table
  layout, inline styles, token colours, link + `{{ .Token }}`, no images or URLs);
  `auth-patch.mjs` gains `--set-from-file` (verbatim; secret keys refused), keeps `smtp_port` a
  string (`STRING_KEYS`: the Management API types it as a string and prod reads `null`), shows
  `*_content` as `len= sha256=`, and compares a secret in the after-check by set-ness only (in
  case the API masks it on read). `auth-drift-check.mjs` gains `smtp_pass_set` and the two
  `mailer_templates_*_matches` (trimEnd compare), and names the type when only the type differs.
  `expected-auth.json` +8 keys +3 derived. README has the exact preview/apply lines.
  `.prettierignore` skips `infra/auth/templates/` (Prettier rewrote the font quotes to `&quot;`
  and lowercased the hex; the files are sent byte for byte). `docs/infra-costs.md` email row.
- **Live, read-only:** `mailer_autoconfirm` = `false` (new users get the confirmation mail);
  prod SMTP keys all `null`, `smtp_pass` `<unset>`, `rate_limit_email_sent` 2, `mailer_otp_length` 6.
- **AC-4 preview (GET only, exit 0):** before → after: `smtp_host` null → smtp.resend.com;
  `smtp_port` null → 465; `smtp_user` null → resend; `smtp_pass` `<unset>` → `<set>`;
  `smtp_admin_email` null → no-reply@workout.vestgote.com; `smtp_sender_name` null → workoutLab;
  `rate_limit_email_sent` 2 → 10; `mailer_subjects_magic_link` "Your sign-in link" → "Your
  workoutLab sign-in link"; `mailer_templates_magic_link_content` len=173 sha256=87cf15e1… →
  len=2252 sha256=98fb4f8cda3092900c5cd6b7529368dee3fac612b9e56aded8042f91dd3ff2b3;
  `mailer_subjects_confirmation` "Confirm your email address" → "Confirm your workoutLab account";
  `mailer_templates_confirmation_content` len=184 sha256=c495b241… → len=2290
  sha256=f7f654c32cd6bff79257bc96b151ab3a031bab0be527bb00630d5ef9d13fce51;
  `others_sha256=07598261b03d88b425c265eff1cac2c23ee45a9bab916b45bf00fd8bb7ab3c02`.
  Live drift check now exits 1 on exactly the 11 pending items (expected until the human applies).
- **AC→test:** AC-1 `auth-templates.test.mjs` "AC-1 each template…", "AC-1 each subject…",
  "AC-1 planted faults…"; AC-2 `auth-patch.test.mjs` "AC-2 the README's…", "AC-2 --apply with
  the README arguments…", "AC-2 a masked secret…", "AC-2 --set-from-file…"; AC-3
  `auth-drift-check.test.mjs` four "T-0404b AC-3" tests (T-0500 AC-5 still green); AC-4 static
  half "AC-4 preview masks RESEND_API_KEY…" + the live preview above; AC-5 static half "AC-5
  after the apply the extended drift check exits 0"; AC-7 `auth-templates.test.mjs` "AC-7…".
  T-0402c AC-6 test now starts from a live config holding the T-0404b keys (its single
  allow-list difference is unchanged).
- **Red / faults (all restored by `cp` from backups):** F1 `#F2EFE8`→`#FFFFFF` in magic-link.html:
  2 red. F2 `{{ .Token }}` removed: 2 red. F3 main's auth-patch.mjs (unfixed): 4 T-0404b tests
  red. F4 template view verbatim: AC-4 red. F5 `smtp_pass_set` always true: AC-3 red. F6 main's
  drift-check (unfixed): 8 red.
- **Status:** blocked on the human's apply (D-0185 §4); then AC-5 live + AC-6.
