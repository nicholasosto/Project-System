---
status: accepted
date: 2026-01-14
priority: high
scope: tooling
---

# Adopt Luau strict mode across all gameplay code

**Status:** accepted

## Context

Type errors were shipping to players. We need them caught before runtime.

## Decision

All `src/` modules run `--!strict`. CI fails on a type error.

## Consequences

Fewer runtime crashes; some upfront annotation cost on legacy modules.

## Options considered

- **Stay nonstrict** — rejected; the crashes are the whole problem.

## Cites

- decisions/0003-retire-legacy-arena-combat

## Re-open if

Strict mode blocks a hotfix path we can't work around.
