---
title: "Window run history in the contract; sidecar at scale"
status: accepted
updated: 2026-06-25
---

# Window run history in the contract; sidecar at scale

> **Status:** accepted (2026-06-25)

## Context

Run history (Phase 3 of the command-center) follows decision 0004's pattern: an entity carries
a `## Runs` fenced-JSON block, emitted into the contract and rendered by the Command Center.
But runs are **append-only log data** — unlike a ProjectEntity, which is a bounded, hand-authored
artifact. Left inline and unbounded, a busy workflow's runs would (a) bury the markdown file
under machine data, (b) bloat the committed `graph.json` the app statically imports, and (c)
flood the un-virtualized run table. The question: how to support run history without letting
unbounded logs break the "a few readable planning files" premise.

## Decision

`render-hub.mjs` emits a **windowed** run set, not the whole log. `extractRuns()` sorts the
authored runs newest-first and keeps only the latest `render.runsWindow` (default 25), alongside
`total` and a `rollup` (status counts over the full set). The Command Center renders the window
and shows "latest N of M" when truncated. The full log stays in the authored source.

This bounds what the contract and the app carry, regardless of how long the source grows — and
makes scale a **config change** (`runsWindow`), not a rewrite.

## Consequences

- The emitted `runs` map is bounded by `runsWindow` even as a workflow accrues hundreds of runs;
  `graph.json` and the JS bundle stay lean; `--check` cost stays flat.
- `total`/`rollup` keep the summary honest without shipping every record.
- When the authored source itself gets large, the next step is a **sidecar** append-only log
  (e.g. `<id>.runs.jsonl`) that `extractRuns` reads and windows — only that function and the
  `window` change; the Swimlane/RunHistory renderers are untouched. (0004 rejected a sidecar for
  workflow *definitions*; an append-only run *log* is the opposite data shape, so a sidecar fits.)
- Genuinely high-volume, machine-generated runs are the signal that a workflow is a real
  execution pipeline whose telemetry belongs in an external feed — funneled through the same
  windowed seam, never a live subprocess (the framework stays zero-dep).

## Options considered

- **Emit the full inline log** — rejected: unbounded growth bloats `graph.json` (statically
  imported into the app bundle) and the un-virtualized run table; the markdown stops being a
  readable artifact.
- **Window only in the UI (emit all, show N)** — rejected: the app still imports the whole log;
  the contract and bundle still bloat. Bounding must happen at emission.
- **Window in the emitter (latest N + total + rollup)** — chosen: bounds the contract at the
  source of truth, keeps a faithful summary, and defers the sidecar until actually needed.

## Cites

- [0004-pipeline-entities-carry-a-structured-workflow-block](0004-pipeline-entities-carry-a-structured-workflow-block.md) — the `## Workflow` pattern this mirrors.
- `tools/render-hub.mjs` — `extractRuns()` + the windowed `runs` emission.
- [docs/spec/command-center-contract.md](../../docs/spec/command-center-contract.md) — the emitted `runs` shape.

## Re-open if

A consumer needs the full run history in the contract (not just a window), or run volume on a
real execution pipeline argues for moving runs out of `_project/` into a dedicated telemetry feed.
