---
title: "Derive kind presentation from the contract"
status: accepted
updated: 2026-06-27
links:
  - { rel: references, target: roadmap/command-center }
---

# Derive kind presentation from the contract

> **Status:** accepted (2026-06-27)

## Context

The engine layer was always config-driven — adding the `workflow` kind
([0006](0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md)) needed **zero** engine
changes. But the Command Center app still hardcoded kind names in three places: `KIND_TONE`, the
`AREAS` nav + `AreaTable` calls, and `workflows.ts`'s `kind === 'workflow'`. So adding a kind
*did* mean editing `.ts` files — contradicting the framework's thesis, *"supply a config, the
framework supplies everything else."* The friction was never the config edit (declarative, by
design); it was app brittleness plus a latent bug (the scaffolder never `mkdir`'d a new kind's
folder).

## Decision

Make the app **derive kind presentation from the contract** rather than hardcode it.
`render-hub` now emits, per kind: a **`tone`** in each `byKind` bucket (mapped from the kind's
accent `render.dot` via a fixed hex→tone table; `danger` is reserved for errors and never
auto-assigned), a top-level **`swimlaneKinds`** (from config `carriesSwimlanes`), and a
**`render.nav`** passthrough. The app derives its tone lookup, the workflow-carrier set, and its
nav tabs from the contract — auto-generating a plain table tab per kind not claimed by a bespoke
panel. The three bespoke panels (Overview / Progress / Workflows) stay editorial. The scaffolder
now `mkdir`s the folder.

**Result: adding a kind = config stanza + folder + regenerate, with zero `.ts`/`.tsx` edits** —
proven by a throwaway `memo` kind that auto-tabbed with the correct `warning` tone and was then
reverted.

## Consequences

- **Easier.** A new kind is fully declarative; the contract is the single source the app reads
  (no second kind-list in the app). A dedicated kind-scaffolder, if ever built, shrinks to a
  trivial "append config stanza + mkdir" wrapper.
- **Harder.** `render-hub` (framework core, project-agnostic) now owns the hex→tone table and
  the default-nav policy; the bespoke panels name the kinds they consume via two editorial app
  constants (`PROGRESS_KINDS`, `WORKFLOW_TABLE_KINDS`). Per-kind facts are config; global
  presentation policy is framework code — the same split the framework already draws.

## Options considered

- **Build a config-mutating kind-scaffolder** — rejected as the primary fix: it would be the
  first tool to *mutate* the config (departing from the framework's "validate, don't mutate"
  ethos) and still can't auto-edit the app's editorial choices, so it would print a checklist
  anyway. The data-driven app makes it unnecessary.
- **Hash the kind name → tone** — rejected: arbitrary assignments (could land on `danger`) and
  ignores the authored `render.dot`.
- **Auto-generate the bespoke panels too** — rejected: Overview/Progress/Workflows compose
  multiple kinds + non-kind data (`ribbon`, `phases`, swimlanes); auto-generation loses meaning.
  Curation is genuinely better there.

## Cites

- [roadmap/command-center](../roadmap/command-center.md) — the surface this evolves.
- [0003](0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter.md) — the render-adapter discipline this extends.
- `docs/spec/command-center-contract.md` (the emitted `tone` / `swimlaneKinds` / `nav`) · `tools/render-hub.mjs` · `apps/command-center/src/{contract.ts, App.tsx, workflows.ts}`.

## Re-open if

Global presentation policy needs to vary per consumer beyond `render.dot` / `render.nav`, or the
bespoke-panel curation seams (the two app constants) start needing edits whenever a kind is added.
