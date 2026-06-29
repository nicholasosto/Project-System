# Command-Center input contract

> **Status:** frozen-for-v1 (2026-06-24) · enriched 2026-06-25 (per-entity `nodes[]` +
> `folderByKind`; P0 gaps closed) · enriched 2026-06-28 (`guide` tree — the Field Guide) ·
> realizes roadmap `command-center` **P0**.
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
(`id → swimlane contract`), `runs` (`id → windowed run history`), `phases`
(`id → phase list`) — each `{}` when none — `swimlaneKinds` (`string[]`: kinds whose
entities ARE workflows, from config `carriesSwimlanes`; `[]` when none) — and `guide` (the
Field Guide tree; see below).

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
link straight back to the markdown. A node also carries `tags` (the entity's tag map) **when it has
any** — omitted otherwise — so a view can filter/group by a facet without re-reading `_project/`
(e.g. the Roadmap groups `feature` nodes by `tags.tier` = required | optional).

### `byKind` — the per-kind aggregate

`byKind` is an **object keyed by kind name**; every configured kind is seeded even at zero
count. Each bucket is `{ total: number, byStatus: Record<status,count>, ids: string[], tone }`
(where `tone` is the kind's lineage color, derived from its accent dot — see below):

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
swimlane contract (`{ caption?, lanes[], steps[] }`) — inside a `## Workflow` body section (the
section name is config-driven via `render.workflowSection`). `buildModel()` extracts each into
`workflows`, an object keyed by **entity id**:

```json
"workflows": {
  "package-as-trembus-project-schema": {
    "view": "swimlane", "title": "Package as trembus project-schema",
    "code": "pipeline.package-as-trembus-project-schema",
    "caption": "How the framework reaches a third consumer.",
    "lanes": [ { "id": "framework", "label": "Framework", "kind": "system" }, … ],
    "steps": [ { "id": "mirror", "lane": "framework", "label": "…", "status": "done", "detail": "…", "note": "…", "to": ["adopt"] }, … ]
  }
}
```

**Authored swimlane shape** (the `@trembus/ui` `Swimlane` contract; `render-hub` spreads the
authored block through verbatim, so every field below already reaches the UI):

- **lane** — `{ id?, label (required), kind? }`, where `kind` ∈ `human · ai · system · tool ·
  neutral` (tints the lane). A step references its lane by `id`, else by `label`.
- **step** — `{ id?, lane (required), label (required), col?, status?, detail?, note?, to? }`:
  - `status` ∈ `done · active · pending · blocked · skipped` — tints the card + status dot.
  - `detail` — a short secondary line shown **on the card**.
  - `note` — guidance shown **in the inspector** when the step is selected.
  - `to` — successor step ids (draws a connector to each); `[]` marks a terminal step; omit to
    flow to the next step in order.
  - `col` — optional explicit 0-based column (otherwise steps flow sequentially).
- top-level optional **`caption`** — a one-line summary rendered above the board.

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

### `guide` — the Field Guide tree

A `{ generatedBy, version, root }` object — a hierarchical, self-serve reference to how the system
is structured and named, built by `buildGuide(ctx)` and rendered by the Command Center as an
expandable folder tree (the **Field Guide** tab + an Overview hex tile). `root` is a single node;
every node has the shape:

```json
{ "id": "project/decision", "label": "decisions/", "path": "_project/decisions",
  "nodeType": "kind-folder", "origin": "derived",
  "brief": "Holds entities of kind \"decision\". …",
  "facts": [ { "label": "filename scheme", "value": "serial · 4-digit" },
             { "label": "status enum", "value": ["proposed","accepted","superseded","rejected"] } ],
  "children": [ { "id": "project/decision/example", "label": "0001-example-title.md",
                  "nodeType": "kind-file", "origin": "derived", "brief": "…" } ] }
```

- `id` — **unique within the tree** (`verify-contract.mjs` asserts it); the UI uses it as the
  React key, the selection id, and the expansion key.
- `nodeType` ∈ `root | folder | file | kind-folder | kind-file | concept` (open — an unknown type
  degrades to a plain row).
- `origin` ∈ `authored | derived` — provenance. **Authored** nodes are the fixed framework anatomy
  (the vendored `schema/ · lib/ · tools/` core, the two hooks), identical for every consumer and
  sourced from `tools/guide-anatomy.mjs`. **Derived** nodes are generated from `ctx` (the config +
  base schema): the `_project/` subtree is one `kind-folder` per configured kind, with `facts`
  (filename scheme, status enum, initial status, required/scaffold sections, swimlane-carrying)
  pulled straight from the config; the `concept/primitives` and `concept/rels` facts come from the
  base schema's field sets and the config's `relTargetKinds`.
- `facts` — `{ label, value: string | string[] }[]`, the structured conventions the UI renders as
  meta pills + a "Conventions" section.
- Every `kind-folder` node's `kind` fact is a configured kind (it agrees with `byKind` —
  `verify-contract.mjs` asserts it).

Domain-neutral: no kind/folder/status is hard-coded in the engine. Two consumers with different
configs therefore emit different `_project/` subtrees while their authored `core/` subtree is
byte-identical — the proof of project-agnosticism.

---

## `project-system-hub.json`

A kit view-model (the hexagonal hub), distinct from the graph. The app uses it for **chrome
copy**, not topology. Always-present keys: `view` (`"hub"`), `brand`, `code`, `tagline`,
`tone`, `taglineNote`, `sub`, `axis`, `updated`, `sourceLine`, `stats`, `scopeTitle`,
`scope`, `strategy`, `domains`. Conditionally present (config-gated): `banner`, `ribbon`,
`ribbonTitle`, `ribbonTotal`, `paths`, and `nav` (an editorial tab bar — `{ panel }` for a
built-in panel or `{ label, kinds }` for a generic table; absent → the app derives one tab per
unconsumed kind).

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
   `{ id, label: title ?? prettify(id), kind, sub: status ?? kind, tone: toneByKind[kind] ?? 'neutral' }`
   (falls back to synthesizing from `byKind.ids` if an older contract has no `nodes[]`).
2. **Edges** — for each `e` in `edges`, emit `{ from: e.from, to: e.target.split('/').pop(),
   label: e.rel }`. Drop (and count) any edge whose `from` **or** `to` does not resolve to a
   node id.
3. **Chrome** — `title`/`brand`/`caption` from `hub.json`; counts/legend from
   `counts` + `edgesByRel`.

**Per-kind tone is data, not a hardcoded map.** Each `byKind` bucket carries a `tone`, derived by
`render-hub` from the kind's accent (`config.kinds.<k>.render.dot`, or an explicit
`render.tone`). The app reads `byKind.<k>.tone`, falling back to `neutral` (`danger` is reserved
for error states and never auto-assigned). Adding a kind therefore needs no app edit for tone.

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

Per-entity `tags` are now emitted on `nodes[]` (added 2026-06-28 for the Roadmap's required/optional
tiering). Remaining/optional: per-entity `links` and body sections are still not emitted (the app
derives links from the top-level `edges[]`); add them to `nodes[]` if a richer detail view needs them.

Re-verify any contract change with `node tools/render-hub.mjs --check && node
apps/command-center/scripts/verify-contract.mjs` (both run in `npm test`).
