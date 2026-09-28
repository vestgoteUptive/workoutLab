# Needs a human

Items here block only themselves. Tick the box and add a note when done; the orchestrator picks it up on the next tick.

- [X] **H-01 GitHub repo.** Create `uptive/workoutLab` (private) and add it as `origin`. Until then, work is merged locally on `main`. Response from human: its available at https://github.com/vestgoteUptive/workoutLab
- [x] **H-02 Supabase.** Create an access token (supabase.com → Account → Access tokens) and note your organization ID. Put both in `.env.local` as `SUPABASE_ACCESS_TOKEN` and `SUPABASE_ORG_ID`. Blocks: T-0400 (prod project). Local dev (`supabase start`, Docker) needs nothing.
- [x] **H-03 Cloudflare.** Create an API token scoped to the zone `vestgote.com` with *Zone:DNS:Edit* and *Account:Cloudflare Pages:Edit*. Put it in `.env.local` as `CLOUDFLARE_API_TOKEN`, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID`. Blocks: T-0401, T-0402.
- [x] **H-04 Google OAuth client** for Supabase Auth (Google Cloud console). Blocks: Google login only; magic link works without it.
- [x] **H-08 Finish Google sign-in in Supabase.** The Google provider panel is open in Chrome: Google is switched on and the client ID is filled in. Paste the client secret (`GOOGLE_OAUTH_CLIENT_SECRET` in `.env.local`) into *Client Secret (for OAuth)* and click **Save**. Agents don't type secrets into forms. Then name the Google accounts to add as test users (Google Auth Platform → Audience; the app is in testing mode). D-0011.
- [x] **H-09 Resend (email for magic links).** Create a free account at resend.com and an API key with "sending access" only. Put it in `.env.local` as `RESEND_API_KEY`. Blocks: T-0404. D-0012.
- [ ] **H-05 Apple sign-in** (needs an Apple developer account). Optional for v1.
- [ ] **H-06 First production deploy approval** (gate 3), when T-0403 reaches review.
- [ ] **H-07 Review `revisit` decisions** when convenient: D-0003 coverage colour, D-0005 exercise content licence. Added 2026-09-27 by the squad (all defaults, none blocking): D-0013 balance window, D-0014 account placement, D-0015 set sync, D-0017 NFRs, D-0018 check-in rules, D-0019 token shape, D-0020/D-0021 data rules, D-0022 library format, D-0023 repo checks, D-0024–D-0027 engine rules, D-0029 exercise columns, D-0030 data defaults, D-0031 colour guard.
- [ ] **H-10 Landing copy and privacy mailbox** (gates 3 and 6, D-0046 §8 and §11). Before the first prod deploy of the landing page: approve the landing and privacy copy in `apps/landing/src/content/`, and create or confirm the `privacy@workout.vestgote.com` mailbox. Blocks only the landing prod deploy. Building and previewing the page don't need it.
