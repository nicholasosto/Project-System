---
status: superseded
date: 2025-11-02
priority: high
scope: steel-city
---

# Retire the legacy arena combat system

**Status:** superseded

## Context

The arena combat code predates the ability system and double-implements damage.

## Decision

Freeze arena combat; route all encounters through the new ability pipeline.

## Consequences

One damage path to reason about; the arena mode goes dark until re-skinned.

## Options considered

- **Maintain both** — rejected; the divergence is the bug source.

## Cites

- decisions/0001-adopt-luau-strict-mode

## Re-open if

A live-ops event needs the arena mode back before the re-skin lands.
