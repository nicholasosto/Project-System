---
title: "Session and plan views derived from the contract"
status: planned
updated: 2026-06-29
links:
  - { rel: references, target: pipeline/migrate-soul-steel-command-center }
  - { rel: references, target: decisions/0007-derive-kind-presentation-from-the-contract }
tags: { scope: tooling, tier: optional }
---

# Session and plan views derived from the contract

> **Status:** planned (2026-06-29)

## Summary

Make the framework the single source for **derived status views** — sessions, plans, and the like —
so a consumer never hand-maintains a dashboard that drifts from `_project/`. Surfaced by the
Soul-Steel-Official assessment ([[migrate-soul-steel-command-center]] item 7), where
`build-planning-sessions.mjs` is a *consumer-local* tool that re-derives a session dashboard by
re-reading `_project/` — work the framework's `render-hub` contract already does once, canonically.
The proposal: render-hub's emitted contract (`graph.json` nodes/edges + `runs`/`phases`) should be
rich enough that a session or plan view is a pure projection of it, rendered by the
`render-status-board` skill / Command Center — no second reader of `_project/`.

## Why it matters

- **One reader, no drift.** The contract spec's whole point is "nothing re-reads `_project/`"
  ([0007](../decisions/0007-derive-kind-presentation-from-the-contract.md), command-center-contract).
  A consumer-local session-dashboard tool is exactly the second reader that invites drift — the same
  failure mode the de-fork is removing for the engines.
- **Generalizes a per-consumer tool.** SS, and any consumer with sessions, otherwise each re-implement
  the same projection. Lifting it into render-hub's contract + the render-status-board skill makes it
  free for every consumer.
- **Closes the loop with the Command Center** — the same contract already feeds the hub; a session/plan
  board is the same data, a different lens.

## Notes

- **Scope to settle:** does render-hub gain a pre-baked session/plan *view-model*, or is the existing
  `graph.json` (nodes by kind + `runs`/`phases`) already sufficient for the `render-status-board`
  `plan-board` view to project from? Prefer the latter (keep render-hub minimal; views live in the
  skill/app) unless a gap is found.
- **Architectural tension to decide (ADR when adopted):** the framework deliberately keeps render-hub's
  contract minimal and pushes view-rendering outward. Adding bespoke views to render-hub would reverse
  that. The likely resolution is *enrich the contract just enough, render in the skill* — not *add a
  view to render-hub*.
- **Migration tie-in:** validates the [[migrate-soul-steel-command-center]] bet — if SS's planning-sessions
  view can be reproduced from the contract via the skill, the consumer-local builder can retire.
- Relates to [[command-center-dashboard]], [0007](../decisions/0007-derive-kind-presentation-from-the-contract.md).
