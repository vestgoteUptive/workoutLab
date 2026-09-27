---
id: D-0001
title: Stack — React + Vite PWA, Supabase, Cloudflare Pages, pnpm monorepo
status: decided
date: 2026-09-27
by: orchestrator
area: process
---
## Context
ADR 0001 was open, and every lane waited on it. The PRD needs auth, per-user storage with row-level security, offline logging mid-workout, and a deterministic engine that can run on the device.

## Decision
- **Monorepo:** pnpm workspaces + Turborepo, TypeScript strict everywhere, Node 22.
- **PWA (`apps/web`):** React 19 + Vite + `vite-plugin-pwa` (Workbox), React Router, TanStack Query, Zustand for the focus-mode state machine, IndexedDB (Dexie) for the offline set queue. Vitest + Testing Library; Playwright for e2e.
- **Landing (`apps/landing`):** Astro static site, same design tokens.
- **Backend:** Supabase only. No `apps/api`. Plain CRUD uses supabase-js with RLS and generated DB types (`packages/shared`). Logic that must be server-side (suggest, finish/summary, balance) runs as Supabase Edge Functions that import `packages/engine`.
- **Engine (`packages/engine`):** pure TS, no I/O, runs both in the browser (offline suggestions) and in Edge Functions (Deno, via an npm-compatible build).
- **Hosting:** Cloudflare Pages for both web apps; Supabase cloud for DB/auth/functions.

## Consequences
- `apps/api` is deleted. `api/openapi.yaml` documents only Edge Functions (see gaps B2).
- React over SvelteKit: agents write it most reliably, and it has the best Testing Library and Playwright support. The switching cost is low until T-0300.
- ADR 0001 is marked decided with a pointer here.
