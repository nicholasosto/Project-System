# Project-System — Workspace

## What This Is

**Project-System** is a first-principles, **project-agnostic** framework for the planning
layer of *any* project: one contract — `ProjectEntity` — that every planning artifact
(decision, report, pipeline, roadmap, session, workflow) derives from, plus the zero-dependency
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
| `tools/validate.mjs` | The validator + `validateEntity` (the single check, reused by every other engine). |
| `tools/new-entity.mjs` | The scaffolder behind the single `/new <kind>` command (kind ∈ config.kinds); `--tag key=value` sets registered tags. |
| `tools/init-config.mjs` | Generates a born-valid `project-system.config.json` from a spec/`--preset` (proven to load via `lib/contract.mjs` before writing); the engine behind the consumer `setup-project-system` skill. |
| `tools/guard.mjs` | PreToolUse guard — blocks any `_project/` write that would break the contract. |
| `tools/render-hub.mjs` | Emits the Command Center's JSON contract (`graph.json` + `hub.json`) — incl. the `guide` tree (Field Guide) and per-entity `tags`. **Contains the *only* line that names the kit's legacy hex-slot vocabulary** (`KIT_HEX_SLOTS`, quarantined). |
| `tools/guide-anatomy.mjs` | Authored gloss data for the Field Guide's framework-anatomy nodes (`schema/`·`lib/`·`tools/`·hooks); the derived `_project/` + concept nodes come from the config. |
| `tools/check-consumer-drift.mjs` | The packaging discipline: asserts each consumer mirrors the canonical contract. |
| `project-system.config.json` | The framework's **own** config — it dogfoods on its own `_project/`. |
| `examples/soul-steel.config.json` | A real consumer config; proves project-agnosticism by reproducing Soul-Steel's baseline (the byte-faithful mirror the drift check runs against the live Soul-Steel project). |
| `examples/soul-steel-demo/` | A **demo/fixture consumer** (config declares `"demo": true`) — NOT dogfood. A *fictional* Soul-Steel that adds `character` + `workflow` domain kinds the core has never seen; the test bed for consumer-shaped `/new`, validate, and drift. Its `_project/` is fixture data, not real planning. |
| `_project/` | The framework's own planning artifacts — **the dogfood, the only real planning surface in this repo** (decisions, report, roadmap, pipeline, session, workflow, feature). Contrast `examples/*/_project/`, which is fixture data. |
| `previews/dashboards/` | The emitted JSON contract (`project-system-graph.json` + `project-system-hub.json`) the live Command Center renders. |
| `docs/spec/schema.md` | The canonical spec + first-principles provenance. |

## Using it in another project

1. **Vendor** this framework verbatim into a reserved `.project-system/` at the project root
   (`schema/`, `lib/`, `tools/`). Never edit or rename a file inside it — updating = re-copy the folder.
2. **Author** `project-system.config.json` at the project root — the *only* project-specific file you write.
   Prefer the generator over hand-copying: `node .project-system/tools/init-config.mjs --preset standard
   --project <slug>` writes a valid starter config (the canonical six kinds), or pipe a `--spec` to add/override
   kinds. It proves the config loads through `lib/contract.mjs` before writing, so it's born valid. The bundled
   `setup-project-system` skill runs the naming-convention interview and drives this tool for a **greenfield**
   project; for a project that **already has planning material** (docs, ADRs, a roadmap), the
   `migrate-project-space` skill instead *infers* the config + an initial entity set from that evidence and feeds
   the same generator. (You can still copy `examples/soul-steel.config.json` and edit by hand if you prefer.)
3. **Copy** `templates/consumer/.claude/` into the project (`settings.json` + `commands/new.md` +
   `skills/`). Don't edit it — the wiring is domain-neutral and identical for every
   consumer: a blocking `PreToolUse` guard plus an advisory `SessionStart` health summary, both pointing at
   `.project-system/tools/…` via `$CLAUDE_PROJECT_DIR`.
