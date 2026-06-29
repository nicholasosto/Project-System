---
date: 2026-06-20
status: completed
agent: claude
---

# Combat tuning session

**Status:** completed

## Goal

Land the 120ms stagger window from the Q1 retro into the ability pipeline.

## Success Criteria

- Stagger window configurable per-ability; default 120ms.

## Source References

- reports/2026-03-02-q1-combat-retro
- delivery/ability-system

## Decisions

- Stagger lives on the effect graph node, not the weapon.

## Outputs

- `StaggerWindow` field on effect nodes; default wired to 120ms.

## Blockers

- None.

## Next Action

- Designer authoring tool to expose the field (ability-system step 3).

## Handoff Notes

- A/B the 120ms vs 150ms in the next live build.
