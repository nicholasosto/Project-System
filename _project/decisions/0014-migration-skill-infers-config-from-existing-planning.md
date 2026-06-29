---
title: "Adopt existing projects by inference with a migration skill"
status: accepted
updated: 2026-06-29
links:
  - { rel: references, target: decisions/0009-born-valid-config-generator }
  - { rel: references, target: decisions/0006-workflow-as-a-first-class-kind-distinct-from-pipeline }
---

# Adopt existing projects by inference with a migration skill

> **Status:** accepted (2026-06-29)

## Context

The two existing on-ramps both assume a **blank slate**: `init-config.mjs --preset standard`
stamps the canonical six kinds, and the [setup-project-system](../../templates/consumer/.claude/skills/setup-project-system/SKILL.md)
skill runs an interview that asks the human *"what does your project plan?"* But the common adoption
case is not greenfield — it's a project that **already encodes its planning conventions implicitly**:
a `docs/adr/` tree with `NNNN-` numbering, a `ROADMAP.md` with phases, dated session notes, TODO
logs, a README with a status table. Today the human must *re-derive* all of that from scratch into an
interview, discarding evidence that's sitting in the repo. This is exactly the migration that was done
**by hand** when this framework was extracted from Soul-Steel — proof the work is real, repeatable, and
worth tooling. The gap: an **evidence-driven** on-ramp — *discover, don't invent*.

## Decision

Add a sibling consumer skill, `migrate-project-space`, that **infers** a starting config and an
initial entity set from a project's existing planning material, then routes everything through the
**existing** engines. The judgment→skill / determinism→tool split established in
[0009](0009-born-valid-config-generator.md) is the load-bearing constraint:

1. **The inference lives in the skill (an agent), never in `tools/`.** Mapping `docs/adr/` → a
   `decision` kind, or `Status: accepted` prose → an entity status, is heuristic judgment. Putting it
   in a deterministic engine would smuggle domain vocabulary into the neutral core — the one invariant
   the whole repo is organized around. So the skill scans with Glob/Grep/Read and *proposes*; the core
   stays untouched (**no change to `schema/`, `lib/`, or `tools/`**).
2. **It composes, it does not fork.** The skill's only outputs are (a) a spec piped to
   `init-config.mjs --dry-run`, and (b) entities scaffolded via `new-entity.mjs`. Both already prove
   conformance before writing, so the migration never emits an un-validated artifact and never
   re-derives the contract shape (*single source* preserved).
3. **Propose, never write blind.** Inference is lossy, so every proposal — the config and each
   migrated entity — is previewed for the human, who owns the result. The skill transcribes evidence
   into scaffolded sections; it does not invent planning.

The three things the owner asked to recover map onto existing kinds, which is why no contract change
is needed: entity types → `kinds` (folder/status/filename inferred from observed naming); workflows →
`workflow` entities; progress/pipeline plan & status → `pipeline`/`roadmap` entities with inferred
`status`.

## Consequences

- **Easier:** adopting in a project with existing planning becomes "review a populated draft" instead
  of "answer a blank interview"; the evidence in the repo is captured rather than discarded; the
  Soul-Steel extraction becomes a repeatable, reviewable flow.
- **Harder / costs:** the skill carries heuristics (naming → filename scheme, headings → sections,
  lifecycle words → status enum) that are inherently fuzzy — mitigated by routing through the
  born-valid generators and confirming per-cluster, but the human must still review. A new
  consumer-template artifact joins `setup-project-system` (additive — the drift check compares only
  hooks, so parity is unaffected; see [0009](0009-born-valid-config-generator.md)).
- **Neutral:** greenfield adoption is unchanged — this skill explicitly defers to the preset /
  `setup-project-system` when there's no existing planning to mine.

## Options considered

- **A deterministic `tools/scan-space.mjs` that classifies artifacts** — rejected for now: a core
  engine that names "this is a decision" breaks domain-neutrality. If reproducible, self-testable
  evidence-gathering is later wanted, a *neutral* inventory tool (folder histogram, filename-pattern
  frequency, frontmatter-key counts — zero interpretation) could feed the skill, with the mapping
  still in the agent. Deferred until that need is real.
- **A new mode/branch of `setup-project-system`** — rejected: the discovery flow (scan → cluster →
  propose-per-cluster → migrate entities → snapshot pipeline) is substantial enough to own its
  SKILL.md, and folding it in would bloat the focused interview skill. The two share the *same*
  `init-config` tail.
- **Migrate entities by writing `_project/` files directly** — rejected: it bypasses the single
  born-valid scaffolder and re-implements the shape. All entity creation goes through `new-entity.mjs`.

## Cites

- [0009](0009-born-valid-config-generator.md) — the born-valid generator + `setup-project-system` this extends; the judgment→skill / determinism→tool split.
- [0006](0006-workflow-as-a-first-class-kind-distinct-from-pipeline.md) — `workflow` as a first-class kind the migration can populate.
- `templates/consumer/.claude/skills/migrate-project-space/SKILL.md` — the skill this decision adds.
- `templates/consumer/.claude/skills/setup-project-system/SKILL.md` · `tools/init-config.mjs` · `tools/new-entity.mjs` — the engines it composes.

## Re-open if

The inference proves too lossy to be useful (then add the neutral `scan-space.mjs` inventory and/or a
golden-output test against pre-migration Soul-Steel), or a consumer needs migration to *write* config
shapes `init-config.mjs` can't yet generate (then extend the generator, not the skill).
