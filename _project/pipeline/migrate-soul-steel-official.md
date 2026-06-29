---
title: "Migrate Soul-Steel-Official onto the latest framework"
status: build
updated: 2026-06-29
links:
  - { rel: references, target: roadmap/migrate-soul-steel-to-consume-the-packaged-framework }
  - { rel: references, target: decisions/0002-mirror-the-contract-with-a-ci-check-before-publishing }
  - { rel: successor, target: pipeline/migrate-soul-steel-command-center }
---

# Migrate Soul-Steel-Official onto the latest framework

> **Status:** build (2026-06-29)

**Progress:** Phases 0–3 landed on SS branch `migrate/project-system-defork` (not pushed): framework
vendored into `.project-system/`, root config authored (100% vs golden), the **4 forked engines +
forked `md.mjs` deleted** (`build-planning-sessions` repointed to the vendored parser; its output
verified byte-identical), and `.claude` rewired to the vendored engines (guard + SessionStart, generic
`/new`, both skills; Roblox perms + plugins preserved). Vendored validate holds the baseline
(`29/0/1/9`). **SS now consumes the framework.** Remaining: Phase 4 (content carry-forwards → 0/0/0 —
needs the non-marker `milestone` call) and Phase 5 (drift-registry repoint + dashboard tidy).

## Context

Extraction (2026-06-24) deliberately left **Soul-Steel-Official** running its *forked* tools — the
"no regression" call. It is still frozen at that commit: forked entity engines
(`validate-project-entities` · `new-project-entity` · `guard-project-entity` · `build-project-graph`)
+ a forked `tools/lib/md.mjs`, **no** `project-system.config.json`, **no** vendored `.project-system/`.
That fork is the second implementation [[0002-mirror-the-contract-with-a-ci-check-before-publishing]]
exists to keep honest; the clean end-state is for SS to **consume** the framework so there is one
implementation and one base contract. This pipeline executes the
[[migrate-soul-steel-to-consume-the-packaged-framework]] roadmap with a real, assessed sequence.

**Assessed state (latest framework validator against the live SS tree, golden config):
`29 files / 5 kinds — 0 errors, 1 warning, 9 info`.** The contract is *already compatible* — the work
is mechanical de-forking, not content surgery. Grounded facts that shape the plan:

- The forks are a **strict subset** of the engines; the framework `lib/md.mjs` is an exact superset of
  SS's (same export surface + three latent-bug fixes). So the swap is low-risk.
- SS folders: `decisions·reports·pipeline·roadmap·sessions` (the 5 golden kinds) **plus** non-entity
  `command-center/` (dashboard data: `captures.json` + README) and `skill-notes/` (one working doc) —
  the loader already ignores both.
- The golden [examples/soul-steel.config.json](../../examples/soul-steel.config.json) **already registers**
  `agent·scope·priority` as tags, so the 9 legacy-session infos clear by moving those fields under
  `tags:` — **no new registry needed** (only `milestone` is unregistered; see Build plan §4).
- SS is **already** `CONSUMERS[0]` in `tools/check-consumer-drift.mjs` (structural + behavioral run on a
  full drift check when SS is on disk); only the **hooks** axis is skipped (no `claudeDir`). Its
  registered `schema`/`ownValidator` paths point at fork files this migration deletes → the registry
  entry must change in the same step.
- SS's dashboard is a **rich, domain-specific** custom command-center (capture server + visual-grammar
  kit HTML + asset-explorer + Atlas). It is **out of scope** of a contract de-fork and stays.

## Build plan

Phased so every phase is independently verifiable and the early ones are additive/reversible. Do this
on a branch in SS; the only writes to the framework repo are the drift-registry update (§5).

**Phase 0 — Preflight (no SS changes).** Branch SS. Capture the baseline `29/0/1/9` (golden config) and
snapshot `previews/dashboards/` so dashboard output can be diffed later. Exit: baseline recorded.

**Phase 1 — Vendor + author config (additive, reversible).**
1. Author SS-root `project-system.config.json` via the generator — a **5-kind `--spec` WITHOUT
   `--extends`** (extends would inject the modern `workflow` kind the golden omits), tag registry +
   rels + `milestones [M1..M5]` + `proseStatusEnforcement: error`, with `$schema →
   ./.project-system/schema/project-config.schema.json`. It must stay substantively identical to the
   golden (the drift baseline). *Exit:* `validate.mjs --root . --config ./project-system.config.json`
   reproduces `29/0/1/9`.
2. Vendor the framework verbatim into `SS/.project-system/` (`schema/ lib/ tools/`, incl. `contract.mjs`
   · `swimlane.mjs` · `guide-anatomy.mjs` the forks lacked). *Exit:* vendored `--self-test`s pass;
   validate via the vendored path reproduces the baseline.

