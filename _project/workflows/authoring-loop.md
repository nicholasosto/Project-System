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
    { "id": "request", "lane": "you", "label": "Run /new <kind>", "to": ["scaffold"] },
    { "id": "scaffold", "lane": "engines", "label": "Scaffold file", "detail": "new-entity.mjs · born valid", "to": ["edit"] },
    { "id": "edit", "lane": "you", "label": "Edit title · status · links", "to": ["guard"] },
    { "id": "guard", "lane": "engines", "label": "Guard the save", "detail": "PreToolUse · blocks contract breaks", "to": ["validate"] },
    { "id": "validate", "lane": "engines", "label": "Validate the graph", "detail": "validate.mjs", "to": ["render"] },
    { "id": "render", "lane": "engines", "label": "Emit JSON contract", "detail": "render-hub.mjs · graph + hub", "to": ["view"] },
    { "id": "view", "lane": "surface", "label": "Render live", "detail": "this dashboard", "to": [] }
  ]
}
```
