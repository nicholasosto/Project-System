---
title: "Validate the swimlane body and let steps reference the graph"
status: accepted
updated: 2026-06-29
links:
  - { rel: references, target: decisions/0004-pipeline-entities-carry-a-structured-workflow-block }
  - { rel: references, target: decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline }
---

# Validate the swimlane body and let steps reference the graph

> **Status:** accepted (2026-06-29)

## Context

`workflow` is a first-class kind whose `## Workflow` swimlane is the entity's reason to exist
([0006](0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md)), yet that body was the
**least-governed surface in the framework**: `render-hub` only checked that `lanes[]`/`steps[]`
were arrays, and neither `validateEntity` nor the PreToolUse guard inspected it — a dangling
`step.to`, an unresolved `lane`, or a duplicate id passed silently and broke layout. Separately,
the `@trembus/ui` `Swimlane` already supported a far richer step model than we authored
(`status`/`note`/`detail`/`col`, lane `kind`), so authored steps were minimal and the click
inspector was empty — "little guidance when clicked." And a step had no way to point at the
decision or feature it realizes, so a workflow was an island disconnected from the planning graph.

## Decision

Three coupled choices, shipped as one enhancement:

1. **Validate the swimlane body through the single check.** A new zero-dep, pure
   `lib/swimlane.mjs` (`validateSwimlane`) checks required lane/step fields, unique ids, and
   `lane`/`to[]` referential integrity (advisory: unknown lane kind/status, bad `col`,
   unreachable/no-terminal). It is wired into `validateEntity` **gated on the kind's
   `carriesSwimlanes` flag** — the only kind-aware line, reading a config-derived list — so the
   validator, the guard, and the renderer all inherit it with **no re-implementation**. The
   block is parsed **once at load** (`lib/contract.mjs` → `entity.workflow`), replacing
   render-hub's private parser. Strictness is a config knob, `swimlaneEnforcement.rollout`,
   mirroring `proseStatusEnforcement` (default `warn`; this repo dogfoods `error`).

2. **Let a step reference the graph.** A step may carry `refs: [{ rel, target }]`, authored and
   validated **exactly like an entity's `links`** (the link-target check is factored into one
   `validateRel` reused by both). `render-hub` denormalizes each into `{ rel, target, title,
   kind }` against `nodes[]`, so the Command Center shows target titles and routes by kind.

3. **Augment, don't replace, the kit inspector.** `WorkflowConsole` wires the kit `Swimlane`'s
   `onSelect` to an app-side **step-detail drawer** (mirroring the Overview hub's
   `.cc-detailpanel`) that surfaces the step's `note`/`detail`/`status`, its handoffs as
   clickable successor labels, and its refs as clickable cross-links into the graph. The kit's
   own inline inspector stays for quick-glance. **No fork of `@trembus/ui`.**

## Consequences

- **Easier:** a malformed swimlane is now caught at save time (the guard blocks it) and at
  validate/render; authors discover `status`/`note`/`refs` from the scaffolder hint + spec; a
  workflow step is a navigable hub into the decisions/features it realizes.
- **Harder / costs:** four entity-construction sites (`loadEntities`, `guard.decide`,
  `new-entity.entityFor`) must each populate `entity.workflow` — guarded by self-tests, but a
  real coupling. Dogfooding at `error` means a transiently-broken `to[]` blocks a mid-edit save
  (mitigated by keeping reachability/enum advisory, so only hard referential breaks block).
- **Neutral:** the emitted contract is byte-identical for ref-less steps, so the change is
  invisible until a step opts into `refs`.

## Options considered

- **Validate via a JSON Schema for the block** — rejected: the framework is zero-dep and
  hand-rolls validation; a schema validator is a dependency, and referential/reachability checks
  aren't expressible in JSON Schema anyway.
- **Put swimlane validation in the base schema** — rejected: the base contract is frontmatter
  only; the body is convention. Validation belongs in config, gated on `carriesSwimlanes`, so a
  consumer with no swimlane kind gets nothing new (domain-neutrality preserved).
- **Replace the kit inspector** — rejected: it throws away an accessible surface and couples us
  to the kit's internal class names. Augmenting costs nothing.
- **Extend `@trembus/ui` `SwimlaneStep` with a native `refs` field** — deferred: everything is
  achievable app-side; a kit bump is only warranted if a second consumer needs in-kit ref
  rendering.

## Cites

- [0004](0004-pipeline-entities-carry-a-structured-workflow-block.md) — the structured workflow block this governs.
- [0005](0005-window-run-history-in-the-contract-sidecar-at-scale.md) — per-step `status` as a run-outcome concept (why definitions don't fabricate it).
- [0006](0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md) — `workflow` as a first-class kind.
- `lib/swimlane.mjs`, `tools/validate.mjs` (`validateRel`), `tools/render-hub.mjs`, `apps/command-center/src/StepDetail.tsx`, `docs/spec/command-center-contract.md`.

## Re-open if

A swimlane needs richer authoring than a single JSON block (loops, conditionals, sub-flows); a
second consumer needs the kit to render refs natively (then extend `@trembus/ui` per option 4);
or per-step `refs` outgrow a flat `{ rel, target }` (e.g. needing inline glosses or external URLs).
