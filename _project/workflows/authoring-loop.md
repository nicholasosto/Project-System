---
title: "Authoring loop"
status: active
updated: 2026-06-27
---

# Authoring loop

> **Status:** active (2026-06-27)

## Purpose

The framework's own operating loop — how every `_project/` artifact is born valid and reaches
the live Command Center. Three actors: **you** (the author), the zero-dep **engines**
(scaffolder · guard · validator · renderer), and the **Command Center** surface.

This is the first standalone `workflow` entity, migrated out of the app
(`apps/command-center/src/workflows.ts`) so the swimlane is **data derived from `_project/`**
— the goal decision [0004](../decisions/0004-pipeline-entities-carry-a-structured-workflow-block.md)
set but only half-realized while this loop stayed hardcoded in the consuming app.

## Workflow

```json
{
  "caption": "How every _project/ artifact is born valid and reaches the dashboard.",
  "lanes": [
    { "id": "you", "label": "You", "kind": "human" },
    { "id": "engines", "label": "Engines", "kind": "system" },
    { "id": "surface", "label": "Command Center", "kind": "tool" }
  ],
  "steps": [
    { "id": "request", "lane": "you", "label": "Run /new <kind>", "detail": "one generic scaffolder", "note": "Pick a kind from the config (decision · report · pipeline · roadmap · session · workflow · feature). The kind is validated against the config, so there are no per-kind commands to maintain.", "to": ["scaffold"] },
    { "id": "scaffold", "lane": "engines", "label": "Scaffold file", "detail": "new-entity.mjs · born valid", "note": "Derives the filename per the kind's scheme, writes valid frontmatter (status = the kind's initialStatus), lays down the section skeleton, and self-validates — conformant by construction.", "refs": [{ "rel": "references", "target": "features/new-scaffolder" }], "to": ["edit"] },
    { "id": "edit", "lane": "you", "label": "Edit title · status · links", "note": "Fill the authored surface — title, status, optional links/tags. id and kind are derived (folder + filename), never authored.", "to": ["guard"] },
    { "id": "guard", "lane": "engines", "label": "Guard the save", "detail": "PreToolUse · blocks contract breaks", "note": "The hook re-runs the single validateEntity check on every _project/ write and blocks (exit 2) anything that would break the contract. Read-only, fails open.", "refs": [{ "rel": "references", "target": "features/validator-and-guard" }], "to": ["validate"] },
    { "id": "validate", "lane": "engines", "label": "Validate the graph", "detail": "validate.mjs", "note": "Runs the same check across the whole graph — frontmatter, link integrity, prose↔status agreement. Also the SessionStart advisory health summary.", "to": ["render"] },
    { "id": "render", "lane": "engines", "label": "Emit JSON contract", "detail": "render-hub.mjs · graph + hub", "note": "Emits graph.json + hub.json from _project/. A Vite dev plugin, not a hook — editing any _project/ file repaints the dashboard.", "to": ["view"] },
    { "id": "view", "lane": "surface", "label": "Render live", "detail": "this dashboard", "note": "The Command Center renders the emitted contract; with vite dev running it hot-reloads on every _project/ edit.", "to": [] }
  ]
}
```
