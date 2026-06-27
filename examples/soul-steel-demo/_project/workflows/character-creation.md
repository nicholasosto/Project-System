---
title: "Character creation"
status: draft
updated: 2026-06-27
links:
  - { rel: references, target: workflows/character-onboarding }
tags: { scope: ip-wide }
---

# Character creation

> **Status:** draft (2026-06-27)

End-to-end pipeline for authoring a brand-new Soul-Steel character — from a design brief to a
canon, playable character in Studio. The **Lore Brain** is a first-class lane: continuity is
recalled before design and the finished character is captured + woven back into the reality
graph, so new cast stays consistent with established lore (scars, factions, lineage).

## Purpose

Turns a one-line character idea into a **canon, riggable, playable** character — design, art,
3D, and engine work sequenced so nothing starts before its lore + concept dependencies are locked.

The output of step `entity` is a `character` entity (this consumer's `character` kind); the
`playtest` step hands off to the [Character onboarding](character-onboarding.md) workflow.

## Workflow

```json
{
  "lanes": [
    { "id": "design", "label": "Design", "kind": "human" },
    { "id": "lore", "label": "Lore Brain", "kind": "system" },
    { "id": "art", "label": "Art", "kind": "human" },
    { "id": "model", "label": "3D / Blender", "kind": "system" },
    { "id": "engine", "label": "Roblox Studio", "kind": "system" },
    { "id": "review", "label": "Canon Review", "kind": "human" }
  ],
  "steps": [
    { "id": "brief", "lane": "design", "label": "Write character brief — role, faction, reality tag", "to": ["recall"] },
    { "id": "recall", "lane": "lore", "label": "/lore-brain:recall — continuity, scars, neighborhood", "to": ["entity"] },
    { "id": "entity", "lane": "design", "label": "/new character — scaffold Concept · Abilities · Arc", "to": ["capture"] },
    { "id": "capture", "lane": "lore", "label": "/lore-brain:capture — reality-tagged Neural Note", "to": ["concept-art"] },
    { "id": "concept-art", "lane": "art", "label": "Concept art + key poses + palette", "to": ["sense"] },
    { "id": "sense", "lane": "lore", "label": "brain-sense — voice line + ambient sensory assets", "to": ["sculpt"] },
    { "id": "sculpt", "lane": "model", "label": "Blender — block out + sculpt mesh (Blender MCP)", "to": ["rig"] },
    { "id": "rig", "lane": "model", "label": "Rig + skin to Roblox R15", "to": ["import"] },
    { "id": "import", "lane": "engine", "label": "Import to Studio, attach loadout + abilities (Studio MCP)", "to": ["playtest"] },
    { "id": "playtest", "lane": "engine", "label": "Playtest — hand off to Character-onboarding flow", "to": ["signoff"] },
    { "id": "signoff", "lane": "review", "label": "Canon sign-off → set character status to canon", "to": ["weave"] },
    { "id": "weave", "lane": "lore", "label": "/lore-brain:weave — link into lineage + factions", "to": [] }
  ]
}
```
