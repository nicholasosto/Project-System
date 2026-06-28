---
title: "Derive the Field Guide from the config, not authored prose"
status: accepted
updated: 2026-06-28
---

# Derive the Field Guide from the config, not authored prose

> **Status:** accepted (2026-06-28)

## Context

New collaborators — and the owner returning after a gap — had no in-product way to learn how the
system is structured and named; only `CLAUDE.md` + `docs/spec/schema.md`. A hand-authored doc-tree
would immediately drift from the real conventions, which is exactly what this framework exists to
prevent.

## Decision

The Command Center's **Field Guide** tree is **derived from the config + base schema**, not authored
prose. The `_project/` subtree is one node per declared kind, with facts (filename scheme, status
enum, sections) pulled from `ctx`; the relation/primitive concept nodes come from the base schema +
`relTargetKinds`. Only the **fixed framework anatomy** (`schema/`·`lib/`·`tools/`·the two hooks) is
an authored gloss, in `tools/guide-anatomy.mjs`. `buildGuide(ctx)` composes them into a `guide`
payload emitted in `graph.json`.

## Consequences

Add a kind to a config and it appears in the guide automatically, with its real conventions — the
guide can't drift. Every consumer's guide reflects *its own* config for free (proven: the demo shows
`characters/`; the `core/` subtree is byte-identical across consumers). Cost: the authored anatomy
gloss must be updated when framework files are renamed, and the guide adds a bounded block to
`graph.json`.

## Options considered

- **A hand-authored markdown doc/tree** — drifts from reality the moment the config changes; rejected.
- **Parse `docs/spec/schema.md` at runtime** — brittle prose-parsing, the very thing the framework rejects in favor of structured config.
- **Put the anatomy gloss in each consumer config** — forces every adopter to copy framework boilerplate that never varies; rejected (kept it in framework-core as `guide-anatomy.mjs`).

## Cites

- `tools/render-hub.mjs` (`buildGuide`) · `tools/guide-anatomy.mjs`
- `docs/spec/command-center-contract.md` (`### guide`)

## Re-open if

The authored anatomy gloss becomes a maintenance burden, or a consumer needs project-specific
anatomy nodes the framework can't supply generically.
