# Command Center

A live web surface for the Project-System **ProjectEntity** graph, rendered with the
[Trembus Component Library](../../../../Repositories/Trembus-Component-Library)
(`@trembus/ui` + `@trembus/viz`). Realizes the `command-center` roadmap, phases **P1–P2**.

## The boundary (read this first)

**Framework-core is zero runtime dependencies / npm-free.** This app is a **separate
dependency island** — its own `package.json`, its own `node_modules`, its own build. The two
must never share a manifest:

- The root [`package.json`](../../package.json) stays dependency-free. `node
  tools/check-zero-deps.mjs` (wired into `npm test`) enforces this and forbids `apps/` from
  the published `files` allowlist.
- This app consumes the core only as a **CLI subprocess** (`node ../../tools/render-hub.mjs`)
  — never by importing `tools/` or `lib/` as packages. So the app's deps never leak into core.
- Build artifacts (`dist/`, `node_modules/`, caches) are git-ignored at the repo root.

## Data flow

```
_project/*.md ──(node tools/render-hub.mjs --no-render)──▶ previews/dashboards/*.json ──▶ this app
   source of truth          zero-dep, no kit needed            the input contract        Trembus viz
```

The app reads **only** `previews/dashboards/project-system-graph.json` and
`project-system-hub.json`. It never re-reads `_project/`. The contract is specified in
[docs/spec/command-center-contract.md](../../docs/spec/command-center-contract.md);
`src/contract.ts` is its single consumer.

## How the Trembus packages are wired

They are **not** npm dependencies here. `@trembus/viz`'s manifest declares
`@trembus/tokens: workspace:*`, which a cross-repo `file:` install cannot resolve. Instead
`vite.config.ts` **aliases** `@trembus/ui` / `@trembus/viz` to their built `dist/` in the
sibling checkout (the dist already bundles the tokens layer). The app installs only the
genuinely-external runtime deps the viz bundle expects: `react`, `react-dom`, `d3-hierarchy`,
`@dagrejs/dagre`.

> **Precondition:** the library `dist/` must exist. Build it once from the TCL repo root:
> `pnpm -r build` (rebuild after pulling TCL changes). `@trembus/tokens` is source-only and
> needs no build.

## Run it

```sh
# 1. one-time, in the Trembus-Component-Library repo:
pnpm -r build

# 2. here:
pnpm install
pnpm dev            # http://localhost:5175
```

Other scripts: `pnpm build` (typecheck + production bundle), `pnpm preview`,
`pnpm verify:contract` (zero-dep check that every emitted edge resolves to a node).

## Status / next

- **P1 — island scaffold** ✅ Vite + React 19, Trembus aliases, theme wired (`data-theme="dark"`).
- **P2 — render the graph** ✅ (first pass) `graph.json` → `@trembus/viz` `Lineage`.
- **P3 — three boards** ⏳ Hub · Decision-Tree (`Tree`) · Plan-Progress tabs.
- **P4 — live reload** ⏳ watch `_project/` → re-run `render-hub.mjs --no-render` → hot repaint.
