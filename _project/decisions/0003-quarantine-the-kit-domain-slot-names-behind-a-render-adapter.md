---
title: "Quarantine the kit domain slot names behind a render adapter"
status: accepted
updated: 2026-06-24
---

# Quarantine the kit domain slot names behind a render adapter

> **Status:** accepted (2026-06-24)

## Context

The hub renderer projects the entity graph through the Trembus visual-grammar kit. That
kit's `hub.schema.json` hard-codes its 7 hex slots as
`["hub","robot","blood","decay","spirit","fate","shared"]` — **Soul-Steel domain names**
baked into shared render infrastructure. A generic project-system must carry **zero**
domain vocabulary in its config, schema, contract, or docs (explicit user direction,
2026-06-24: "robot blood and decay … are specific to game development and soul steel
specifically"). The kit itself can't be rewritten here: it's shared infra in a non-git
space, and Soul-Steel's live command center already depends on its slot vocabulary.

## Decision

The framework is **domain-neutral end to end**: a kind declares only an accent color +
labels, and the renderer **auto-places** the center + up to 6 petals into ring slots in
declared order. The kit's legacy slot names are **quarantined to a single, commented
adapter constant** (`KIT_HEX_SLOTS` in `tools/render-hub.mjs`) — the only line in the
whole framework that names them. Nothing upstream (config / schema / contract / docs)
ever sees `robot`/`blood`/`decay`/…

## Consequences

- **Easier:** the generic system reads clean; if the kit ever gains neutral slot ids,
  it's a one-line change; consumers never type a domain word.
- **Harder:** we inherit the kit's structural limit — the hub view holds **≤6 petals**;
  a project with >6 kinds overflows (the renderer warns and summarizes the remainder).

## Options considered

- **Rewrite the kit's `pos` enum to neutral ids** — rejected (here): shared infra in a
  non-git space; Soul-Steel's live dashboards depend on it; out of scope for extraction.
- **Default to a neutral non-hex view (tree / plan-board)** — deferred: a larger render
  redesign; tracked as a follow-up, not a blocker.
- **Inherit the domain names as "opaque slots"** — rejected: even as opaque labels they
  leak Soul-Steel words into a generic system — the exact thing the user objected to.

## Cites

- visual-grammar kit `schema/hub.schema.json` (`pos` enum)
- `tools/render-hub.mjs` → `KIT_HEX_SLOTS`
- User direction, 2026-06-24

## Re-open if

The kit gains neutral slot ids (drop the adapter), or the framework needs >6 petals / a
neutral default view (pick a non-hex view and revisit auto-placement).
