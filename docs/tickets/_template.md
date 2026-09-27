---
id: T-NNNN
title: <short>
lane: <lane from .squad/ownership.yaml>
screens: [UF-xx.n]          # if any
decisions: [D-NNNN]         # decisions this ticket relies on
deps: [T-NNNN]
status: ready
---
## Why
<one paragraph; link PRD / flow / gap>

## Scope
- In: …
- Out: …

## Acceptance criteria
Each criterion becomes at least one automated test. Write them as Given / When / Then.
- AC1 Given … When … Then …
- AC2 …

## Paths you may change
<from the lane; list any extras explicitly>

## Contract impact
none | <contract> — needs D-NNNN

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-NNNN` and cite screen IDs.
