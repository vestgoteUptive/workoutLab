---
id: T-0517
title: "UF-08.1: api/openapi.yaml SessionInput gains optional avoidAreas (array of Area, uniqueItems), regenerate packages/shared api.gen.ts (D-0191 §3, GitHub #33)"
lane: data
screens: [UF-08.1]
decisions: [D-0191, D-0037]
deps: [T-0516]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33. Build flow: wl-build-data. About ⅙ day.
Not on the user-facing path: the web app calls suggest on the device (D-0063 §3). -->

## Why
D-0191 §2 adds `avoidAreas` to the engine's `SessionInput`. D-0037 §7 keeps the openapi
`SessionInput` as the shared shape of the engine input, so it has to say the same thing.

## Scope
- In: add `avoidAreas` to `components.schemas.SessionInput`: `type: array`, `items: {$ref: Area}`,
  `uniqueItems: true`, **not** in `required`, with a description citing rule 6.1. Leave the
  `sessionInput30` example as it is, and add a second example with `avoidAreas: [quads, glutes]`.
  Regenerate `packages/shared/src/api.gen.ts` with the repo's generator.
- Out: the Edge Function validator (T-0518), the engine (T-0516).

## Acceptance criteria
- AC1 Given the updated openapi, When the shared schema tests validate
  `{…sessionInput30, avoidAreas: ["quads","glutes"]}`, Then it is valid.
- AC2 Given `sessionInput30` without `avoidAreas`, Then it is still valid (optional).
- AC3 Given `avoidAreas: ["legs"]`, Then it is invalid (not an `Area`). Given
  `avoidAreas: ["quads","quads"]`, Then it is invalid (`uniqueItems`).
- AC4 Given the regenerated `api.gen.ts`, Then `SessionInput["avoidAreas"]` is
  `Area[] | undefined` (a type-level test), and the openapi lint/drift checks pass.

## Paths you may change
`api/openapi.yaml` (contract, D-0191 §3), `packages/shared/**`.

## Contract impact
`api/openapi.yaml`: an additive optional field, D-0191 §3.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0517` and cite UF-08.1.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a
separate `… lint`, then a separate `… test`. Listing several script names after one `--filter`
runs only the first; pnpm passes the rest to it as plain CLI arguments, so they never run.

## Build / accept log
