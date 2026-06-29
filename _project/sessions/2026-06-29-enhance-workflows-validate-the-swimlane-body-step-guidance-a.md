---
title: "Enhance workflows — validate the swimlane body, step guidance, and graph links"
status: completed
updated: 2026-06-29
links:
  - { rel: references, target: decisions/0013-validate-the-swimlane-body-and-let-steps-reference-the-graph }
  - { rel: references, target: workflows/authoring-loop }
  - { rel: references, target: workflows/instantiate-a-new-project-system-project }
---

# Enhance workflows — validate the swimlane body, step guidance, and graph links

> **Status:** completed (2026-06-29)

## Goal

Address the report that workflow steps were "minimally stated, with little guidance when
clicked" — and, more broadly, close the gap between the rich `@trembus/ui` swimlane model and the
framework's thin authoring/validation/UI of it. First of a planned series examining each
subcomponent of the system.

## Success Criteria

- A malformed `## Workflow` block (dangling `step.to`, unresolved `lane`, dup id) is **caught**
  by `validateEntity` and **blocked** by the guard — gated on `carriesSwimlanes`, domain-neutral.
- Clicking a step shows real guidance (note + status) and **clickable cross-links** to the
  decisions/features it references.
- Zero new runtime deps; one swimlane check reused everywhere; base schema untouched.
- All gates green: `npm test` (incl. a new `lib/swimlane.mjs --self-test`), dogfood `validate`
  at `error`, `render-hub --check` in sync, `verify-contract`, `tsc --noEmit`, live preview.

## Source References

- [0013](../decisions/0013-validate-the-swimlane-body-and-let-steps-reference-the-graph.md) — the architectural decision.
- `lib/swimlane.mjs` (new) · `tools/validate.mjs` (`validateRel`) · `tools/render-hub.mjs` · `apps/command-center/src/{StepDetail.tsx, WorkflowConsole.tsx, App.tsx, contract.ts}` · `docs/spec/command-center-contract.md`.

## Decisions

- **D1** — validate the swimlane body via a config-gated extension of the single `validateEntity`
  check; parse the block once at load into `entity.workflow`. → [0013](../decisions/0013-validate-the-swimlane-body-and-let-steps-reference-the-graph.md).
- **D2** — a step may carry `refs:[{rel,target}]`, validated like entity `links` (one `validateRel`).
- **D3** — augment (not replace) the kit inspector with an app-side step-detail drawer; no kit fork.
- **D4** *(no formal ADR)* — definitional workflows don't fabricate per-step `status` (it's a
  run-outcome concept per [0005](../decisions/0005-window-run-history-in-the-contract-sidecar-at-scale.md)); they backfill `note` instead.

## Outputs

Shipped to `main` in five commits:

1. **Layer 0** — richer `## Workflow` scaffold hint (status/detail/note) in config + `init-config`; fixed the stale spec; backfilled `note` on both real workflows.
2. **Layer 1** — `lib/swimlane.mjs` (`validateSwimlane` + moved `fencedJson`) wired into `validateEntity` gated on `carriesSwimlanes`; `swimlaneEnforcement.rollout` + `swimlaneLaneKinds` config/schema; self-tests across every engine; render-hub reads `entity.workflow` (byte-identical output).
3. **Layer 2a** — `StepDetail.tsx` drawer on the Workflows tab via the kit `Swimlane`'s `onSelect`.
4. **Layer 2b** — per-step `refs` cross-links: `validateRel` reuse, render-hub denormalization to `{rel,target,title,kind}`, `verify-contract` resolution check, drawer renders clickable refs, `App.navigateToEntity` routes to the target's tab; backfilled three refs.
5. **Record** — this session + ADR 0013.

## Blockers

- None.

## Next Action

Continue the subcomponent review series — the natural next targets are the **decision** kind
(supersession chains, the ADR ledger) or the **run history** sidecar ([0005](../decisions/0005-window-run-history-in-the-contract-sidecar-at-scale.md), Phase 3) that would
populate per-step `status` for real.

## Handoff Notes

`swimlaneEnforcement` defaults to `warn` for consumers; this repo dogfoods `error`. The four
entity-construction sites (`loadEntities`, `guard.decide`, `new-entity.entityFor`) must each
populate `entity.workflow` — self-tests guard this. The kit was **not** forked; a native kit
`refs` field is the documented escalation if a second consumer needs in-kit ref rendering. All
work is on `main`; the Command Center runs via `vite dev` (live reload).
