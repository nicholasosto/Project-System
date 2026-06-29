---
title: "Migrate the Soul-Steel-Official command center onto the framework"
status: design
updated: 2026-06-29
links:
  - { rel: predecessor, target: pipeline/migrate-soul-steel-official }
  - { rel: references, target: roadmap/migrate-soul-steel-to-consume-the-packaged-framework }
---

# Migrate the Soul-Steel-Official command center onto the framework

> **Status:** design (2026-06-29)

## Context

The contract de-fork ([[migrate-soul-steel-official]]) treated SS's dashboard as out of scope. This
pipeline pulls **the command center into scope** (excepting the asset explorer) and migrates the
planning-derived surfaces onto the framework so the dashboard stops drifting from the planning data.

**The drift problem.** SS's command center renders via the **Trembus visual-grammar kit**
(`…/canonical/kits/visual-grammar/build.mjs`) from **hand-authored** `previews/dashboards/contracts/*.json`
(`hub` · `decision-tree` · `plan-board-wiring` · `command-center.manifest`). Those contracts are
maintained by hand and *say so* ("this view is a static projection") — they drift from `_project/`.

**The bridge already exists.** The framework's **`render-status-board` skill** renders the *same three
views* (`hub` · `decision-tree` · `plan-board`) through the *same kit*, but on the discipline
**source-of-truth (markdown) → contract → kit → phenotype**, where "the HTML is disposable output you
regenerate, never hand-edit." So migrating the command center = **replace the hand-authored contracts
with skill-derived ones**, keeping SS's exact look and kit. No React rewrite, no UX change.

Two builder tools sit alongside the kit dashboard and must be classified, not lumped: `build-planning-sessions.mjs`
is **planning-derived** (reads `_project/` via `md.mjs`), `build-code-topology.mjs` is **code-derived**
(walks `external-locations/code` package deps) — the latter is in the same "domain artifact" bucket as
the asset explorer.

## Command center inventory — keep / migrate / out-of-scope

Every current surface, classified. "Migrate" = re-source from validated `_project/` via render-hub +
the `render-status-board` skill (kit + HTML unchanged).

| # | Surface | Source today | Disposition |
|---|---|---|---|
| 1 | **Hub** view (`contracts/hub.json` → command-center HTML; the 6-domain hex map) | hand-authored | **KEEP — migrate.** Regenerate via `/render-status-board hub` from the curated source markdown (CLAUDE.md mission + `games/steel-city/status.md`). Editorial framing lives in source, not hand-edited JSON. |
| 2 | **Decision-tree** view (`contracts/decision-tree.json`) | hand-authored | **KEEP — migrate (highest value).** Pure planning data: derive from `_project/decisions/` + supersedes edges via `/render-status-board decision-tree`. |
| 3 | **Plan-board** view(s) (`contracts/plan-board-wiring.json` → `steel-city-inventory-wiring.html`) | hand-authored | **KEEP — migrate.** Derive from `_project/pipeline/` + roadmap via `/render-status-board plan-board`. |
| 4 | **Command-center shell** (`soul-steel-command-center.html` + `command-center.manifest.json`) | kit-built from the above | **KEEP — migrate.** Re-source from the regenerated contracts; becomes pure phenotype. |
| 5 | **Quick-capture → inbox filing** (`command-center-server.mjs` + `_project/command-center/captures.json` + inbox flow) | SS-native server | **KEEP as-is (high value, no framework equivalent).** Flag as a strong **upstream candidate** — a generic capture surface the framework lacks. |
| 6 | **Local regen runner panel** (server `RUN_TASKS`) | SS-native server | **KEEP as-is.** Update its task list as surfaces move to the skill (drop the dead `project-system` graph task; keep/repoint the rest). |
| 7 | **Planning-sessions** (`build-planning-sessions.mjs` → `.html`/`.json`) | planning-derived (forked `md.mjs`) | **KEEP — repoint** to vendored `md.mjs` (already in the de-fork plan). Flag as **overlapping** render-hub's session data — candidate to consolidate later. |
| 8 | **Atlas** (`previews/index.html`) | hand/nav | **KEEP — light migrate.** It's the index; update its links as surfaces are regenerated. |
| 9 | **code-topology** (`build-code-topology.mjs`) | code-derived | **KEEP as-is — out of planning scope** (code artifact, same bucket as asset explorer). |
| 10 | **Design briefs / decks** (`_briefs/atelier`, `_briefs/steel-city-deck`, `steel-city/` tokens) | domain design | **KEEP as-is — out of planning scope.** |
| 11 | **Asset explorer** (`asset-explorer.html`, `build-asset-explorer.mjs`) | code/asset-derived | **OUT OF SCOPE** (per request). |
| 12 | **Stale `project-system-hub.{html,json}` + `project-system.json`** | forked `build-project-graph.mjs` | **DELETE / REPLACE** with render-hub's `project-system-graph.json`/`project-system-hub.json` (the de-fork already removes the fork emitter). |

