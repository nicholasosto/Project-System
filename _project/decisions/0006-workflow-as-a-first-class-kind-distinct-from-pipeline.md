---
title: "Workflow as a first-class kind, distinct from pipeline"
status: accepted
updated: 2026-06-27
links:
  - { rel: references, target: decisions/0004-pipeline-entities-carry-a-structured-workflow-block }
---

# Workflow as a first-class kind, distinct from pipeline

> **Status:** accepted (2026-06-27)

## Context

Reshaping the hub's hex grid to surface a **Workflows** tile exposed a conceptual muddle: the
`pipeline` kind was doing double duty — a staged *build plan* (`design → ship`) **and** the
carrier of `## Workflow` swimlanes (per [0004](0004-pipeline-entities-carry-a-structured-workflow-block.md)).
Worse, 0004 set an explicit goal — *"a workflow should be data derived from `_project/`, not
embedded in the consuming app"* — yet the framework's one standalone workflow, the **authoring
loop**, was hardcoded in `apps/command-center/src/workflows.ts`. It had no home as data because
there was no kind to put it in. 0004 was only half-realized.

## Decision

Introduce a **`workflow`** entity kind: folder `workflows/`, status `draft → active →
deprecated`, sections `Purpose` + `Workflow`, and a new config flag `carriesSwimlanes: true`.

The reduction that justifies the split: a **pipeline is a stateful _instance_** — one unit of
delivery moving through a lifecycle (the WHAT). A **workflow is a reusable _template_** — lanes ×
steps, replayable with run history (the HOW). They are orthogonal: a pipeline MAY follow a
workflow; a workflow outlives any single delivery. The authoring loop is a template (every
artifact flows through it), which is exactly why it never fit as a pipeline.

The authoring loop moves to [`_project/workflows/authoring-loop.md`](../workflows/authoring-loop.md);
the app derives all workflows from the contract and hardcodes none. The 0004 `## Workflow` block
convention **stays** for any entity (e.g. a pipeline) that carries a bespoke inline flow.

## Consequences

- **Easier.** The framework's canonical workflow is now data — 0004 fully realized. `pipeline`
  and `workflow` read cleanly (instance vs template). `/new workflow "X"` births a counted
  swimlane immediately (its body *is* the workflow), which dissolves the earlier "should
  `/new pipeline` create a workflow?" question.
- **Harder.** One more kind to carry. The Workflows tile/tab now distinguish standalone
  `workflow` entities (lead) from other kinds' inline `## Workflow` blocks (follow) — a
  distinction the contract exposes via `swimlaneKinds`.

## Options considered

- **Keep workflows as a block only (0004 status quo)** — rejected: leaves the authoring loop
  app-embedded, contradicting 0004's own goal, and gives reusable processes no home.
- **A `--workflow` flag on `/new pipeline`** (bolt a swimlane onto a pipeline) — rejected:
  conflates instance and template; a workflow is not a property of one delivery.
- **Rename `pipeline` to something workflow-aligned** — deferred: a separate naming decision
  (the CI/CD-collision concern), now *safer* because the process-shape has been extracted.

## Cites

- [0004](0004-pipeline-entities-carry-a-structured-workflow-block.md) — the `## Workflow` block convention this kind builds on.
- [`_project/workflows/authoring-loop.md`](../workflows/authoring-loop.md) — the migrated standalone workflow.
- `tools/render-hub.mjs` (`readWorkflowsFacet`) · `lib/contract.mjs` (`swimlaneKinds`) · `apps/command-center/src/workflows.ts`.

## Re-open if

A workflow needs richer authoring than a single swimlane block (loops, sub-flows), or the
instance/template split stops paying for itself — e.g. if every pipeline ends up needing a 1:1
workflow, the two should re-merge.
