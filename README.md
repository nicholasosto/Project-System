# @trembus/project-system

A first-principles, **project-agnostic** framework for the planning layer of any project.
Every planning artifact — a decision, report, pipeline, roadmap, or session — is one
**`ProjectEntity`**, reduced to three primitives:

> **Identity** (`kind` · `id` · `title`) — **State** (`status` · `updated`) — **Relation** (`links[]`)

…with everything else an optional `tags` facet. One contract feeds the validator, the
scaffolder, the save-time guard, and the dashboard renderer — so they can't drift.

Zero runtime dependencies. Node ≥ 18. Planning spaces stay npm-free.

## Architecture

```
schema/project-entity.base.schema.json   ← universal contract (identical for every project)
        +
<project>/project-system.config.json     ← the ONLY project-specific file (kinds, enums,
                                            sections, tag registry, milestones, render)
        ↓  composed by lib/contract.mjs into one `ctx`
tools/{validate,new-entity,guard,render-hub}.mjs   ← project-agnostic engines
```

No engine hard-codes a kind, a folder, an enum, or a domain word. Swap the config, point
the same engines at a different project.

## Quickstart (this repo dogfoods itself)

```bash
npm test                      # validator + scaffolder + guard self-tests
node tools/validate.mjs       # validate this repo's own _project/ graph
node tools/new-entity.mjs decision "Adopt X over Y"   # scaffold a conformant ADR
node tools/render-hub.mjs     # regenerate the Command Center's JSON contract (graph + hub)
```

## Use it in another project

```bash
# 1. copy a config and edit the kinds/enums/sections to taste
cp examples/soul-steel.config.json /path/to/my-project/project-system.config.json

# 2. run the engines against it
node tools/validate.mjs --root /path/to/my-project \
                        --config /path/to/my-project/project-system.config.json

# 3. (optional) wire the guard as a PreToolUse Write|Edit hook and copy .claude/commands/
# 4. register the project in tools/check-consumer-drift.mjs
```

## Packaging

The contract is **mirrored with a CI drift check**, not yet published — there are 2
consumers and the threshold to publish `@trembus/project-schema` is 3. Run
`node tools/check-consumer-drift.mjs` to verify every consumer still mirrors the canonical
contract (structurally and behaviorally).

## Docs

- [docs/spec/schema.md](docs/spec/schema.md) — the contract + the first-principles reduction.
- `_project/decisions/` — the architecture decisions (home, packaging, kit-slot quarantine).
- [CLAUDE.md](CLAUDE.md) — conventions + agent guidance.
