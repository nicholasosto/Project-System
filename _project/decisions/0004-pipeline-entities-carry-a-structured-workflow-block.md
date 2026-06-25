---
title: "Pipeline entities carry a structured workflow block"
status: accepted
updated: 2026-06-25
---

# Pipeline entities carry a structured workflow block

> **Status:** accepted (2026-06-25)

## Context

The Command Center's Workflows tab visualizes established workflows as a Swimlane (Phase 1).
That first swimlane — the framework's authoring loop — was hand-authored in the app. To stay
true to the framework's "source-of-truth → contract → renderer" spine, a workflow should be
**data** derived from `_project/`, not embedded in the consuming app.

The obstacle: the zero-dep frontmatter parser (`lib/md.mjs`) is a YAML *subset* — scalars,
inline flow maps, block sequences of inline maps. A swimlane is nested (`lanes[]` and `steps[]`
where each step carries its own `to: [...]`), which that parser can't express.

## Decision

An entity MAY declare a **`## Workflow`** body section holding a single fenced ` ```json `
block that is a Trembus swimlane contract (`{ lanes[], steps[] }`). `render-hub.mjs` extracts it
and emits a top-level **`workflows`** map in `graph.json`, keyed by entity id; the Command
Center renders each as a `Swimlane`.

- **Zero-dep parse.** A fenced JSON block is `JSON.parse`-able with no new dependency, and
  sidesteps the frontmatter parser's nesting limits.
- **Domain-neutral.** The engine invents no workflow semantics — it passes a `{lanes,steps}`
  block through. The section name is config-driven (`render.workflowSection`, default
  `"Workflow"`), so no domain word is hard-coded.
- **Graceful.** A malformed or absent block is warned-and-skipped, never fatal; entities with
  no workflow simply contribute nothing to `workflows`.

## Consequences

- Workflow visualization is now **data-driven**: edit the markdown, re-run the renderer, the
  swimlane updates — the same loop as every other artifact.
- Any entity (not only `pipeline`) can carry a workflow; the convention is general.
- The emitted contract grows one **optional** facet (`workflows`); consumers that ignore it are
  unaffected. `render-hub.mjs --check` already covers it (no daily-drifting field).
- Per-step `status` in the block is a **current-progress snapshot** (a pipeline is a plan with
  progress). When run history lands (Phase 3), runs supply per-step outcomes and replay them
  over the same definition.

## Options considered

- **Frontmatter `workflow:` key** — rejected: the zero-dep YAML subset can't express nested
  arrays-of-objects-with-array-fields without growing the parser.
- **A sidecar `<id>.workflow.json` file** — rejected: splits the artifact, weakens the
  one-file-one-entity model, and needs new loader plumbing.
- **Fenced JSON in a body section** — chosen: zero-dep, human-editable beside the prose, and
  reuses the existing `parseSections` seam.

## Cites

- [docs/spec/command-center-contract.md](../../docs/spec/command-center-contract.md) — the emitted `workflows` shape.
- `tools/render-hub.mjs` — `extractWorkflow()` and the `workflows` emission.

## Re-open if

A workflow needs richer authoring than a JSON block (loops, conditionals, sub-flows), or the
`## Workflow` section convention collides with another body convention a project needs.
