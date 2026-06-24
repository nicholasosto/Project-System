---
title: "Mirror the contract with a CI check before publishing"
status: accepted
updated: 2026-06-24
---

# Mirror the contract with a CI check before publishing

> **Status:** accepted (2026-06-24)

## Context

Extraction ([[0001-home-the-project-system-framework-in-its-own-space]]) makes
Project-System the canonical owner of the base contract
(`schema/project-entity.base.schema.json`). Soul-Steel keeps its own working copy of the
tools + a fused schema. That is two physical copies of the universal contract — exactly
the situation `schema.md` §8 #4 pre-decided by **consumer count**: 2 consumers → mirror a
type with a CI equality check (planning spaces stay npm-free); 3+ → publish
`@trembus/project-schema` and everyone installs it.

Today there are **2** consumers (Soul-Steel; the framework's own dogfood). The companion
scar — *Duplicate Data Source Across Layers* (§9) — warns that two *live* sources drift;
a build-time copy guarded by a check does not.

## Decision

**Mirror + CI-check now; defer publishing.** Ship `tools/check-consumer-drift.mjs`, which:

1. **structural equality** — a consumer's schema *core* (`$defs.link`, `$defs.rel`, the
   primitive property types, the tag shadow-rule) must equal the canonical base schema;
2. **behavioral reproduction** — the generalized engines + the consumer's config,
   pointed at the consumer's `_project/`, must reproduce that consumer's own validator
   baseline (e.g. Soul-Steel: 29 entities, 0 errors).

Publish `@trembus/project-schema` only when a **3rd independent consumer** appears.

## Consequences

- **Easier:** planning spaces stay zero-dep / npm-free; no version-lockstep; the check
  makes drift loud instead of silent.
- **Harder:** two copies exist until publish — the drift check is the thing that keeps
  them honest, so it must run (CI or pre-commit) on both repos.

## Options considered

- **Publish `@trembus/project-schema` now** — rejected: only 2 consumers; pulling npm
  into npm-free planning spaces is premature (it's the 3+ trigger).
- **A single live shared import** — rejected: the Duplicate-Data-Source scar; a runtime
  second subscriber, not a build-time type-with-check.
- **No check, just copy** — rejected: silent drift is the failure mode the whole
  single-contract spine exists to prevent.

## Cites

- [schema.md §8 #4 and §9](../../docs/spec/schema.md)
- `tools/check-consumer-drift.mjs`

## Re-open if

A 3rd project adopts the contract → switch to publishing `@trembus/project-schema`;
this decision is superseded at that point.
