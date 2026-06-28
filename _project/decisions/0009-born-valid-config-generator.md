---
title: "Generate consumer configs with a born-valid init tool and setup skill"
status: accepted
updated: 2026-06-28
---

# Generate consumer configs with a born-valid init tool and setup skill

> **Status:** accepted (2026-06-28)

## Context

Adopting the framework meant hand-copying `examples/soul-steel.config.json` and editing it — the
moment a project's naming conventions are actually chosen, with no validation until the first engine
run. We wanted a guided, can't-be-invalid onboarding path.

## Decision

A zero-dep `tools/init-config.mjs` generates a `project-system.config.json` from a spec and/or
`--preset standard`, fills the conventional defaults, and **proves the config loads through
`lib/contract.mjs` before writing it** — born valid, exactly as `new-entity.mjs` guarantees for
entities. To validate in memory we extracted `buildContext(cfg, …)` from `loadContract` (single
source — the engines' own seam, no temp file). A vendored `setup-project-system` **skill** runs the
naming-convention interview and drives the tool: judgment → skill, determinism → tool.

## Consequences

Onboarding is guided and the generated config can't be structurally invalid; validation reuses the
loader rather than a second checker. Proven end-to-end by standing up a real from-scratch consumer.
Cost: the `standard` preset duplicates the canonical kinds as starter data (inherent to a template),
and skills become a new consumer-template artifact type alongside commands + hooks (additive — the
drift check compares only hooks, so parity is unaffected).

## Options considered

- **Keep copy-an-example** — no validation, invites drift; the status quo we're replacing.
- **A `/init` slash command instead of a skill** — weaker fit for a judgment-heavy interview (the owner chose the skill).
- **Add a JSON-Schema validator dependency** — violates zero-dep; reused `buildContext` instead.

## Cites

- `tools/init-config.mjs` · `lib/contract.mjs` (`buildContext`)
- `templates/consumer/.claude/skills/setup-project-system/SKILL.md`

## Re-open if

A consumer needs presets beyond `standard`, or the config grows shapes `buildContext` doesn't
validate (then add explicit checks or a real schema validator).
