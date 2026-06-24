---
title: "Migrate Soul-Steel to consume the packaged framework"
status: proposed
updated: 2026-06-24
links:
  - { rel: references, target: decisions/0002-mirror-the-contract-with-a-ci-check-before-publishing }
---

# Migrate Soul-Steel to consume the packaged framework

> **Status:** proposed (2026-06-24)

## Context

Extraction left Soul-Steel running its **original** un-generalized tools (deliberately —
"no regression" this session). That is the second copy that
[[0002-mirror-the-contract-with-a-ci-check-before-publishing]] keeps honest via the drift
check. The clean end-state is for Soul-Steel to *consume* the framework rather than carry
a divergent fork, so there is one implementation and one canonical base contract.

## Plan

- Replace Soul-Steel's `tools/validate-project-entities.mjs` / `new-project-entity.mjs` /
  `guard-project-entity.mjs` / `build-project-graph.mjs` with thin wrappers over the
  framework engines (or a vendored copy of `lib/` + `tools/`).
- Add Soul-Steel's `project-system.config.json` (the steel-city rules — already captured
  in `examples/soul-steel.config.json`): M1–M5 milestones, `steel-city`/`ip-wide`/`tooling`
  scopes, the per-kind enums and sections.
- Re-point `.claude/commands/new-*` and the `.claude/settings.json` PreToolUse guard hook
  at the framework engines.
- Run `tools/check-consumer-drift.mjs` in Soul-Steel CI/pre-commit so the mirror can't rot.
- **Fold in the deferred SS content carry-forwards while those files are already open** (kept
  out of the extraction session to preserve "no regression"):
  - The 9 sessions still carry legacy `id`/`agent`/`scope`/`milestone`/`priority` frontmatter
    (the Phase-A session reduction, info-level today): drop the derived `id`; move
    `agent`/`scope`/`priority` → `tags`; convert `milestone` → a `{ rel: milestone, target: M<n> }`
    link. This is the only thing keeping Soul-Steel's baseline at 9 info instead of 0.
  - Prose nit: decision `0003`'s H1 heading reads "0002" — fix to its own number.
  - Prose nit: pipeline `m4`'s prose says "in progress" while its frontmatter is `ship` — align
    the narrative. (Doesn't trip the validator — "in progress" isn't an enum word — but it's stale.)

## Open questions

- Vendor the framework into Soul-Steel, or path-reference it across spaces? (Vendoring
  keeps Soul-Steel self-contained; path-reference avoids copies but couples the two repos.)
- Do this before or after a 3rd consumer triggers publishing `@trembus/project-schema`?
  Publishing would make this a plain `npm install` and may be worth waiting for.
