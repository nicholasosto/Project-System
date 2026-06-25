---
title: "Command-Center"
status: proposed
updated: 2026-06-25
links:
  - { rel: references, target: decisions/0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter }
---

# Command-Center

> **Status:** proposed (2026-06-24)

A live, interactive web surface for the ProjectEntity graph — built on the
**Trembus-Component-Library** (`@trembus/viz` + `@trembus/ui` + `@trembus/tokens`),
consuming the JSON contract the framework already emits. Supersedes the static
single-file HTML that `render-hub.mjs` produces through the legacy visual-grammar kit.

## Context

The framework already produces everything a real dashboard needs — it just freezes it
into one static HTML file. Three forces make a live surface worth building now:

- **The contract is already emitted as data.** `node tools/render-hub.mjs --no-render`
  writes `previews/dashboards/project-system-graph.json` (typed node-link) and
  `project-system-hub.json` (view-model). These are a clean, domain-neutral public
  interface; nothing downstream needs to re-read `_project/`. The seam is already cut.
- **The component library now ships the exact pieces.** `@trembus/viz` exports `Lineage`
  (takes a `GraphContract { GraphNode, GraphEdge }`) and `Tree` (takes a `TreeContract`) —
  a near-direct target for `graph.json`. `@trembus/ui` supplies the chrome (`Card`,
  `Badge`, `Tabs`, stat tiles); `@trembus/tokens` carries the dark Visual-Grammar theme as
  `--tcl-*` custom properties.
- **The two contracts share a spine.** A ProjectEntity reduces to **Identity · State ·
  Relation**; every Trembus component satisfies **Reveal-State · Afford-Action ·
  Acknowledge-Input**. *State* → *Reveal-State* and *Relation* → the node-link viz line up
  one-to-one. The dashboard is where the planning contract and the UI contract meet.

The static kit HTML stays useful as a zero-dep CI artifact, but it is a dead end for
interaction: no filtering, no drill-down, no repaint when `_project/` changes. A command
center wants all three.

**The constraint that shapes everything:** framework-core (`lib/` + `tools/`) and the
planning spaces stay **zero runtime dependencies / npm-free**. The Command-Center is
therefore a *separate consumer*, never part of the core — an isolated `apps/command-center/`
node_modules island that reads the emitted JSON and never leaks a dependency upward. The
core's job ends at the JSON; the app's job starts there. This is the existing
framework-core ↔ project-config split, extended one hop to a render consumer.

## Plan

Phased; each phase is a standalone deliverable.

- **P0 · Freeze the contract.** Adopt `project-system-graph.json` + `project-system-hub.json`
  as the Command-Center's input interface. Spec their shape in `docs/spec/`, keep
  `render-hub.mjs --check` in CI so it cannot silently drift, and diff `graph.json`'s
  node/edge fields against `@trembus/viz`'s `GraphContract` to find any gaps.
- **P1 · Scaffold the island.** `apps/command-center/` — Vite + React 19 depending on
  `@trembus/ui` + `@trembus/viz` + `@trembus/tokens`. Own `package.json` / lockfile /
  node_modules; a guard note + `.gitignore` so the island never contaminates the core's
  zero-dep guarantee. Wire `[data-theme="dark"]` to the Visual Grammar.
- **P2 · Render the graph.** Feed `graph.json` → `@trembus/viz` `Lineage`: each entity a
  node, each typed link an edge, `status` driving node tone (the State → Reveal-State map).
  This is the heart — the entity graph, live and navigable.
- **P3 · The three boards.** Mirror the `render-status-board` skill's three visuals as
  routed tabs (`@trembus/ui` `Tabs`): **Hub** (stats + scope tiles from `hub.json` via
  `Card`/`Badge`), **Decision-Tree** (the ADR ledger via `@trembus/viz` `Tree`, parent =
  `decided-in` target), **Plan-Progress** (roadmap + pipeline command board).
- **P4 · Live reload.** Dev-only watch that re-runs `render-hub.mjs --no-render` on any
  `_project/` write and hot-updates the app, so editing a decision repaints the board. The
  committed JSON stays the source the static build reads.
- **P5 · Supersede.** ✅ Done (2026-06-25): the live `@trembus/ui` `Hub` renders `hub.json`,
  so the static single-file HTML was retired — `render-hub.mjs` no longer shells out to the
  external kit and emits JSON only. CLAUDE.md's Map + Dogfooding sections now name the live
  surface.

## Open questions

- **Static export vs. running server?** The app can ship a static bundle (build-time
  `import` of the committed JSON — closest to the npm-free spirit, one artifact) or run a
  small server that re-renders on demand. Leaning static for the dogfood; revisit if
  multi-project aggregation lands.
- **`@trembus/viz` via published package or workspace path?** ✅ Resolved (2026-06-25):
  `@trembus/tokens` · `@trembus/ui` · `@trembus/viz` are published to npm at `^0.1.0`, and the
  app installs them as normal dependencies. The vite-alias-to-sibling-checkout workaround (and
  its `pnpm -r build` precondition) is gone — this repo no longer couples to a
  `Repositories/Trembus-Component-Library` checkout.
- **Does `graph.json` carry enough for `Lineage`?** Confirm node `tone`/`label`/`group`
  fields map onto `GraphNode`, and whether `Tree` needs a decisions-only projection rather
  than the full graph.
- **One Command-Center, or a multi-tenant shell?** The framework is project-agnostic; the
  app could read N configs and aggregate. Out of scope for v1 (dogfood = this repo), but the
  contract should not preclude it.
- **Relationship to `intranet-command-center`?** That app already renders `_project/` data
  with the older `@trembus/ui-library` + `@xyflow/react`. If this island proves the
  canonical `@trembus/ui` / `@trembus/viz` path, it becomes the migration template for the
  intranet dashboard — a cross-link, not a dependency.
