# Command-Center input contract

> **Status:** frozen-for-v1 (2026-06-24) · enriched 2026-06-25 (per-entity `nodes[]` +
> `folderByKind`; P0 gaps closed) · realizes roadmap `command-center` **P0**.
>
> This is the seam between the zero-dep framework-core and the `apps/command-center/`
> render island. The framework emits two JSON artifacts; the app consumes **only** these.
> Nothing in the app re-reads `_project/`. Keep this doc in step with `tools/render-hub.mjs`.

## What the framework emits

`node tools/render-hub.mjs` writes two files into `previews/dashboards/`:

| File | Role | Built by |
|---|---|---|
| `project-system-graph.json` | the **entity graph** — node-link source of truth | `buildModel()` |
| `project-system-hub.json` | the **hub view-model** — presentation-ready chrome copy | `hubContract()` |

The generator is npm-free — it produces the JSON with zero dependencies. `tools/render-hub.mjs
--check` asserts **both** committed files are in sync — `graph.json` by exact diff (it carries
no daily-drifting field) and `hub.json` date-insensitively (`updated` drifts daily). Both
`--check` and `node apps/command-center/scripts/verify-contract.mjs` (graph.json internal
integrity: id-uniqueness, `nodes[]`↔`byKind` agreement, edge resolution) are wired into
`npm test`.

---

## `project-system-graph.json`

Top-level keys (all always present): `generatedBy`, `project`, `folderByKind`
(`kind → folder` map), `entities` (number), `migrated` (number), `counts`
`{error,warning,info}`, `nodes`, `byKind`, `edges`, `edgesByRel`, `workflows`
(`id → swimlane contract`), `runs` (`id → windowed run history`), and `phases`
(`id → phase list`) — each `{}` when none.

### `nodes[]` — the per-entity records

`nodes` is a flat array, one object per entity, carrying the authored detail the navigator reads:

```json
{ "id": "0001-home-…", "kind": "decision",
  "title": "Home the project-system framework in its own space",
  "status": "accepted", "updated": "2026-06-24",
  "file": "_project/decisions/0001-home-….md" }
```

`title`/`status`/`updated` are `null` when the entity omits them. `kind` and `id` stay
loader-derived (from folder + filename); `file` is the repo-relative source path, so the UI can
link straight back to the markdown.

### `byKind` — the per-kind aggregate

`byKind` is an **object keyed by kind name**; every configured kind is seeded even at zero
count. Each bucket is `{ total: number, byStatus: Record<status,count>, ids: string[] }`:

```json
"decision": { "total": 3, "byStatus": { "accepted": 3 }, "ids": ["0001-…", "0002-…", "0003-…"] }
```

It is the rollup (status distribution, counts) that complements `nodes[]`. `byStatus` uses the
literal key `"—"` for a statusless entity. `nodes[]` and `byKind` always describe the **same
entity set** — `verify-contract.mjs` asserts it.

### `edges[]`

Each edge is exactly `{ from, fromKind, rel, target }`, all four always present:

```json
{ "from": "2026-06-24-extract-…-soul-steel", "fromKind": "report",
  "rel": "decided-in", "target": "decisions/0001-home-…" }
```

**Namespace asymmetry (the load-bearing gotcha):** `from` is a **bare id**; `target` is a
**`<folder>/<id>` path**. To resolve an edge to a node, strip the folder:
`target.split('/').pop()` — node ids are globally unique (`verify-contract.mjs` enforces it).
The folder→kind map (`folderByKind`) is now **emitted at the top level** of this file, so a
consumer can also resolve precisely via `kind = folderByKind[folder]` without assuming
`folder === kind` (`decisions`→`decision`, but `roadmap`→`roadmap`).

`edgesByRel` is a `rel → count` frequency map over `edges` — a ready-made legend.

### `workflows` — optional structured swimlanes

An entity MAY declare a workflow by putting a single fenced ` ```json ` block — a Trembus
swimlane contract (`{ lanes[], steps[] }`) — inside a `## Workflow` body section (the section
name is config-driven via `render.workflowSection`). `buildModel()` extracts each into
`workflows`, an object keyed by **entity id**:

```json
"workflows": {
  "package-as-trembus-project-schema": {
    "view": "swimlane", "title": "Package as trembus project-schema",
    "code": "pipeline.package-as-trembus-project-schema",
    "lanes": [ { "id": "framework", "label": "Framework", "kind": "system" }, … ],
    "steps": [ { "id": "mirror", "lane": "framework", "label": "…", "status": "done", "to": ["adopt"] }, … ]
  }
}
```

`title`/`code` default from the entity (overridable in the block). A malformed block is warned
and skipped (it never appears here). The Command Center renders each as a `@trembus/ui`
`Swimlane`. See decision `0004-pipeline-entities-carry-a-structured-workflow-block`.

### `runs` — optional, windowed run history

