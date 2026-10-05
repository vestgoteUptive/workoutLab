---
id: D-0187
title: "Resend DNS (T-0404a): the three records Resend's auto-configure already made are adopted with import blocks that mirror the live values (TTL 3600, TXT quoted); DMARC is created under workout. with the same TTL; layout is two CNAMEs + DKIM TXT + DMARC, never the apex"
status: revisit
date: 2026-10-05
by: devops (T-0404a run A)
area: infra
builds-on: D-0012, D-0184, D-0186
amends: D-0186
---
## Context
T-0404a assumed SPF TXT + MX on `send.`. H-20 showed Resend's real layout: CNAME `send.` ->
`send.forge.rmta.net`, CNAME `rsend.` -> `rsend-euw1.forge.rmta.net`, DKIM TXT on
`resend._domainkey.`, plus an optional DMARC that Resend names for the apex. Run A's GET discovery
found the first three **already present**, all created in the same second
(2026-10-05T19:02:48Z), TTL 3600, not proxied, content equal to H-20's values (the DKIM TXT stored
in quotes). That pattern is Resend's Cloudflare auto-configure. `_dmarc.workout.vestgote.com` and
`_dmarc.vestgote.com` don't exist.

## Decision
- Follow the ticket's edge case: adopt the three with `import {}` blocks (executed by the human's
  apply, no `terraform import` CLI), and mirror the stored values exactly so the import is a
  no-op: TTL 3600 instead of the ticket's `ttl = 1`, TXT content with Cloudflare's quotes.
- Create `_dmarc.workout.vestgote.com` TXT `"v=DMARC1; p=none;"`, TTL 3600 for consistency.
  Never `_dmarc.vestgote.com` (gate 4: it would set policy for the whole shared zone).
- The scope check allows exactly these four addresses/names, types CNAME/TXT, `proxied = false`;
  import blocks may only target them.

## Consequences
Expected plan: `3 to import, 1 to add, 0 to change, 0 to destroy` (the ticket's "4 = add +
import"). If the plan shows an update on an imported record (provider drift on e.g. `settings`),
it isn't zero-change: redo run A with the attribute mirrored, or triage. Revisit TTL 1 later if
wanted (a separate, deliberate update).