**Phase 2 — De-fork the tooling (sequencing-critical: repoint before delete).**
1. Repoint the **domain** tool `tools/build-planning-sessions.mjs` (it imports `tools/lib/md.mjs`) to
   `../.project-system/lib/md.mjs` (drop-in superset). *Exit:* its `--check` output unchanged (verify —
   the framework's fence-aware `parseSections` could shift bodies with fenced `##` lines).
2. Decouple `tools/build-project-graph.mjs` (the kit dashboard emitter) from the entity engines —
   inline the three helpers it imports from the fork — so it stops depending on deleted files with
   **zero** dashboard behavior change. *Exit:* its output byte-stable (date-insensitive).
3. Delete the 4 forked entity engines + `tools/lib/md.mjs`. *Exit:* no remaining import of any deleted
   file; validate/scaffold/guard now run only via `.project-system/`.

**Phase 3 — Rewire `.claude`.**
1. `settings.json`: point the PreToolUse guard at `.project-system/tools/guard.mjs`; **add** the
   advisory `SessionStart` summary (`validate.mjs --summary`); swap the framework Bash-allows to the
   `.project-system/tools/*` paths. **Preserve** the Roblox-cloud MCP `ask` list, the asset/curl
   allows, and `enabledPlugins` verbatim.
2. Replace the 4 per-kind `new-*.md` commands with the single generic `new.md` (also fixes the missing
   `new-session`). Copy the `setup-project-system` + `migrate-project-space` skills into `.claude/skills/`.

**Phase 4 — Content carry-forwards → clean validate.**
1. The 9 legacy sessions: drop `id` (derived); move `agent·scope·priority` into a `tags:` map (already
   registered → validates clean); convert `milestone: M<n>` → `links: [{ rel: milestone, target: M<n> }]`
   for the 4 M-marker sessions. For the 5 **non-marker** values (`future`, `post-M5`) — *decision needed*
   (see Key decisions): register a `milestone` string tag (drift-coupled) or drop them. Bodies already
   carry the 8 required sections — frontmatter-only edits.
2. `roadmap/topology-refresh-plan.md`: add a `## Context` (promote the existing intro blurb) → clears
   the warning.
3. Two prose nits: `pipeline/m4-…` prose "in progress" → shipped (frontmatter is `ship`); `decisions/0003-…`
   H1 mislabeled "0002" → "0003".
4. Rewrite `sessions/README.md` "Required Shape" to the latest contract so new sessions are born clean.
*Exit:* `validate.mjs` → `0 errors / 0 warnings / 0 info` (or the justified `milestone` residual).

**Phase 5 — Rejoin the mirror + dashboard tidy.**
1. Update `CONSUMERS[0]` (soul-steel) in the framework's `tools/check-consumer-drift.mjs`: repoint
   `schema` → the vendored `.project-system/schema/project-entity.base.schema.json`; **drop**
   `ownValidator` (the fork is gone — comparing the engine to itself is tautological); **add**
   `claudeDir → SS/.claude` to turn on hook parity; point `config` at the SS-root config (keep
   `examples/soul-steel.config.json` as the separate byte-faithful demo fixture).
2. Regenerate or delete the **stale** `previews/dashboards/project-system*.json` (forked
   `build-project-graph` output); leave `captures.json` untouched. The broader command-center migration
   (planning views → the `render-status-board` skill) is its own pipeline,
   [[migrate-soul-steel-command-center]], and runs after this de-fork lands.
*Exit:* full `check-consumer-drift.mjs` → soul-steel **PASS** on structural + behavioral + hooks.

## Key decisions

- **Vendor verbatim into `SS/.project-system/`** (not path-reference, not publish). SS is consumer #2;
  publishing `@trembus/project-schema` is deferred to a 3rd consumer per [[0002-mirror-the-contract-with-a-ci-check-before-publishing]].
- **Direct `.project-system/tools/...` calls, no wrapper scripts** — wrappers reintroduce the
  project-local file the de-fork removes; the hook-parity axis normalizes against the vendored paths.
- **Command center migrated separately** in [[migrate-soul-steel-command-center]] — planning views
  (hub · decision-tree · plan-board) re-sourced from validated `_project/` via the `render-status-board`
  skill, keeping SS's kit + look; asset explorer (and code-topology / briefs) stay out of scope. This
  de-fork does **not** adopt `apps/command-center`; it only removes the stale `project-system*.json`
  fork output (Phase 5).
- **Defer the modern `workflow` (0006) and `feature` (0010) kinds.** SS authors none, and adding them
  would diverge from the 5-kind drift baseline; adoption is a deliberate later step that updates the
  vendored config and the golden together.
- **`command-center/` + `skill-notes/` stay non-entity** (no kind declared).
- **Non-marker `milestone` handling** (`future`/`post-M5`): recommend registering a `milestone`
  `lintAgainst` string tag (in **both** the live SS config and the golden, in lockstep) so the values
  survive as clean tags; the lower-effort alternative is to drop them.

## Risks & sequencing

- **Repoint-before-delete** is mandatory: `build-planning-sessions.mjs` (domain) and
  `build-project-graph.mjs` (dashboard) both import fork files; deleting first breaks them.
- **Drift entry references deleted files** — update `CONSUMERS[0]` in the *same* change set as the
  tooling delete, or the drift check errors on missing paths.
- **Hooks parity fails until `.claude` is rewired** — it is built to catch exactly SS's renamed guard +
  missing SessionStart; do Phase 3 before re-running drift.
- **`md.mjs` fence-aware `parseSections`** may shift `build-planning-sessions` output for fenced-`##`
  bodies — verify its `--check` after the repoint.
- **`proseStatusEnforcement: error`** is safe today (no enum-word prose disagreements) but will block a
  mid-edit save if prose later drifts from frontmatter — expected, matches the framework's own posture.

## Exit criteria

- SS validates **0/0/0** through the **vendored** engines against its **own** root config (justified
  `milestone` residual allowed if the team opts to drop rather than register).
- **No forked entity engine or forked `md.mjs` remains**; all domain tooling (asset/atlas/upload/lua/
  command-center/plugins) is untouched and still runs.
- `.claude` wires exactly the **two canonical hooks** (parity PASS) + the generic `/new` + both skills;
  Roblox permissions and `enabledPlugins` preserved.
- Full `check-consumer-drift.mjs` reports **soul-steel PASS** on structural + behavioral + hooks; the
  publish-trigger count is unchanged (still < 3 real consumers).
- SS's custom dashboard still renders; `captures.json` byte-unchanged; no `previews/` file is emitted by
  a forked tool.
- `examples/soul-steel.config.json` is retained as the **demo/mirror fixture**, distinct from SS's live
  root config.
