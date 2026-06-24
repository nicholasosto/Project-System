# Project-System — Workspace

## What This Is

**Project-System** is a first-principles, **project-agnostic** framework for the planning
layer of *any* project: one contract — `ProjectEntity` — that every planning artifact
(decision, report, pipeline, roadmap, session) derives from, plus the zero-dependency
tooling that validates, scaffolds, guards, and renders it. It was extracted and
generalized from Soul-Steel-Official on 2026-06-24 (the place it was first built), and
now lives here as its own git repo so any project space can adopt it.

The whole thing reduces to three primitives: **Identity** (`kind`·`id`·`title`) ·
**State** (`status`·`updated`) · **Relation** (`links[]`). Everything else is an optional
`tags` facet. See [docs/spec/schema.md](docs/spec/schema.md) for the full reduction.

## The Core Split — framework-core vs project-config

This is the one architectural idea to hold onto:

- **Framework-core is universal** and identical across every consuming project: the base
  contract (`schema/project-entity.base.schema.json`), the parser + config loader
  (`lib/`), and the four engines (`tools/`). **No engine hard-codes a kind name, a folder,
  a status enum, or any domain word.**
- **Everything project-specific lives in one `project-system.config.json`** (validated by
  `schema/project-config.schema.json`): which kinds exist, their folders, per-kind status
  enums, body-section conventions, the tag registry, milestone markers, rel→kind target
  rules, and render metadata. The seam between the two is `lib/contract.mjs`
  (`loadContract` / `loadEntities`).

A consuming project supplies a config; the framework supplies everything else.

## Map (one-screen orientation)

| Path | What |
|---|---|
| `schema/project-entity.base.schema.json` | The universal contract (the 3 primitives + link/rel defs). The artifact a consumer mirrors; what the drift check compares against. |
| `schema/project-config.schema.json` | Meta-schema: validates a project's `project-system.config.json`. |
| `lib/md.mjs` | Zero-dep frontmatter/markdown parser (single source for all tools). |
| `lib/contract.mjs` | The seam: resolves `{root, config}`, composes base+config into `ctx`, loads the `_project/` tree. |
| `tools/validate.mjs` | The validator + `validateEntity` (the single check, reused by the other three). |
| `tools/new-entity.mjs` | The scaffolder behind `/new-{decision,report,pipeline,roadmap}`. |
| `tools/guard.mjs` | PreToolUse guard — blocks any `_project/` write that would break the contract. |
| `tools/render-hub.mjs` | Hub-dashboard renderer. **Contains the *only* line that names the kit's legacy hex-slot vocabulary** (`KIT_HEX_SLOTS`, quarantined). |
| `tools/check-consumer-drift.mjs` | The packaging discipline: asserts each consumer mirrors the canonical contract. |
| `project-system.config.json` | The framework's **own** config — it dogfoods on its own `_project/`. |
| `examples/soul-steel.config.json` | A real consumer config; proves project-agnosticism by reproducing Soul-Steel's baseline. |
| `_project/` | The framework's own planning artifacts (dogfood: decisions, report, roadmap, pipeline, session). |
| `previews/dashboards/` | Generated hub dashboard (`project-system-hub.html`). |
| `docs/spec/schema.md` | The canonical spec + first-principles provenance. |

## Using it in another project

1. Drop a `project-system.config.json` at the project root (copy `examples/soul-steel.config.json`
   and edit the kinds/enums/sections/registry/milestones).
2. Run the engines against it:
   `node <path-to-framework>/tools/validate.mjs --root <project> --config <project>/project-system.config.json`.
3. Wire the guard as a `PreToolUse` (`Write|Edit`) hook and copy the `/new-*` commands
   (see this repo's `.claude/`).
4. Register the project in `tools/check-consumer-drift.mjs` so the mirror stays honest.

## Conventions

- **Domain-neutral.** The framework carries **zero** project/domain vocabulary in config,
  schema, contract, or docs. The visual-grammar kit's hub view happens to name its hex
  slots after Soul-Steel domains; that vocabulary is **quarantined to one commented line**
  (`KIT_HEX_SLOTS` in `tools/render-hub.mjs`) and never leaks upward. See
  [_project/decisions/0003-…](_project/decisions/0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter.md).
- **Zero runtime dependencies.** Plain Node ESM, Node ≥18. Planning spaces stay npm-free.
- **Single source, no re-implementation.** Exactly one check (`validateEntity`); the
  scaffolder, guard, and renderer all reuse it via `lib/contract.mjs`. Never re-derive the
  shape in a second place.
- **`id`/`kind` are derived, never authored** — `kind` from the folder, `id` from the
  filename. The authored surface is just `title`/`status`/`updated` (+ optional `links`/`tags`).
- **prose ↔ frontmatter.** The leading word of a doc's `**Status:**` header must agree with
  its frontmatter `status` (severity per `proseStatusEnforcement.rollout`).
- **Self-tests are the contract on the tooling.** Every engine has `--self-test`; run
  `npm test` (validator + scaffolder + guard). Keep them green.

## Packaging status

Per [_project/decisions/0002-…](_project/decisions/0002-mirror-the-contract-with-a-ci-check-before-publishing.md):
the contract is **mirrored with a drift check**, not yet published. 2 consumers today
(Soul-Steel + this dogfood). When a **3rd** independent consumer adopts it, publish
`@trembus/project-schema` and switch consumers to installing it. Run
`node tools/check-consumer-drift.mjs` before relying on a consumer's copy.

## Dogfooding

This repo eats its own cooking: its planning lives in `_project/` and validates against
its own `project-system.config.json`. `node tools/validate.mjs` must be green; the hub at
`previews/dashboards/project-system-hub.html` is generated by `tools/render-hub.mjs`.
