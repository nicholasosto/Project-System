---
title: "/new scaffolder"
status: available
updated: 2026-06-28
tags: { scope: tooling, tier: required }
---

# /new scaffolder

> **Status:** available (2026-06-28)

## Summary

<…>

## Why it matters

<…>

## Notes

**Refinement candidate** (Asset-Studio bootstrap, 2026-06-30 — see
[[2026-06-30-bootstrapping-the-asset-studio]]):

- **`--batch` / bulk scaffold.** Seeding the space took 8 sequential `new-entity` invocations (decision +
  3 workflows + 3 mediums + pipeline). A `--batch <spec.json>` (an array of `{ kind, title, status?,
  tags?, links? }`, or stdin) would scaffold a whole seed set in one pass and report per-entity
  validation. Pairs with the migrate-project-space flow, which also scaffolds many entities one at a time.
