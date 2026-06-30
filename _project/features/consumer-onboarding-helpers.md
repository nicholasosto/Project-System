---
title: "Consumer onboarding helpers"
status: planned
updated: 2026-06-30
links:
  - { rel: references, target: features/init-config-and-setup }
tags: { scope: tooling, tier: optional }
---

# Consumer onboarding helpers

> **Status:** planned (2026-06-30)

## Summary

A small set of helpers that automate the manual steps of adopting the framework in a new space — the
residue left *after* the born-valid generator and scaffolder do their part:

- `register-consumer.mjs --name <n> --root <dir> [--schema --config --claudeDir]` — derive the standard
  vendored paths and append (or update) a `check-consumer-drift.mjs` `CONSUMERS` entry; refuse duplicates.
- an **`external-locations` scaffolder** — from a `{ name: target }` spec, create the symlinks + a
  generated `references/source-locations.md`.
- `add-link.mjs <kind> <id> <rel:target>` (and a `/link` command) — validate a rel + target against the
  graph and insert it into an existing entity's frontmatter `links`, without a hand-edit. (The
  post-hoc analog of `new-entity`'s create-time `--link`.)

## Why it matters

Standing up Asset-Studio (2026-06-30, see [[2026-06-30-bootstrapping-the-asset-studio]]) hit exactly
these steps: registering the consumer was a hand-edit of `check-consumer-drift.mjs` (four absolute
paths), and `external-locations/` was wired by hand (`mkdir` + two `ln -s` + a doc). Each is error-prone
and lives *outside* the consumer's own tree. Automating them makes adoption end-to-end scriptable.

## Notes

- **Tier: optional** — none of these block adoption (they're one-time manual steps today); they reduce
  friction and mistakes, not capability.
- `register-consumer.mjs` writes to the framework repo (the registry), so it pairs naturally with the
  drift check; consider a `--dry-run` that prints the entry.
- Complements [[init-config-and-setup]] (born-valid config) and [[new-scaffolder]] (born-valid entities)
  — same "can't-be-invalid, scripted" ethos, applied to the adoption seam.
