# Needs a human

Items here block only themselves. Tick the box and add a note when done; the orchestrator picks it up on the next tick.

- [X] **H-01 GitHub repo.** Create `uptive/workoutLab` (private) and add it as `origin`. Until then, work is merged locally on `main`. Response from human: its available at https://github.com/vestgoteUptive/workoutLab
- [x] **H-02 Supabase.** Create an access token (supabase.com → Account → Access tokens) and note your organization ID. Put both in `.env.local` as `SUPABASE_ACCESS_TOKEN` and `SUPABASE_ORG_ID`. Blocks: T-0400 (prod project). Local dev (`supabase start`, Docker) needs nothing.
- [x] **H-03 Cloudflare.** Create an API token scoped to the zone `vestgote.com` with *Zone:DNS:Edit* and *Account:Cloudflare Pages:Edit*. Put it in `.env.local` as `CLOUDFLARE_API_TOKEN`, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID`. Blocks: T-0401, T-0402.
- [x] **H-04 Google OAuth client** for Supabase Auth (Google Cloud console). Blocks: Google login only; magic link works without it.
- [ ] **H-05 Apple sign-in** (needs an Apple developer account). Optional for v1.
- [ ] **H-06 First production deploy approval** (gate 3), when T-0403 reaches review.
- [ ] **H-07 Review `revisit` decisions** when convenient: D-0003 coverage colour, D-0005 exercise content licence.
