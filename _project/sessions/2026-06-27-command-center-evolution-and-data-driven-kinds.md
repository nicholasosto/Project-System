---
title: "Command Center evolution and data-driven kinds"
status: completed
updated: 2026-06-27
links:
  - { rel: references, target: decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline }
  - { rel: references, target: decisions/0007-derive-kind-presentation-from-the-contract }
  - { rel: references, target: roadmap/command-center }
---

# Command Center evolution and data-driven kinds

> **Status:** completed (2026-06-27)

## Goal

Evolve the Command Center into a config/contract-driven surface, and take the framework's
"supply a config, the framework supplies everything else" promise all the way to the dashboard —
so adding an entity kind is frictionless.

## Success Criteria

- The hub surfaces the project's Claude Code **control surface** (commands · workflows · hooks),
  not only entity kinds.
- `/new` is **one** config-driven command; every kind (incl. `session`) scaffolds born-valid.
- A reusable workflow lives as `_project/` **data**, not app code.
- Adding a new kind needs **zero `.ts`/`.tsx` edits** — proven, not asserted.
- All gates green: `npm test`, consumer drift, `tsc --noEmit`, `render-hub --check`, `verify-contract`.

## Source References

- [0006](../decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md) · [0007](../decisions/0007-derive-kind-presentation-from-the-contract.md) — the architectural decisions.
- [roadmap/command-center](../roadmap/command-center.md) — the surface this advances.
- `docs/spec/command-center-contract.md` — the emitted contract (`tone` / `swimlaneKinds` / `nav`).
- `tools/render-hub.mjs` · `lib/contract.mjs` · `apps/command-center/src/{App.tsx, contract.ts, workflows.ts}`.

## Decisions

- **D1** — `workflow` is a first-class kind, distinct from `pipeline` (a reusable *template* vs a
  stateful delivery *instance*). → [0006](../decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md).
- **D2** — kind presentation (tone · nav · swimlane-carrier) is **derived from the contract**;
  adding a kind = config + folder, zero app edits. → [0007](../decisions/0007-derive-kind-presentation-from-the-contract.md).
- **D3** *(no formal ADR)* — the hub's three **control-surface tiles** (Commands · Workflows ·
  Hooks) replace two kind petals + the Triad, via a curated `render.hex` layout.
- **D4** *(no formal ADR)* — the four `/new-<kind>` commands collapse into one config-driven
  `/new <kind>` (closing the missing `/new session` and fixing the folder-mkdir bug).

## Outputs

- **Hub:** control-surface facet tiles (Commands · Workflows · Hooks) + right-side details drawer.
- **`/new`:** [.claude/commands/new.md](../../.claude/commands/new.md) replaces 4 per-kind files; `new-entity.mjs` now `mkdir`s the folder.
- **`workflow` kind** + [`_project/workflows/authoring-loop.md`](../workflows/authoring-loop.md) — the authoring loop migrated out of the app (0004 fully realized).
- **Data-driven app:** `render-hub` emits `byKind.<k>.tone` + top-level `swimlaneKinds` + `render.nav`; the app derives tone/nav/carrier from the contract.
- **Schema:** `carriesSwimlanes`, `render.tone`, `render.nav`, and the previously-undocumented `sectionHints` now in the meta-schema.
- **This record:** ADRs 0006/0007 + this session + the roadmap acknowledgment.

## Blockers

- None.

## Next Action

Rename the `pipeline` kind (the CI/CD-collision concern flagged at the start of the session) —
now *safe* because the process-shape was extracted into `workflow`. Touches the folder, config,
and the existing pipeline entity.

## Handoff Notes

Three follow-ups are deliberately deferred (see 0007 *Out of scope*): (1) the `pipeline` rename
above; (2) a trivial `/new-kind` wrapper — now just "append config stanza + `mkdir`" since the
app is data-driven; (3) a read-only `--check` lint that flags a half-wired kind. The
[migrate-soul-steel](../roadmap/migrate-soul-steel-to-consume-the-packaged-framework.md) roadmap
remains the path to a 3rd consumer, which is the trigger to publish `@trembus/project-schema`.
All work is committed to `main`; the dashboard runs via `vite dev` (live reload), so editing any
`_project/` file repaints it.
