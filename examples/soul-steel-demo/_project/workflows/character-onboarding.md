---
title: "Character onboarding"
status: draft
updated: 2026-06-27
---

# Character onboarding

> **Status:** draft (2026-06-27)

## Purpose

Takes a player from "new character selected" to "in the world with kit equipped" — reliably, every time.

## Workflow

```json
{
  "lanes": [
    { "id": "player", "label": "Player", "kind": "human" },
    { "id": "system", "label": "System", "kind": "system" },
    { "id": "designer", "label": "Designer", "kind": "human" }
  ],
  "steps": [
    { "id": "select", "lane": "player", "label": "Select character", "to": ["load"] },
    { "id": "load", "lane": "system", "label": "Load loadout + abilities", "to": ["tutorial"] },
    { "id": "tutorial", "lane": "system", "label": "Run ability tutorial", "to": ["spawn"] },
    { "id": "spawn", "lane": "system", "label": "Spawn into world", "to": ["review"] },
    { "id": "review", "lane": "designer", "label": "Review onboarding funnel drop-off", "to": [] }
  ]
}
```
