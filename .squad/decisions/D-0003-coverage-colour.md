---
id: D-0003
title: Coverage scale is a lime ramp; attention is a warn outline
status: revisit
date: 2026-09-27
by: orchestrator
area: design
---
## Context
v1 said deep teal for "on target"; the design system has only lime as accent and no coverage tokens.

## Decision
Five tokens `coverage-0..4`, from `surface-2` (#2A2925, untouched) to `accent` (#D4F25A, on target), interpolated in OKLCH. "Needs attention" = 2 px `warn` (#FF8A3D) outline, never fill. Each step must pass 3:1 against `bg` for non-text contrast, or carry a numeric label.

## Revisit when
The designer or a human reviews the body map (C-01) on a real device.
