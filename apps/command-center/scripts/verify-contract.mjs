#!/usr/bin/env node
// Zero-dep integrity check for the Command-Center input contract.
// Loads the committed graph.json, synthesizes nodes from byKind, and resolves every edge by
// stripping the folder prefix off `target` (the namespace asymmetry — see
// docs/spec/command-center-contract.md). Asserts each endpoint lands on a real node. Mirrors
// the join in src/contract.ts but needs no build, so it runs in the zero-dep core's CI too.
//   node scripts/verify-contract.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(HERE, '../../../previews/dashboards/project-system-graph.json');

function die(msg) {
  console.error(`[verify-contract] ${msg}`);
  process.exit(1);
}

let g;
try {
  g = JSON.parse(readFileSync(GRAPH, 'utf8'));
} catch (err) {
  die(`could not read/parse ${GRAPH}: ${err.message}`);
}
if (!g || typeof g !== 'object' || typeof g.byKind !== 'object' || !Array.isArray(g.edges)) {
  die(`malformed graph.json — expected { byKind: object, edges: array }. Regenerate with: node tools/render-hub.mjs --no-render`);
}

// Synthesize node ids and detect cross-kind collisions (graph.json has no nodes[] array;
// ids are only unique-by-coincidence today — a collision would silently overlap in the DAG).
const idKinds = new Map();
for (const [kind, bucket] of Object.entries(g.byKind)) {
  for (const id of Array.isArray(bucket?.ids) ? bucket.ids : []) {
    if (!idKinds.has(id)) idKinds.set(id, []);
    idKinds.get(id).push(kind);
  }
}
const collisions = [...idKinds].filter(([, kinds]) => kinds.length > 1);
if (collisions.length) {
  console.error(`[verify-contract] ${collisions.length} id collision(s) across kinds (node ids must be globally unique):`);
  for (const [id, kinds] of collisions) console.error(`  ✗ "${id}" appears in: ${kinds.join(', ')}`);
  process.exit(1);
}
const ids = new Set(idKinds.keys());

// nodes[] (emitted since the contract enrichment) must agree with byKind: same id set,
// every record carrying a string id + kind. byKind stays the aggregate; nodes[] is the
// per-entity detail the navigator reads. A mismatch means a stale or hand-edited graph.json.
if (Array.isArray(g.nodes)) {
  const nodeIds = new Set();
  for (const n of g.nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.kind !== 'string') {
      die(`malformed node in nodes[] (every node needs a string id + kind): ${JSON.stringify(n)}`);
    }
    nodeIds.add(n.id);
  }
  const onlyInNodes = [...nodeIds].filter((id) => !ids.has(id));
  const onlyInByKind = [...ids].filter((id) => !nodeIds.has(id));
  if (onlyInNodes.length || onlyInByKind.length) {
    console.error('[verify-contract] nodes[] and byKind disagree on the entity set:');
    for (const id of onlyInNodes) console.error(`  ✗ "${id}" in nodes[] but not byKind`);
    for (const id of onlyInByKind) console.error(`  ✗ "${id}" in byKind but not nodes[]`);
    process.exit(1);
  }
}

// Resolve each edge target to a node id. `from` is a bare id; `target` is `<folder>/<id>`
// (folderByKind confirms the folder is a real kind). Node ids are globally unique (the
// collision check above), so the final path segment resolves unambiguously.
const dangling = [];
for (const e of g.edges) {
  const to = String(e.target).split('/').pop();
  if (!ids.has(e.from) || !ids.has(to)) dangling.push({ ...e, resolvedTo: to });
}

const resolved = g.edges.length - dangling.length;
console.log(`[verify-contract] ${ids.size} nodes · ${g.edges.length} edges · ${resolved} resolved`);

if (dangling.length) {
  console.error(`[verify-contract] ${dangling.length} edge(s) did not resolve to a node:`);
  for (const d of dangling) {
    console.error(`  ✗ ${d.from} --${d.rel}--> ${d.target} (resolved "${d.resolvedTo}")`);
  }
  process.exit(1);
}
console.log('[verify-contract] ok — every edge resolves to a synthesized node');
