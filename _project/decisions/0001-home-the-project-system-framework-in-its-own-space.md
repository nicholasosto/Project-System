---
title: "Home the project-system framework in its own space"
status: accepted
updated: 2026-06-24
---

# Home the project-system framework in its own space

> **Status:** accepted (2026-06-24)

## Context

The `ProjectEntity` contract + its tooling (validator, scaffolder, guard, hub renderer)
were built *inside* Soul-Steel-Official over 2026-06-24 (commits `e4e18fd`→`4d9078f`,
phases A–E). The design is project-agnostic — one contract, three primitives, derived
renderers — but it lived in a game repo, so it couldn't be reused and its identity was
conflated with Soul-Steel's. Extraction is also the event the spec anticipated as the
trigger for the distribution decision (`schema.md` §8 #4: "the upcoming extraction to a
dedicated Project-System space is the event that introduces the first out-of-repo
consumer").

## Decision

House the framework in a **dedicated top-level Project-Space**,
`Project-Spaces/Project-System`, with its **own git repo**. It owns the canonical base
contract and the project-agnostic engines; consuming projects supply a
`project-system.config.json`.

## Consequences

- **Easier:** independent versioning; a clean project-agnostic identity; multiple
  consumers (Soul-Steel today, any space tomorrow); the framework dogfoods on its own
  `_project/`.
- **Harder:** a cross-repo dependency on the visual-grammar kit (path-referenced via
  `render.kit`, degrades gracefully if absent); Soul-Steel becomes a *consumer* of a
  contract it used to own (managed by [[0002-mirror-the-contract-with-a-ci-check-before-publishing]]).

## Options considered

- **Adjacent to the kit under `LLM-Agent-Development/canonical/`** — rejected: that space
  is *not* git-tracked, so it can't give the framework "its own repo"; and the framework
  core (contract + validator + scaffolder + guard) is render-agnostic — strictly broader
  than the one kit it happens to render through.
- **Keep it in Soul-Steel** — rejected: not reusable; identity conflated with a game.
- **A `packages/` entry in a TS monorepo** — deferred: premature until publishing
  (see [[0002-mirror-the-contract-with-a-ci-check-before-publishing]]).

## Cites

- [schema.md §8 #4](../../docs/spec/schema.md)
- Soul-Steel commits `e4e18fd`, `e6fe519`, `828bead`, `4d9078f`

## Re-open if

A consumer needs the framework delivered as an installed npm package — then the home is
revisited as a published package rather than a path-referenced space.
