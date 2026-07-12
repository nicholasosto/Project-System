---
title: "System-map view in the Command Center Overview"
status: available
updated: 2026-07-01
tags: { scope: tooling, tier: optional }
---

# System-map view in the Command Center Overview

> **Status:** available (2026-07-01)

## Summary

A C4-style system map of the framework on the Command Center **Overview**, rendered with
`@trembus/viz` `SystemMap` (0.3.0). It shows the framework's architecture — the contract (`schema/`),
the seam (`lib/contract.mjs`), the four engines (`tools/`), the two hooks, and the dashboard — plus the
data flow between them, with C4 drill-down (context → containers → components) and a node inspector.
Data is authored in `apps/command-center/src/systemMap.ts`.

## Why it matters

The Field Guide lists the framework anatomy as a *tree*; the system map shows how the parts *connect* —
`config + schema → ctx (contract.mjs) → validate · scaffold · guard · render → emitted contract →
dashboard`. It makes the "one contract, four engines" story legible at a glance, on the panel newcomers
land on. Complements [[field-guide-reference]] and [[command-center-dashboard]].

## Notes

- Uses `@trembus/viz@0.3.0` `SystemMap` (the installed version already exports it — no library bump
  needed). The sibling `ClassDiagram` in the same package is available for a future per-entity/schema view.
- **Data is authored in-app** (`systemMap.ts`), the same register as `tools/guide-anatomy.mjs` — the
  framework anatomy is universal and hand-curated.
- **On-ethos upgrade (deferred):** emit the `SystemMapContract` from `render-hub.mjs` (derived from
  `guide-anatomy` + `ctx`) so it's single-source, drift-proof, and consumer-general. Today the map is
  authored in the dogfood app only; a consumer app fork (e.g. Asset-Studio) wouldn't inherit it — a
  candidate [[derived-status-views]] extension.
