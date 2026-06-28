---
title: "Register a brain via a read-only config pointer"
status: proposed
updated: 2026-06-28
---

# Register a brain via a read-only config pointer

> **Status:** proposed (2026-06-28)

## Context

The owner runs an ecosystem of "brains" — KOS `brain/v1.1` knowledge vaults (Obsidian graphs under
`Knowledge-Architectures/graphs/`, tracked in a registry, bound to plugins by symlink). A planning
project would benefit from that knowledge as *context*, but project-system is the planning layer and
brains are the knowledge layer; they must not merge. **Status: proposed — captures the direction; the
design is not yet built.**

## Decision

*(Proposed.)* Register a brain via a config-level **`brains[]` pointer** (`name · path · role ·
read-only`). Planning entities reference brain notes through the existing **`references`** rel with a
`<brain>/<folder>/<note>` target, resolved **read-only** in `lib/contract.mjs`; the Command Center
surfaces brain context beside an entity. The seam is a *pointer*, not embedding — planning and
knowledge layers stay separate.

## Consequences

*(If accepted.)* Planning gains knowledge context without owning it; the layers stay cleanly split.
Open questions: how the validator resolves cross-vault targets without coupling to a brain's internal
folder structure; the cost of reading external vaults at emit time; whether to support multiple
brains per project and how roles compose.

## Options considered

- **Embed brain notes as project entities** — couples the two layers and duplicates the vault; rejected.
- **Symlink-bind like the delivery-ops plugins** — works for skills, heavier and less declarative for a planning contract.
- **No integration** — simplest, but forgoes the context value that motivated this.

## Cites

- Brain ecosystem investigated 2026-06-28: `Knowledge-Architectures/graphs/`, `framework/registry/instances.yaml`, the `setup-brains` symlink pattern.
- Sibling concept: 0012 (managed per-project context vault).

## Re-open if

Proposed — supersede with an accepted decision once the resolution + read bridge are designed and
prototyped.
