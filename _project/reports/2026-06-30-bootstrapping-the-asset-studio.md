---
title: "Bootstrapping the Asset-Studio space"
status: draft
updated: 2026-06-30
links:
  - { rel: references, target: features/consumer-onboarding-helpers }
  - { rel: references, target: features/init-config-and-setup }
  - { rel: references, target: features/new-scaffolder }
---

# Bootstrapping the Asset-Studio space

> **Status:** draft (2026-06-30)

Standing up a new consumer (**Asset-Studio**) as a real adoption, and recording where the bootstrap
path was smooth vs. where it forced manual work — so the friction feeds back onto the feature list.
Planning Q&A that scoped it: name → **Asset-Studio**; kinds → **standard six + a `medium` kind**; first
cut → **config + 3 workflows + dashboard**; publish trigger → **note & defer**.

## Outcome

**What shipped**

- A new vendored consumer space **Asset-Studio** (`Project-Spaces/Asset-Studio/`, own git repo): vendored
  `.project-system/`, a generated `project-system.config.json` (standard six + a `medium` kind),
  the copied `.claude/` template, `external-locations/` symlinks to the shared `Assets/` library + the
  `canonical/` kit, and a seed `_project/` (3 workflows · 3 mediums · 1 decision · 1 example pipeline).
- Validated 0/0/0; rendered contract (`asset-studio-graph.json` + `asset-studio-hub.json`) + a
  self-contained hub HTML. Registered as **real consumer #2** in `tools/check-consumer-drift.mjs` —
  PASS on structural · behavioral · hooks.

**What didn't**

- Extra dashboard views, an Asset-Studio roadmap + kickoff session — deferred (first cut was deliberately
  config + 3 workflows + dashboard). See `[CF-AS2]`.
- `@trembus/project-schema` publish — deferred; the trigger isn't actually met (see Surprises + `[CF-AS3]`).

## Surprises

- **The generator drops swimlane config.** `init-config.mjs buildConfig` passes through
  tagRegistry/relTargetKinds/proseStatusEnforcement/sectionHints/milestones/render — but **not**
  `swimlaneEnforcement`, `swimlaneLaneKinds`, or `milestonePattern`. A workflow-heavy space that wants
  `swimlaneEnforcement: error` must hand-edit the born-valid config. → refines [[init-config-and-setup]].
- **tagRegistry / relTargetKinds replace, not merge, the preset.** Supplying a custom tagRegistry
  silently dropped the preset's `priority`/`agent`/`horizon`; you must re-state what you keep.
  → refines [[init-config-and-setup]] (`--merge`).
- **Registering a consumer is a hand-edit** of `check-consumer-drift.mjs` (copy an entry, fix four
  absolute paths), and **`external-locations/` was wired by hand** (mkdir + two `ln -s` + a doc). Both
  are common adoption steps with no helper. → [[consumer-onboarding-helpers]].
- **Asset status words (`_BLK`/`_FNL`) are orthogonal to the entity status enum** — confirming
  `proseStatusEnforcement: warn` is the right *starting* posture for a content space. → guidance on
  [[init-config-and-setup]].
- **Publish-trigger bookkeeping diverges.** CLAUDE.md frames "2 consumers (SS + dogfood)", implying a
  3rd adopter triggers publish — but the drift instrument counts only REGISTERED non-demo consumers
  (now soul-steel + asset-studio = **2 of 3**) and never counts the dogfood. Adding Asset-Studio did
  **not** meet the trigger. → note on [[publish-project-schema]].

## Decisions made

- **D1**: Asset-Studio **references** the shared `Assets/` library via `external-locations/` symlinks;
  never duplicates it. (Formal: Asset-Studio decision `0001`.)
- **D2**: Kinds = the standard six **+ a domain `medium` kind** (capability catalog). Workflows model
  processes; pipelines model batches; mediums catalog what the studio can produce.
- **D3**: `swimlaneEnforcement: error` (workflows are the point) + `proseStatusEnforcement: warn` (ratchet
  to error once the corpus settles).
- **D4**: Defer the `@trembus/project-schema` publish; record the accurate count on [[publish-project-schema]].

## Carry-forward

- `[CF-AS1]` Ratchet Asset-Studio `proseStatusEnforcement` warn → error once the seed corpus settles.
- `[CF-AS2]` Author the Asset-Studio roadmap + kickoff session (deferred from the first cut).
- `[CF-AS3]` Decide the publish trigger when a 3rd independent real consumer adopts the framework.
- `[CF-AS4]` Implement the [[consumer-onboarding-helpers]] + [[init-config-and-setup]] refinements.

## Verification evidence

| Gate | Method | Evidence |
|---|---|---|
| Config born-valid | `init-config.mjs --dry-run` then write | "validated: loads cleanly through lib/contract.mjs" |
| Asset-Studio validates | `validate.mjs --root Asset-Studio` | 8 files · 0/0/0 |
| Swimlanes valid (strict) | `validate.mjs` (`swimlaneEnforcement: error`) | 3 workflows, 0 errors |
| Dashboard renders | `render-hub.mjs` + kit `build.mjs --data` | graph+hub.json (8 entities, 4 edges); hub HTML 61.4 KB self-contained |
| Mirror holds | `check-consumer-drift.mjs` | asset-studio PASS structural · behavioral · hooks |
| Dogfood stays green | `validate.mjs` (Project-System) | 41 files · 0/0/0 |
