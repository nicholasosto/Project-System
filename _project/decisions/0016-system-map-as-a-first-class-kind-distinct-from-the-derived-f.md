---
title: "System-map as a first-class kind, distinct from the derived framework-anatomy map"
status: proposed
updated: 2026-07-01
links:
  - { rel: references, target: decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline }
  - { rel: references, target: decisions/0008-field-guide-derived-from-config }
  - { rel: references, target: features/command-center-system-map }
---

# System-map as a first-class kind, distinct from the derived framework-anatomy map

> **Status:** proposed (2026-07-01)

## Context

The Command Center grew a **system-map view** ([[command-center-system-map]]) — a C4-style architecture
diagram via `@trembus/viz` `SystemMap`, authored in `apps/command-center/src/systemMap.ts` and rendered
in the Overview. Standing it up surfaced two problems and one realization:

1. **It's a hand-authored duplicate of framework anatomy the framework already owns.** `tools/guide-anatomy.mjs`
   is the single authored source of the framework's parts (schema/ · lib/ · tools/ · hooks), emitted by
   `render-hub` into the Field Guide. `systemMap.ts` re-states the same parts by hand — the exact
   static-projection drift the framework exists to kill (the Soul-Steel command-center migration, ADR 0002).
2. **It's app-local and Project-System-specific.** A consumer (Asset-Studio, Soul-Steel) has no way to
   author a map of *its own* subsystems, and no `/new` path to one.
3. **A system map and the Field Guide are the same model in two grammars.** The Guide draws the anatomy as
   a *tree* (containment); the map draws it as a *graph* (containment + reference/flow). Per the vault
   synthesis ([[Architecture Zoom as Spatial Cognition]], [[Primitives as Color-Coded Ontology]]), the
   right visual form is chosen by the data's dominant relation — so these are two projections of one source,
   not two sources.

So: is "system map" one thing or two, and how does it enter the contract rather than living as an app blob?

## Decision

Split it into two, each to its right home — and make the authored half a **first-class kind, a sibling of
`workflow`** (ADR 0006).

1. **Introduce a `system-map` kind.** Folder `system-maps/`, status `draft → active → deprecated`,
   `filename: slug`. Its entities carry a `## Map` fenced-JSON `SystemMapContract` block — exactly as
   `workflow` carries a `## Workflow` swimlane (ADR 0004/0006). Add `carriesSystemMap: true` (parallel to
   `carriesSwimlanes`) and `render.systemMapSection` (default `"Map"`, parallel to `workflowSection`).
   `/new system-map "<title>"` scaffolds it born-valid with a starter `## Map` stub (a `sectionHints.Map`,
   like the Workflow hint). **This is the project-authored path** — a consumer maps its own subsystems.
2. **The framework's own anatomy map is derived, never authored.** Source it from `tools/guide-anatomy.mjs`
   (+ `ctx`) and emit it from `render-hub` alongside the guide, so it is universal (present in every
   consumer) and cannot drift from the Field Guide. **Retire `apps/command-center/src/systemMap.ts`.**
   (guide-anatomy gains a small authored `edges`/dataflow section — it currently encodes only the tree.)
3. **The System Map tab shows both** — the derived framework-anatomy map **plus** any authored `system-map`
   entities — symmetric with how the Field Guide shows framework anatomy **plus** the derived `_project/`
   surface (ADR 0008).

Validation reuses the single-check discipline: `render-hub`/`validate`/`guard` all call `validateSystemMap`
from a new `lib/systemmap.mjs` — never a second shape derivation (see Contract sketch).

## Consequences

- **Easier.** Consumers author architecture maps as *validated, graph-connected planning artifacts* (born
  valid, drift-checked, `/new`-able), not README diagrams. The framework's own map stops drifting from the
  Field Guide — one source (`guide-anatomy`). The "shape → grammar" discipline becomes first-class: tree =
  Guide, graph = Map, flow = Workflow, all projected from one contract. Generalizes to every consumer
  (Asset-Studio's asset-pipeline map is now a one-command entity).
- **Harder.** A second fenced-JSON body-contract + validator to maintain (`swimlane.mjs` **and**
  `systemmap.mjs`); `render-hub` grows a second extractor; the Command Center owns a new tab and a live
  `@trembus/viz` `SystemMap` dependency surface. Deriving the framework map means `guide-anatomy` must carry
  dataflow edges it doesn't today. **Watch the `carriesX`-boolean smell** — this is the *second* "kind
  carries a typed body block" (after `carriesSwimlanes`); a third should trigger a generalization (see
  Re-open if) rather than a `carriesZ`.

