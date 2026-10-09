# Prod auth drift check (T-0500)

Prod auth settings are hand-managed in the Supabase dashboard (D-0185, H-08). This check notices
when one of the managed keys moves.

- `expected-auth.json` lists the managed keys, their expected values and derived booleans. It is
  secret-free: no secret values, only booleans such as `*_matches` / `*_set`.
- `infra/scripts/auth-drift-check.mjs` sends one `GET .../config/auth`, keeps only the listed keys
  before anything is printed, and diffs them. Read-only; never runs in CI (the access token stays
  local).

```sh
set -a; . <repo>/.env.local; set +a; node infra/scripts/auth-drift-check.mjs          # exit 0 match, 1 drift, 2 error
set -a; . <repo>/.env.local; set +a; node infra/scripts/auth-drift-check.mjs --print  # filtered live keys (before/after)
```

`uri_allow_list` is compared as a set (live order differs from D-0011).

**Rule (D-0185 §4):** a ticket that changes a live auth key updates `expected-auth.json` and this
file in the same ticket, shows before/after with `--print`, and runs the check afterwards.

## Auth mail through Resend (T-0404b, UF-01.5)

Prod auth mail goes through Resend SMTP (D-0012) from `no-reply@workout.vestgote.com`. The
branded templates live in `templates/`: `magic-link.html` (existing users) and
`confirmation.html` (new users; sent because `mailer_autoconfirm` is `false`), each with a
`.subject.txt`. Both carry the link and the 6-digit code (`{{ .Token }}`). They are sent
byte-for-byte, so Prettier skips them (`.prettierignore`). The drift check compares them as
`mailer_templates_*_matches` and the password only as `smtp_pass_set`.

The change is a human-run keys-only PATCH (D-0185 §4), from the repo root, in your own terminal.
`RESEND_API_KEY` comes from `.env.local` and is only ever shown as `<set>`/`<unset>`. Preview
first (GET only, nothing sent):

<!-- T-0404b args: the auth-patch.test.mjs AC-2 test runs exactly this argument list. -->

```sh
set -a; . .env.local; set +a; node infra/scripts/auth-patch.mjs \
  --set smtp_host=smtp.resend.com \
  --set smtp_port=465 \
  --set smtp_user=resend \
  --set-from-env smtp_pass=RESEND_API_KEY \
  --set smtp_admin_email=no-reply@workout.vestgote.com \
  --set smtp_sender_name=workoutLab \
  --set rate_limit_email_sent=10 \
  --set-from-file mailer_subjects_magic_link=infra/auth/templates/magic-link.subject.txt \
  --set-from-file mailer_templates_magic_link_content=infra/auth/templates/magic-link.html \
  --set-from-file mailer_subjects_confirmation=infra/auth/templates/confirmation.subject.txt \
  --set-from-file mailer_templates_confirmation_content=infra/auth/templates/confirmation.html
```

Then apply: the same line with `CONFIRM_PROD_AUTH=csgjsdwuxqtuqpuazzpz` before `node` and
`--apply` at the end:

```sh
set -a; . .env.local; set +a; CONFIRM_PROD_AUTH=csgjsdwuxqtuqpuazzpz node infra/scripts/auth-patch.mjs \
  --set smtp_host=smtp.resend.com \
  --set smtp_port=465 \
  --set smtp_user=resend \
  --set-from-env smtp_pass=RESEND_API_KEY \
  --set smtp_admin_email=no-reply@workout.vestgote.com \
  --set smtp_sender_name=workoutLab \
  --set rate_limit_email_sent=10 \
  --set-from-file mailer_subjects_magic_link=infra/auth/templates/magic-link.subject.txt \
  --set-from-file mailer_templates_magic_link_content=infra/auth/templates/magic-link.html \
  --set-from-file mailer_subjects_confirmation=infra/auth/templates/confirmation.subject.txt \
  --set-from-file mailer_templates_confirmation_content=infra/auth/templates/confirmation.html \
  --apply
```

Afterwards run the drift check (exit 0 expected). If a key was rejected, the tool's after-view and
the drift check name it: fix the value and rerun the apply; `others_sha256` must stay unchanged.
To change the wording, edit the template, rerun the preview and the apply.

## Paper-palette templates (T-0617, D-0208): PATCH pending (H-35)

The templates in `templates/` now use the paper tokens (`paper.bg`, `paper.ink`, `paper.ink-muted`,
`paper.action`, `paper.on-action`), read by `.github/scripts/auth-templates.test.mjs`. Prod still
sends the old Chalk & Iron mail until the owner runs the keys-only PATCH above (H-35). Until then
the drift check reports `mailer_templates_*_matches` as changed; that is expected.
