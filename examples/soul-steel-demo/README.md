# `soul-steel-demo` — a fictional consumer (test bed)

A **self-contained example consumer** used to exercise the engines against a config the
framework has never seen — without touching the framework's own `_project/`. It is the home
for testing `/new <kind>` (and validation/guard/drift) from a *consumer's* point of view.

It deliberately adds **two domain kinds the framework core knows nothing about**:

- **`character`** — a pure domain kind (folder `characters/`, status `concept → draft → canon → retired`).
  Proves a brand-new kind scaffolds + validates with **zero engine changes** — the whole
  project-agnosticism claim, demonstrated.
- **`workflow`** — `carriesSwimlanes: true`, so `/new workflow` lays down the `## Workflow`
  swimlane stub from `sectionHints`.

…on top of the five baseline kinds (`decision · report · pipeline · roadmap · session`).

## Not the real Soul-Steel baseline

> This is a *demo*. The real Soul-Steel baseline lives at
> [`../soul-steel.config.json`](../soul-steel.config.json), retained **frozen** as a *pre-lifecycle*
> record: the shape the framework was generalized from, plus a worked hand-authored config. Soul-Steel
> **de-migrated on 2026-07-19**, so that config is no longer a registered drift-check consumer and no
> live Soul-Steel `_project/` stands behind it. Don't conflate the two: this demo is a *fictional*
> consumer, and the `character`/`workflow` kinds it adds were never in that baseline.

## Try it

```sh
# Preview only — writes nothing (the zero-footprint way to "see how it'd look"):
node ../../tools/new-entity.mjs character "Kael Drathmoor" \
  --config project-system.config.json --dry-run

# Scaffold for real into THIS demo's _project/ (never the framework's):
node ../../tools/new-entity.mjs workflow "Boss intro sequence" \
  --root . --config project-system.config.json

# Validate the demo tree:
node ../../tools/validate.mjs --root . --config project-system.config.json
```

`project-entity.schema.json` here is this consumer's mirrored copy of the canonical contract
core; `npm run check-drift` (from the repo root) compares it to the base schema and runs the
generalized validator against this tree — see `tools/check-consumer-drift.mjs`.