## Options considered

- **A `system-map` kind + a derived framework map (chosen).** Puts each half in its right home; matches the
  workflow precedent exactly.
- **Keep the hand-authored app blob (status quo).** Rejected — drifts from `guide-anatomy`/Field Guide,
  is app-local, has no consumer or `/new` path. The static-projection anti-pattern ADR 0002 exists to prevent.
- **Only derive the framework map; add no kind.** Rejected — gives the *framework* a map but leaves
  *consumers* unable to author their own; under-delivers the generalizes-to-every-consumer test and ignores
  the explicit `/new` requirement.
- **Only add the kind; leave the framework map hand-authored.** Rejected — leaves the drift duplicate in
  place and misses that the map and the Guide are one model.
- **Fold maps into the existing `workflow` kind** (a swimlane is already a graph). Rejected — conflates
  dominant relations: a swimlane encodes *causality/flow across lanes*; a system map encodes
  *containment + reference with drill-down*. Different grammar, reading, and validator. They are siblings,
  not the same kind (the vault's match-form-to-relation principle).

## Contract sketch (`lib/systemmap.mjs`)

Mirrors `lib/swimlane.mjs`. Validates a `SystemMapContract` (the `@trembus/viz` shape) via a single
exported `validateSystemMap(contract, ctx)` reused by every engine.

- **Shape.** `{ view?: 'system'|'c4', direction?: 'TB'|'LR'|'BT'|'RL', nodes[], edges[], ports?[] }`.
  - `node`: `{ id (unique), label, parentId?, kind?, tone?, color?, sub?, note?, icon?, refs? }`
  - `edge`: `{ from, to, label?, kind?, tone?, dashed? }`
  - `port`: `{ id (unique), nodeId, label, direction?: 'provided'|'required', tone? }`
- **Hard errors** (under `systemMapEnforcement.rollout: "error"`):
  - `nodes` and `edges` present as arrays; every node has a non-empty `id` + `label`; node ids unique.
  - `parentId`, `edge.from`, `edge.to`, `port.nodeId` each resolve to an existing node id.
  - no `parentId` cycle (a node cannot be its own ancestor).
  - port ids unique.
- **Advisory** (warning regardless): unknown `kind` (outside `system·container·component·actor·datastore·external`)
  or `tone`; orphan node (no parent, no incident edge); `view:'c4'` with zero container nodes.
- **Graph-connected nodes** (the powerful bit, ported from ADR 0013's step `refs`): a node MAY carry
  `refs: [{ rel, target }]`, authored and validated exactly like entity `links[]` / swimlane step refs, so a
  map node can point at the `_project/` entity it depicts (e.g. a "validate" node → `references:
  tools/…` is external, or → a decision/feature). `render-hub` denormalizes each ref with the target's
  title + kind, and the Command Center renders it as a click-through — the same treatment step refs get.
- **Config knobs**: `swimlaneLaneKinds` has an analog only if we constrain node kinds (probably leave node
  `kind` advisory-only); `systemMapEnforcement: { rollout }` defaults `warn`, mirroring `swimlaneEnforcement`.

## Cites

- [[0006-workflow-as-a-first-class-kind-distinct-from-pipeline]] — the sibling precedent (a graph-shaped kind).
- [[0004-pipeline-entities-carry-a-structured-workflow-block]] — fenced JSON in a body section, the mechanism reused.
- [[0013-validate-the-swimlane-body-and-let-steps-reference-the-graph]] — the model for `systemmap.mjs` + node `refs`.
- [[0007-derive-kind-presentation-from-the-contract]] · [[0008-field-guide-derived-from-config]] — the derive discipline the framework map follows.
- [[command-center-system-map]] — the view capability this decision governs (retires its `systemMap.ts` in favor of the derived source).
- Vault: [[Architecture Zoom as Spatial Cognition]], [[Primitives as Color-Coded Ontology]] — shape → visual-grammar projection.
- `@trembus/viz` `SystemMapContract` (0.3.0) — the render target.

## Re-open if

- A **third** kind wants to carry a validated fenced-JSON body contract (after swimlane + system-map):
  generalize `carriesSwimlanes`/`carriesSystemMap` into one **typed body-block registry** in the config
  (`bodyContracts: { Workflow: swimlane, Map: systemmap, … }`) rather than accreting `carriesX` booleans and
  parallel extractors.
- `guide-anatomy`'s authored dataflow edges grow past hand-maintainable size, or a consumer needs to
  override the (otherwise universal) framework-anatomy map.
- `SystemMap` leaves `@trembus/viz`, or its contract shape changes materially.