## Build plan

Depends on the de-fork ([[migrate-soul-steel-official]]) landing first — it vendors `render-hub` and the
engines this pipeline relies on. Do on the SS branch.

**Phase A — Stand up the derived contracts (additive; old HTML still works).**
1. Confirm the `render-status-board` skill resolves SS as a project and locates each view's source
   markdown (its `references/source-locations.md`). *Exit:* `/render-status-board decision-tree soul-steel`
   produces a contract from `_project/decisions/` without touching the old files.
2. Generate all three contracts (hub, decision-tree, plan-board) from the source markdown into a staging
   path. *Exit:* three derived contracts exist; diff them against the hand-authored ones to catch
   editorial content that must move into the source markdown rather than be lost.

**Phase B — Cut the surfaces over (one view at a time, verify each).**
3. Decision-tree first (pure planning data, lowest editorial risk): regenerate via the skill, point the
   command-center shell at the derived contract, delete `contracts/decision-tree.json`. *Exit:* the
   decision-tree renders from `_project/decisions/`; no hand-authored decision contract remains.
4. Plan-board next: same, sourced from `_project/pipeline/` + roadmap. *Exit:* `steel-city-inventory-wiring`
   (and any other plan-board) render from validated pipelines.
5. Hub last (most editorial): move the hex-map framing into the curated source markdown the skill reads,
   regenerate, retire `contracts/hub.json`. *Exit:* hub renders via the skill; the 6-domain map is
   preserved, now reproducible.

**Phase C — Reconcile the shell, server, and stale output.**
6. Re-source `soul-steel-command-center.html` + `command-center.manifest.json` from the derived
   contracts; the manifest becomes a thin index, not a data store. *Exit:* the command center HTML is
   pure phenotype — regenerable, hand-edit-free.
7. Update `command-center-server.mjs` `RUN_TASKS`: drop the dead `rebuild project-system graph` task,
   repoint "rebuild command center" at the skill/kit path, keep capture + planning-sessions + atlas;
   leave asset-explorer + code-topology tasks intact (out of scope, still runnable). *Exit:* the runner
   regenerates every in-scope surface; capture flow untouched.
8. Delete the stale `previews/dashboards/project-system*.{json,html}` (forked output); if a
   framework-hub view is still wanted, emit it via vendored `render-hub` instead. *Exit:* no
   `previews/` file is produced by a forked tool.

**Phase D — Preserve + flag for upstream.**
9. Verify the capture→file server, runner, code-topology, briefs, and asset explorer all still work
   untouched. *Exit:* `command-center.sh` boots; capture + file-to-inbox round-trips; out-of-scope
   surfaces render.
10. Open a framework follow-up: evaluate **upstreaming the quick-capture→inbox workflow** (item 5) and
    **consolidating planning-sessions into render-hub** (item 7) — both are generic enough to belong in
    the framework, not SS.

## Key decisions

- **Rendering path: adopt the `render-status-board` skill (source→contract→kit→HTML).** Chosen over
  (a) adopting `apps/command-center` (React) — different UX, abandons SS's static kit HTML; and
  (c) keeping hand-authored contracts behind a consistency check — keeps the manual burden. The skill
  preserves SS's exact look and kit while killing the drift, and is the framework-blessed path.
- **Editorial framing moves into source markdown, not lost.** The hub's hex map, brand/tone, and
  banners are curated, not derivable from `_project/`; they live in the curated source the skill reads
  (CLAUDE.md mission, `games/steel-city/status.md`), so they survive regeneration.
- **code-topology, design briefs, steel-city tokens stay out of planning scope** — like the asset
  explorer, they are code/design artifacts, not planning views; keep them, don't migrate them.
- **The capture→inbox server is kept and flagged for upstream** — it's the highest-value SS-native piece
  with no framework equivalent; migrating it *out* would lose function, so preserve now and consider
  generalizing it into the framework later.

## Exit criteria

- The three planning views (hub · decision-tree · plan-board) render via the `render-status-board`
  skill from validated `_project/` (+ curated source markdown); **no hand-authored `contracts/*.json`
  data files remain** (the manifest becomes a thin index).
- The command-center HTML is regenerable phenotype — a clean `/render-status-board` (or the runner)
  reproduces it with no hand edits.
- The quick-capture→inbox server, the regen runner, planning-sessions, the Atlas, code-topology, the
  design briefs, and the asset explorer all still work; capture round-trips to `inbox/`.
- No `previews/` file is emitted by a forked tool; the stale `project-system*` artifacts are gone.
- A framework follow-up is filed for upstreaming capture + consolidating planning-sessions.
