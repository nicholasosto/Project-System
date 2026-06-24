---
title: "Extract and generalize the framework from Soul-Steel"
status: complete
updated: 2026-06-24
links:
  - { rel: decided-in, target: decisions/0001-home-the-project-system-framework-in-its-own-space }
  - { rel: references, target: sessions/2026-06-24-extract-and-generalize-project-system-into-its-own-space }
---

# Extract and generalize the framework from Soul-Steel

> **Status:** complete (2026-06-24)

## Outcome

**What shipped**

- A dedicated git repo at `Project-Spaces/Project-System` with a `CLAUDE.md`
  ([[0001-home-the-project-system-framework-in-its-own-space]]).
- **Framework-core / project-config split.** Universal contract →
  `schema/project-entity.base.schema.json`; a project's knobs →
  `project-system.config.json` validated by `schema/project-config.schema.json`. The
  seam is `lib/contract.mjs` (`loadContract`/`loadEntities`); the four engines
  (`tools/validate.mjs`, `new-entity.mjs`, `guard.mjs`, `render-hub.mjs`) hard-code no
  kind, folder, enum, or domain word.
- **Two configs:** the framework's own (`project-system.config.json`) and
  `examples/soul-steel.config.json` (reproduces Soul-Steel's rules).
- **Domain-neutral renderer** — kit's Soul-Steel slot names quarantined to one adapter
  ([[0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter]]).
- **Packaging:** `tools/check-consumer-drift.mjs` realizing the mirror-with-CI-check
  ([[0002-mirror-the-contract-with-a-ci-check-before-publishing]]).
- A self-validating **dogfood** `_project/` (this graph).

**What didn't**

- Soul-Steel still runs its original un-generalized tools — not yet migrated to *consume*
  the framework (`[CF-1]`; tracked by [[migrate-soul-steel-to-consume-the-packaged-framework]]).
- `@trembus/project-schema` not published — deferred to the 3rd consumer (`[CF-2]`).

## Surprises

- **The kit bakes domain names.** `hub.schema.json` fixes `pos` to Soul-Steel domains, so
  "neutralize the petal map" became "quarantine an adapter," not "rename a field." The
  generalization is clean *above* that one line.
- **The reduction is byte-faithful.** The generalized validator + `soul-steel.config.json`
  reproduced Soul-Steel's baseline to the exact file — same 1 warning, same 9 info — with
  no Soul-Steel code in the path. Three primitives really did capture all five kinds.

## Decisions made

- **D1**: own top-level space + git repo — [[0001-home-the-project-system-framework-in-its-own-space]].
- **D2**: mirror + CI-check, defer publishing — [[0002-mirror-the-contract-with-a-ci-check-before-publishing]].
- **D3**: quarantine the kit's domain slots — [[0003-quarantine-the-kit-domain-slot-names-behind-a-render-adapter]].

## Carry-forward

- `[CF-1]` Migrate Soul-Steel to consume the framework (thin tools + its own config) —
  deferred to keep "no regression" this session.
- `[CF-2]` Publish `@trembus/project-schema` — deferred until a 3rd consumer.
- `[CF-3]` Hub view holds ≤6 petals; design a neutral view for >6 kinds.

## Verification evidence

| Gate | Method | Evidence |
|---|---|---|
| Engine logic correct | self-tests | validate 11/11 · scaffold 9/9 · guard 10/10 |
| Project-agnostic | generalized validator @ Soul-Steel `_project/` via `soul-steel.config.json` | 29 files, 0 errors, 1 warn, 9 info — matches Soul-Steel's own validator |
| Dogfood conformant | `node tools/validate.mjs` | 7 entities, 5 kinds, 0/0/0 |
| Mirror honest | `node tools/check-consumer-drift.mjs` | structural + behavioral checks pass |
| No regression | Soul-Steel's own tools, untouched | 0 errors; 3 self-tests pass; graph in sync |
