---
title: "Manage a per-project context vault as a scoped KOS instance"
status: proposed
updated: 2026-06-28
---

# Manage a per-project context vault as a scoped KOS instance

> **Status:** proposed (2026-06-28)

## Context

Beyond *referencing* external brains (0011), a project may want its **own** scoped knowledge store —
a "context engine" for project-specific patterns, gotchas, and decision rationale — managed by the
planning layer rather than living in a separate full brain. **Status: proposed — a placeholder for
the concept; design + a prototype come before acceptance.**

## Decision

*(Proposed.)* Define a lightweight per-project **project-vault**: a *scoped* KOS instance (e.g.
`Concepts/`·`Circuits/`·`Reflexes/` only — no cognitive agents, dreams, or cortices) that the
planning layer creates and manages, linkable from entities. Effectively a new, minimal KOS *type*
tuned to a single project — the "context engine" the planning surface owns.

## Consequences

*(If accepted.)* A project carries durable, structured context next to its plan without standing up a
full brain. Open questions: the relationship to full brains (is there a promotion path?); who owns
the vault's lifecycle and where it lives; overlap with the owner's existing vaults; and whether this
belongs in project-system at all or in the KOS framework that defines `brain/v1.1`.

## Options considered

- **Use a full brain per project** — far heavier than a single project's context needs.
- **Keep context in entities + tags only** — no graph/relationship semantics for knowledge.
- **External brain reference only (0011)** — gives read context but no project-managed store.

## Options considered notes

This is the larger / more speculative of the two knowledge-layer ideas; 0011 (read-only external
reference) is the smaller, nearer-term sibling and may land first.

## Cites

- Sibling: 0011 (register a brain via read-only pointer).
- KOS `brain/v1.1` framework (the type this would specialize).

## Re-open if

Proposed — supersede with an accepted decision once the vault's type, lifecycle, and home are
designed and a prototype validates the value.
