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
npm test                      # all engine self-tests (validator · scaffolder · guard · consumer-drift) + checks
node tools/validate.mjs       # validate this repo's own _project/ graph
node tools/new-entity.mjs decision "Adopt X over Y"   # scaffold a conformant ADR
node tools/render-hub.mjs     # regenerate the Command Center's JSON contract (graph + hub)
```

## Use it in another project

```bash
# 1. vendor the framework verbatim into a reserved .project-system/ (never edit/rename inside it)
cp -R schema lib tools /path/to/my-project/.project-system/

# 2. generate the ONLY project-specific file: the config (born valid — proven to load before writing)
cd /path/to/my-project
node .project-system/tools/init-config.mjs --preset standard --project my-project
#    …or pipe a --spec to add/override kinds; or let the bundled `setup-project-system` skill
#    run the naming-convention interview and drive the tool. (Hand-copying an example still works too.)

# 3. copy the hook + command + skill wiring (identical for every consumer — don't edit it)
cp -R templates/consumer/.claude /path/to/my-project/.claude

# 4. register the project (with claudeDir) in tools/check-consumer-drift.mjs, then verify
node /path/to/my-project/.project-system/tools/check-consumer-drift.mjs
```

The `.claude/` template wires two hooks: a **blocking** `PreToolUse(Write|Edit)` guard that rejects any
`_project/` write breaking the contract, and an **advisory** `SessionStart` summary
(`validate.mjs --summary`) that surfaces the planning surface's health at session open. The single generic
`/new <kind>` command is canonical (no per-kind commands to maintain), and the `setup-project-system` skill
guides choosing a project's naming conventions and generating its config. The drift check's hook-parity axis
fails if a consumer renames a vendored tool or forks the wiring — so "copy the template" actually sticks.

## Packaging

The contract is **mirrored with a CI drift check**, not yet published — there are 2
consumers and the threshold to publish `@trembus/project-schema` is 3. Run
`node tools/check-consumer-drift.mjs` to verify every consumer still mirrors the canonical
contract (structurally and behaviorally).

## Docs

- [docs/spec/schema.md](docs/spec/schema.md) — the contract + the first-principles reduction.
- `_project/decisions/` — the architecture decisions (home, packaging, kit-slot quarantine).
- [CLAUDE.md](CLAUDE.md) — conventions + agent guidance.
