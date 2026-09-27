# ADR 0001 — Stack (status: decided, see `.squad/decisions/D-0001-stack.md`)

## Options
- Frontend: React (Vite or Next.js) vs SvelteKit, both as PWA
- Backend: Supabase (Postgres, auth, storage, row-level security) vs FastAPI/Node + Postgres

## Considerations
- Supabase gives auth + storage fast; custom backend gives more control over engine execution.
- The engine lives in `packages/engine` either way, so it can run client-side (offline) or server-side.

## Decision
React + Vite PWA, Supabase, Cloudflare Pages, pnpm monorepo. Full text and reasoning: `.squad/decisions/D-0001-stack.md`.
