---
title: "init-config and setup skill"
status: available
updated: 2026-06-28
tags: { scope: tooling, tier: optional }
---

# init-config and setup skill

> **Status:** available (2026-06-28)

## Summary

<…>

## Why it matters

<…>

## Notes

**Refinement candidates** (surfaced standing up Asset-Studio, 2026-06-30 — see
[[2026-06-30-bootstrapping-the-asset-studio]]):

- **Pass through swimlane config.** `buildConfig` emits tagRegistry / relTargetKinds /
  proseStatusEnforcement / sectionHints / milestones / render — but **drops `swimlaneEnforcement`,
  `swimlaneLaneKinds`, and `milestonePattern`**. A workflow-heavy consumer that wants
  `swimlaneEnforcement: error` must hand-edit the otherwise born-valid config. Add them to the passthrough.
- **`--merge` mode.** `tagRegistry` / `relTargetKinds` (and the enforcement blocks) **replace** the
  preset rather than merge — supplying a custom tagRegistry silently drops `priority`/`agent`/`horizon`.
  A `--merge` that composites a spec over an existing/preset config (preserving unknown keys) would
  prevent accidental loss and enable config re-edits without a full regen.
- **`statusSynonyms` + rollout guidance.** Prose-status checking hard-codes only complete↔completed.
  Content spaces carry their own status vocab in prose (e.g. asset `_BLK`/`_FNL`); a config
  `statusSynonyms` map + explicit "start `warn`, ratchet to `error`" guidance would cut false positives.
- **Validate render metadata at generate time** — `render.hex.petals` referencing a non-existent
  kind/facet isn't caught until the hub renders.
