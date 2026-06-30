---
title: "Publish @trembus/project-schema"
status: planned
updated: 2026-06-28
tags: { scope: packaging, tier: required }
---

# Publish @trembus/project-schema

> **Status:** planned (2026-06-28)

## Summary

<…>

## Why it matters

<…>

## Notes

**Count update** (2026-06-30 — see [[2026-06-30-bootstrapping-the-asset-studio]]):
Registering **Asset-Studio** as a real consumer brings the drift check's REGISTERED non-demo count to
**2 of the 3** that re-open this decision (soul-steel + asset-studio; the dogfood is the framework
itself and is deliberately not a registered consumer, so it doesn't count). Note the divergence:
CLAUDE.md's prose ("2 consumers today (SS + dogfood)") counts the dogfood and would imply the trigger is
met — but the mechanical instrument (`check-consumer-drift.mjs`, the single source of truth) does not.
**One more independent real consumer trips the trigger.** Worth reconciling CLAUDE.md's wording with the
instrument's count.
