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

They are installed from the **npm registry** like any other dependency — `@trembus/ui` and
`@trembus/viz` at `^0.1.0`, with `@trembus/tokens` pulled in transitively. `@trembus/viz`
brings its own runtime deps (`d3-hierarchy`, `@dagrejs/dagre`); `react`/`react-dom` are peer
deps this app provides. `vite.config.ts` keeps only `dedupe: ['react','react-dom']` so a
transitive copy can't shadow the app's React. CSS arrives via each package's `./styles.css`
export, imported in load-bearing order in `main.tsx` (ui → viz → app chrome).

> Earlier (pre-publish) the app aliased `@trembus/*` to a sibling `Trembus-Component-Library`
> checkout's `dist/` to dodge the unresolvable `@trembus/tokens: workspace:*`. The registry
> publish (2026-06-25) rewrote that to a real range, so the alias workaround and its
> `pnpm -r build` precondition are gone.

## Run it

```sh
pnpm install
pnpm dev            # http://localhost:5175
```

Other scripts: `pnpm build` (typecheck + production bundle), `pnpm preview`,
`pnpm verify:contract` (zero-dep check that every emitted edge resolves to a node).

## Status / next

- **P1 — island scaffold** ✅ Vite + React 19, Trembus aliases, theme wired (`data-theme="dark"`).
- **P2 — render the graph** ✅ `graph.json` → `@trembus/viz` `Lineage`. The contract now emits
  per-entity `nodes[]` + `folderByKind`, so nodes show real titles and live status.
- **P3 — navigate the areas** 🚧 `@trembus/ui` `Tabs` shell — **Overview** (the graph) ·
  **Decisions** · **Workflows** · **Progress** (per-area entity tables from `nodes[]`). Next:
  the rich per-area visuals (Hub stats, Decision-`Tree`, Plan-Progress board) + entity drill-down.
- **P4 — live reload** ⏳ watch `_project/` → re-run `render-hub.mjs --no-render` → hot repaint.
