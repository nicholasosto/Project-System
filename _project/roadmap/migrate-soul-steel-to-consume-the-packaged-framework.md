---
title: "Migrate Soul-Steel to consume the packaged framework"
status: complete
updated: 2026-06-30
links:
  - { rel: references, target: decisions/0002-mirror-the-contract-with-a-ci-check-before-publishing }
  - { rel: successor, target: pipeline/migrate-soul-steel-official }
---

# Migrate Soul-Steel to consume the packaged framework

> **Status:** complete (2026-06-30)

**Outcome (2026-06-30):** Done. Soul-Steel-Official consumes the vendored framework — the de-fork
([[migrate-soul-steel-official]]) and the command-center migration ([[migrate-soul-steel-command-center]])
both shipped and merged into SS `main` (PR #1). `check-consumer-drift.mjs` reports soul-steel **PASS** on
structural · behavioral · hooks; SS validates 0/0/0 through the vendored engines. The dashboard's
`plan-board` view was descoped to a future SS-side redesign (the live composite is Hub + Decisions, both
regenerable phenotype). The publish-vs-vendor question stands open — SS is still consumer #2; publishing
`@trembus/project-schema` stays deferred to a 3rd consumer per
[[0002-mirror-the-contract-with-a-ci-check-before-publishing]].

## Context

Extraction left Soul-Steel running its **original** un-generalized tools (deliberately —
"no regression" this session). That is the second copy that
[[0002-mirror-the-contract-with-a-ci-check-before-publishing]] keeps honest via the drift
check. The clean end-state is for Soul-Steel to *consume* the framework rather than carry
a divergent fork, so there is one implementation and one canonical base contract.

A real, assessed, sequenced execution plan now lives in [[migrate-soul-steel-official]]. Key
re-assessment finding (2026-06-29): the latest validator already reads **0 errors** against the live
SS tree (29 files / 5 kinds; 1 warning + 9 info), so the work is mechanical de-forking, not content
surgery. SS is also already `CONSUMERS[0]` in the drift check (structural + behavioral run today; only
the hooks axis is skipped for lack of a `claudeDir`).

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

- ~~Vendor the framework into Soul-Steel, or path-reference it across spaces?~~ **Resolved: vendor
  verbatim into `SS/.project-system/`** — the documented consumer pattern the drift check is built
  around; path-referencing couples the two working trees.
- Do this before or after a 3rd consumer triggers publishing `@trembus/project-schema`? Publishing
  would make this a plain `npm install`. **Leaning proceed-now** (SS is consumer #2; vendoring is
  re-copy-to-update, cheap to swap for an install later) — but a deliberate call.
- Non-marker session `milestone` values (`future`/`post-M5`): register a `milestone` tag (drift-coupled
  in golden + live config) or drop them? (see [[migrate-soul-steel-official]] Phase 4.)