An entity MAY also declare a `## Runs` body section: a fenced ` ```json ` block holding an
**array of run records** (the `@trembus/ui` `RunHistory` shape — `{ id, label, status, startedAt,
durationMs?, trigger?, note?, stepOutcomes?, outputs? }`). `buildModel()` sorts them newest-first
and emits, under `runs` keyed by **entity id**, only the latest `render.runsWindow` (default 25)
plus a summary of the full set:

```json
"runs": {
  "package-as-trembus-project-schema": {
    "total": 2,
    "rollup": { "byStatus": { "running": 1, "partial": 1 } },
    "runs": [ { "id": "…", "status": "running", "startedAt": "2026-06-25",
                "stepOutcomes": [ { "step": "mirror", "status": "done" } ] }, … ]
  }
}
```

A run's `stepOutcomes[].step` must match a `SwimlaneStep.id` in the same entity's workflow; the
Command Center replays the selected run over the swimlane (steps with no outcome fall to
`pending`). Windowing keeps the contract bounded as the log grows — see decision
`0005-window-run-history-in-the-contract-sidecar-at-scale`.

### `phases` — optional development phases

An entity (typically a roadmap) MAY declare a `## Phases` body section: a fenced ` ```json `
block holding an **array of phase records** — a structured projection of its prose plan. The
section name is config-driven via `render.phasesSection` (default `Phases`). `buildModel()`
passes the array straight through under `phases`, keyed by **entity id**:

```json
"phases": {
  "command-center": [
    { "id": "P0", "label": "Freeze the contract", "status": "done", "detail": "…" },
    { "id": "P3", "label": "The three boards", "status": "active", "detail": "…" }
  ]
}
```

The shape is open; a typical record is `{ id?, label, status?, detail? }`. Domain-neutral: the
engine invents no phase semantics — `status` words are the project's own, mapped to tones by the
consumer (the Command Center renders each list as a `@trembus/ui` `Timeline`).

---

## `project-system-hub.json`

A kit view-model (the hexagonal hub), distinct from the graph. The app uses it for **chrome
copy**, not topology. Always-present keys: `view` (`"hub"`), `brand`, `code`, `tagline`,
`tone`, `taglineNote`, `sub`, `axis`, `updated`, `sourceLine`, `stats`, `scopeTitle`,
`scope`, `strategy`, `domains`. Conditionally present (config-gated): `banner`, `ribbon`,
`ribbonTitle`, `ribbonTotal`, `paths`.

- `stats[]` — `{ label: string, value: number, color?: hex }` (`color` only on `errors`).
- `scope[]` — `{ label: string, num: string, value: string }` (**`num` is a string**, even
  for numerics).
- `domains[]` — hub tiles (center + petals + tooling); kit-internal `pos` slot names. Not
  used for topology.

---

## Mapping → `@trembus/viz`

The app maps the graph onto `@trembus/viz`'s `Lineage` (`GraphContract`). Verified prop
shapes (see `@trembus/viz` `dist/index.d.ts`):

- `GraphNode { id*, label*, kind?, tone?, color?, sub?, note? }`
- `GraphEdge { from*, to*, label?, tone?, dashed? }` — note **`to`**, not `target`.
- `GraphContract { nodes*, edges*, view?, brand?, code?, title?, caption?, direction? }`
- `tone` ∈ `accent | info | success | warning | danger | neutral` (the `@trembus/tokens` ontology).

### Construction algorithm (implemented in `apps/command-center/src/contract.ts`)

1. **Nodes** — for each record in `nodes[]`, emit
   `{ id, label: title ?? prettify(id), kind, sub: status ?? kind, tone: KIND_TONE[kind] ?? 'neutral' }`
   (falls back to synthesizing from `byKind.ids` if an older contract has no `nodes[]`).
2. **Edges** — for each `e` in `edges`, emit `{ from: e.from, to: e.target.split('/').pop(),
   label: e.rel }`. Drop (and count) any edge whose `from` **or** `to` does not resolve to a
   node id.
3. **Chrome** — `title`/`brand`/`caption` from `hub.json`; counts/legend from
   `counts` + `edgesByRel`.

`KIND_TONE` (one distinct tone per kind, `danger` reserved for error states):

| kind | tone |
|---|---|
| decision | `info` |
| report | `success` |
| pipeline | `accent` |
| roadmap | `neutral` |
| session | `warning` |

---

## Contract backlog (status)

The four P0 gaps were closed by the contract enrichment (2026-06-25):

1. ✅ **Per-entity `title`/`status`/`updated`/`file`.** `buildModel()` now emits `nodes[]`
   (above). The navigator shows real titles and live status, and can link to the source file.
2. ✅ **Edge-endpoint namespace.** `folderByKind` is now emitted, so resolution can be made
   collision-safe via the folder→kind map; `verify-contract.mjs` also asserts global
   id-uniqueness as a backstop.
3. ✅ **`nodes[]` array.** Emitted — subsumed by #1.
4. ✅ **`--check` covers `graph.json`.** `render-hub.mjs --check` now diffs both files, and
   `--check` + `verify-contract.mjs` are wired into `npm test`.

Remaining/optional: per-entity `links` and body sections are still not emitted (the app derives
links from the top-level `edges[]`); add them to `nodes[]` if a richer detail view needs them.

Re-verify any contract change with `node tools/render-hub.mjs --check && node
apps/command-center/scripts/verify-contract.mjs` (both run in `npm test`).
