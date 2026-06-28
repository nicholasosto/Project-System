#!/usr/bin/env node
// Zero-dep integrity check for the Command-Center input contract(s).
// Loads EVERY committed <project>-graph.json in previews/dashboards/ (framework + in-repo
// demos), synthesizes nodes from byKind, and resolves every edge by stripping the folder prefix
// off `target` (the namespace asymmetry — see docs/spec/command-center-contract.md). Asserts each
// endpoint lands on a real node, for each emitted consumer. Mirrors the join in src/contract.ts
// but needs no build, so it runs in the zero-dep core's CI too.
//   node scripts/verify-contract.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DASH = join(HERE, '../../../previews/dashboards');
const REGEN = 'node apps/command-center/scripts/render-all.mjs';

function die(msg) {
  console.error(`[verify-contract] ${msg}`);
  process.exit(1);
}

// Verify one <project>-graph.json. `label` is the project slug, prefixed onto every message so a
// failure names which consumer drifted.
function verifyGraph(path, label) {
  let g;
  try {
    g = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(`${label}: could not read/parse ${path}: ${err.message}`);
  }
  if (!g || typeof g !== 'object' || typeof g.byKind !== 'object' || !Array.isArray(g.edges)) {
    die(`${label}: malformed graph.json — expected { byKind: object, edges: array }. Regenerate with: ${REGEN}`);
  }

  // Synthesize node ids and detect cross-kind collisions (ids must be globally unique or the DAG
  // silently overlaps).
  const idKinds = new Map();
  for (const [kind, bucket] of Object.entries(g.byKind)) {
    for (const id of Array.isArray(bucket?.ids) ? bucket.ids : []) {
      if (!idKinds.has(id)) idKinds.set(id, []);
      idKinds.get(id).push(kind);
    }
  }
  const collisions = [...idKinds].filter(([, kinds]) => kinds.length > 1);
  if (collisions.length) {
    console.error(`[verify-contract] ${label}: ${collisions.length} id collision(s) across kinds (node ids must be globally unique):`);
    for (const [id, kinds] of collisions) console.error(`  ✗ "${id}" appears in: ${kinds.join(', ')}`);
    process.exit(1);
  }
  const ids = new Set(idKinds.keys());

  // nodes[] (the per-entity detail the navigator reads) must agree with byKind (the aggregate).
  if (Array.isArray(g.nodes)) {
    const nodeIds = new Set();
    for (const n of g.nodes) {
      if (!n || typeof n.id !== 'string' || typeof n.kind !== 'string') {
        die(`${label}: malformed node in nodes[] (every node needs a string id + kind): ${JSON.stringify(n)}`);
      }
      nodeIds.add(n.id);
    }
    const onlyInNodes = [...nodeIds].filter((id) => !ids.has(id));
    const onlyInByKind = [...ids].filter((id) => !nodeIds.has(id));
    if (onlyInNodes.length || onlyInByKind.length) {
      console.error(`[verify-contract] ${label}: nodes[] and byKind disagree on the entity set:`);
      for (const id of onlyInNodes) console.error(`  ✗ "${id}" in nodes[] but not byKind`);
      for (const id of onlyInByKind) console.error(`  ✗ "${id}" in byKind but not nodes[]`);
      process.exit(1);
    }
  }

  // Field Guide (optional): tree node ids must be globally unique within the tree, and every
  // kind-folder must name a configured kind (it agrees with byKind — the guide's derived kinds
  // match the rest of the contract). Skipped silently for a contract that predates the payload.
  if (g.guide && typeof g.guide === 'object' && g.guide.root) {
    const seen = new Set();
    const kindFolderKinds = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (typeof n.id !== 'string') die(`${label}: guide node missing a string id: ${JSON.stringify(n)}`);
      if (seen.has(n.id)) die(`${label}: duplicate guide node id "${n.id}" (tree ids must be unique)`);
      seen.add(n.id);
      if (n.nodeType === 'kind-folder') {
        const kindFact = Array.isArray(n.facts) ? n.facts.find((f) => f && f.label === 'kind') : null;
        if (kindFact) kindFolderKinds.push(kindFact.value);
      }
      for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
    };
    walk(g.guide.root);
    const byKindKeys = new Set(Object.keys(g.byKind));
    const orphan = kindFolderKinds.filter((k) => !byKindKeys.has(k));
    if (orphan.length) die(`${label}: guide kind-folder(s) name kinds absent from byKind: ${orphan.join(', ')}`);
    console.log(`[verify-contract] ${label}: guide ok — ${seen.size} nodes · ${kindFolderKinds.length} kind-folders`);
  }

  // Resolve each edge target to a node id. `from` is a bare id; `target` is `<folder>/<id>`.
  const dangling = [];
  for (const e of g.edges) {
    const to = String(e.target).split('/').pop();
    if (!ids.has(e.from) || !ids.has(to)) dangling.push({ ...e, resolvedTo: to });
  }
  const resolved = g.edges.length - dangling.length;
  console.log(`[verify-contract] ${label}: ${ids.size} nodes · ${g.edges.length} edges · ${resolved} resolved`);
  if (dangling.length) {
    console.error(`[verify-contract] ${label}: ${dangling.length} edge(s) did not resolve to a node:`);
    for (const d of dangling) console.error(`  ✗ ${d.from} --${d.rel}--> ${d.target} (resolved "${d.resolvedTo}")`);
    process.exit(1);
  }
}

let files;
try {
  files = readdirSync(DASH).filter((f) => f.endsWith('-graph.json')).sort();
} catch (err) {
  die(`could not read ${DASH}: ${err.message}`);
}
if (!files.length) die(`no <project>-graph.json in previews/dashboards/ — regenerate with: ${REGEN}`);

for (const f of files) verifyGraph(join(DASH, f), f.replace('-graph.json', ''));
console.log(`[verify-contract] ok — ${files.length} contract(s), every edge resolves to a synthesized node`);
