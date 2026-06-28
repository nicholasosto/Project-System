---
title: "Model the roadmap as a feature kind tiered by tag"
status: accepted
updated: 2026-06-28
---

# Model the roadmap as a feature kind tiered by tag

> **Status:** accepted (2026-06-28)

## Context

The Command Center had no roadmap of *capabilities* — only the milestone `ribbon` (coarse) and
per-roadmap `## Phases` (coupled to one roadmap). We wanted a single view of "currently available
features (required/optional) vs planned features," and to retire the big Stat tiles atop Progress.

## Decision

Model a feature as a first-class **`feature` kind** (status `planned|available|deprecated`) with a
**`tier` tag** (`required|optional`); the repurposed **Roadmap** panel groups feature entities by
status, required-before-optional. Features are normal entities — validated, scaffolded, linkable. To
carry the tier into the UI, `render-hub` now emits per-entity **`tags`** on `nodes[]`, and
`new-entity` gained a generic **`--tag key=value`** flag (registry-validated).

## Consequences

The roadmap is data-driven and derives from entities — add/retire a feature by adding/editing a
file; the Field Guide absorbs the new kind automatically. `--tag` and `nodes[].tags` are reusable
beyond features. Cost: features are decoupled from roadmap/milestone structure (intentional — they
cut across roadmaps), and a project must author feature entities to populate the view. Public/private
is deferred — a `visibility` tag + a scrubbed `render-hub` export when a public site is built.

## Options considered

- **Reuse roadmap `## Phases`** — phases are bound to one roadmap's lifecycle; can't aggregate a cross-roadmap catalog. Rejected.
- **A hand-authored `render.features` array in config** — not entity-sourced; can't validate, link, or guard. Rejected.
- **Fold tier into status** — availability and required/optional are orthogonal axes; conflating them loses information. Rejected (tier is a tag).

## Cites

- `project-system.config.json` (the `feature` kind + `tier` tag)
- `tools/render-hub.mjs` (`nodes[].tags`) · `tools/new-entity.mjs` (`--tag`)
- `apps/command-center/src/App.tsx` (`RoadmapBoard` / `FeatureCatalog`)

## Re-open if

Features need their own lifecycle phases, or a public/private split is required (then add the
`visibility` tag + scrubbed export).
