# Command-Center input contract

> **Status:** frozen-for-v1 (2026-06-24) · realizes roadmap `command-center` **P0**.
>
> This is the seam between the zero-dep framework-core and the `apps/command-center/`
> render island. The framework emits two JSON artifacts; the app consumes **only** these.
> Nothing in the app re-reads `_project/`. Keep this doc in step with `tools/render-hub.mjs`.

## What the framework emits

`node tools/render-hub.mjs --no-render` writes two files into `previews/dashboards/`:

| File | Role | Built by |
|---|---|---|
| `project-system-graph.json` | the **entity graph** — node-link source of truth | `buildModel()` |
| `project-system-hub.json` | the **hub view-model** — presentation-ready chrome copy | `hubContract()` |

`--no-render` is the npm-free path: it produces the JSON without invoking the external
visual-grammar kit, so the contract refreshes with zero dependencies. `tools/render-hub.mjs
--check` asserts the committed **`hub.json`** is in sync (date-insensitive). ⚠ It does **not**
yet compare `graph.json` — the topology the app actually consumes — so the drift guard has a
hole; see *Known gaps* below. Run `node apps/command-center/scripts/verify-contract.mjs` to
check `graph.json`'s internal integrity in the meantime.

---

## `project-system-graph.json`

Top-level keys (all always present): `generatedBy`, `project`, `entities` (number),
`migrated` (number), `counts` `{error,warning,info}`, `byKind`, `edges`, `edgesByRel`.

### Nodes are not an array — they are `byKind`

`byKind` is an **object keyed by kind name**; every configured kind is seeded even at zero
count. Each bucket is `{ total: number, byStatus: Record<status,count>, ids: string[] }`.

```json
"decision": {
  "total": 3,
  "byStatus": { "accepted": 3 },
  "ids": ["0001-home-…", "0002-mirror-…", "0003-quarantine-…"]
}
```

There is **no per-entity object** — only the `id` strings in `ids[]` and the aggregate
`byStatus`. A node, to the app, is the synthesized pair **`(kind, id)`**; an individual
entity's `title`/`status`/`updated` are **not** recoverable from this file (only the per-kind
status *distribution* is). `byStatus` uses the literal key `"—"` for a statusless entity.

### `edges[]`

Each edge is exactly `{ from, fromKind, rel, target }`, all four always present:

```json
{ "from": "2026-06-24-extract-…-soul-steel", "fromKind": "report",
  "rel": "decided-in", "target": "decisions/0001-home-…" }
```

**Namespace asymmetry (the load-bearing gotcha):** `from` is a **bare id**; `target` is a
**`<folder>/<id>` path**. They are not in the same namespace. To resolve an edge to a node,
strip the folder: `target.split('/').pop()`. The folder→kind map (`folderByKind`) lives in
`project-system.config.json`, **not** in this file, so do not assume `folder === kind`
(`decisions`→`decision`, but `roadmap`→`roadmap`).

`edgesByRel` is a `rel → count` frequency map over `edges` — a ready-made legend.

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

1. **Nodes** — for each `kind` in `byKind`, for each `id` in `byKind[kind].ids`, emit
   `{ id, label: prettify(id), kind, sub: kind, tone: KIND_TONE[kind] ?? 'neutral' }`.
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

## Known gaps (contract backlog — surfaced by P0)

These are why the mapping needs a join step rather than being identity. Each is a candidate
enhancement to `buildModel()`; none blocks v1.

1. **No per-entity `title`/`status`.** The app prettifies the `id` slug for labels and cannot
   show an entity's individual status. *Fix:* have `buildModel()` emit a flat
   `nodes[] = { id, kind, title, status, updated }` alongside `byKind`.
2. **Edge endpoints span two namespaces** (`from` bare, `target` folder-prefixed). The app
   strips the folder; this is collision-unsafe if two kinds ever share an id slug. *Fix:*
   emit `folderByKind`, or namespace both endpoints as `kind/id`.
3. **No `nodes[]` array.** The app synthesizes nodes from `byKind`. Emitting a real `nodes[]`
   (gap 1's fix) subsumes this.
4. **`--check` does not cover `graph.json`.** `render-hub.mjs`'s `check()` only diffs
   `hub.json`; the topology source the app consumes is unguarded, so a stale `graph.json`
   passes CI silently. *Fix:* extend `check()` to also diff `graph.json` (it carries no daily
   field, so no normalization is needed), then wire `render-hub.mjs --check` **and**
   `apps/command-center/scripts/verify-contract.mjs` into `npm test`. Until then the
   collision/integrity guard in `verify-contract.mjs` is the only automated check on the
   graph.

When these land, bump this doc's status and re-verify with
`node apps/command-center/scripts/verify-contract.mjs`.