4. **Register** the project in `tools/check-consumer-drift.mjs` (add `schema`/`root`/`config`, plus a
   `claudeDir` to opt into the hook-parity axis) so the mirror — schema, validator, **and** hooks — stays honest.
5. **Verify:** `node .project-system/tools/check-consumer-drift.mjs` (or `npm test` from the framework).

Run the engines directly any time with `node .project-system/tools/validate.mjs --root . --config ./project-system.config.json`.
The single generic `/new <kind>` command is canonical — the scaffolder validates the kind against your config,
so there are no per-kind commands to hand-maintain.

## Conventions

- **Domain-neutral.** The framework carries **zero** project/domain vocabulary in config,
  schema, contract, or docs. The hub's hex slots carry legacy Soul-Steel domain names for
  historical reasons (the live `@trembus/ui` `Hub` renders them unchanged); that vocabulary
  is **quarantined to one commented line** (`KIT_HEX_SLOTS` in `tools/render-hub.mjs`) and
  never leaks upward. See
  [_project/decisions/0003-…](_project/decisions/0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter.md).
- **Zero runtime dependencies.** Plain Node ESM, Node ≥18. Planning spaces stay npm-free.
- **Single source, no re-implementation.** Exactly one check (`validateEntity`); the
  scaffolder, guard, and renderer all reuse it via `lib/contract.mjs`. Never re-derive the
  shape in a second place.
- **`id`/`kind` are derived, never authored** — `kind` from the folder, `id` from the
  filename. The authored surface is just `title`/`status`/`updated` (+ optional `links`/`tags`).
- **prose ↔ frontmatter.** The leading word of a doc's `**Status:**` header must agree with
  its frontmatter `status` (severity per `proseStatusEnforcement.rollout`).
- **Two hooks, no more.** The contract is enforced by exactly two Claude Code hooks (see
  `.claude/settings.json` and `templates/consumer/.claude/settings.json`): a **blocking**
  `PreToolUse(Write|Edit)` guard (`tools/guard.mjs` — the only hook that can block; exit 2 +
  reason, read-only, fails open) and an **advisory** `SessionStart` health summary
  (`validate.mjs --summary`, always exit 0 — surfaces ambient drift the per-write guard can't
  see). Rendering is **not** a hook — it's the Command Center's Vite dev plugin. Consumers
  **vendor verbatim and never rename**; the drift check's hook-parity axis fails any rename/fork.
- **Self-tests are the contract on the tooling.** Every engine has `--self-test`; run
  `npm test` (validator + scaffolder + guard + consumer-drift, incl. the hook-parity axis). Keep them green.

## Packaging status

Per [_project/decisions/0002-…](_project/decisions/0002-mirror-the-contract-with-a-ci-check-before-publishing.md):
the contract is **mirrored with a drift check**, not yet published. 2 consumers today
(Soul-Steel + this dogfood). When a **3rd** independent consumer adopts it, publish
`@trembus/project-schema` and switch consumers to installing it. Run
`node tools/check-consumer-drift.mjs` before relying on a consumer's copy.

## Dogfooding

This repo eats its own cooking: its planning lives in `_project/` and validates against
its own `project-system.config.json`. `node tools/validate.mjs` must be green; the JSON
contract in `previews/dashboards/` is emitted by `tools/render-hub.mjs` and rendered live by
the Command Center (`apps/command-center`).

**Dogfood vs demo — don't confuse them.** Repo-root `_project/` is the dogfood: the framework's
*actual* planning, and the only tree the Command Center renders. Everything under `examples/*/`
is a *fixture consumer* — `examples/soul-steel-demo/` is a fictional Soul-Steel used to test
consumer-shaped `/new`/validate/drift, and its `_project/` entities are demo data, not real
work. The machine-readable signal is `"demo": true` in a consumer's config (see
`schema/project-config.schema.json`); `tools/check-consumer-drift.mjs` derives demo-ness from it
to keep demos out of the publish-trigger count. When adding planning, write to root `_project/`;
only touch `examples/soul-steel-demo/_project/` when you mean to extend the fixture.
