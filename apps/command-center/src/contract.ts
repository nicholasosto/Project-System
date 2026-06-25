// The single consumer of the Command-Center input contract.
// See docs/spec/command-center-contract.md. The app reads ONLY these two emitted JSON
// artifacts; it never re-reads _project/. Regenerate them with:
//   node ../../tools/render-hub.mjs --no-render   (zero-dep; skips the external kit)
import type { GraphContract, GraphEdge, GraphNode, LineageTone } from '@trembus/viz';
import rawGraph from '../../../previews/dashboards/project-system-graph.json';
import rawHub from '../../../previews/dashboards/project-system-hub.json';

// ── Emitted contract shapes (mirror of buildModel()/hubContract() output) ──
export interface KindBucket {
  total: number;
  byStatus: Record<string, number>;
  ids: string[];
}
export interface RawEdge {
  from: string;
  fromKind: string;
  rel: string;
  target: string;
}
export interface RawGraph {
  generatedBy: string;
  project: string;
  entities: number;
  migrated: number;
  counts: { error: number; warning: number; info: number };
  byKind: Record<string, KindBucket>;
  edges: RawEdge[];
  edgesByRel: Record<string, number>;
}
export interface RawHub {
  brand: string;
  tagline: string;
  stats: { label: string; value: number; color?: string }[];
  scope: { label: string; num: string; value: string }[];
  [k: string]: unknown;
}

const graph = rawGraph as unknown as RawGraph;
const hub = rawHub as unknown as RawHub;

// One distinct tone per kind; `danger` stays reserved for error states.
const KIND_TONE: Record<string, LineageTone> = {
  decision: 'info',
  report: 'success',
  pipeline: 'accent',
  roadmap: 'neutral',
  session: 'warning',
};

// Slug → readable label: drop a leading serial (0001-) or ISO date (2026-06-24-), then de-kebab.
export function prettify(id: string): string {
  const stripped = id.replace(/^\d{4}(-\d{2}-\d{2})?-/, '');
  const words = stripped.replace(/-/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface BuildResult {
  data: GraphContract;
  dropped: RawEdge[];
}

// graph.json → @trembus/viz GraphContract.
//  · Nodes are synthesized from byKind (the file has no nodes[] array).
//  · Edges are joined by stripping the folder off `target` — `from` is a bare id but
//    `target` is a `folder/id` path (the namespace asymmetry documented in the spec).
//  · Unresolved edges are dropped and returned so the UI can flag contract drift.
export function buildGraphContract(g: RawGraph = graph, h: RawHub = hub): BuildResult {
  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  for (const [kind, bucket] of Object.entries(g.byKind)) {
    for (const id of bucket.ids) {
      ids.add(id);
      nodes.push({ id, label: prettify(id), kind, sub: kind, tone: KIND_TONE[kind] ?? 'neutral' });
    }
  }

  const edges: GraphEdge[] = [];
  const dropped: RawEdge[] = [];
  for (const e of g.edges) {
    // String() guards a non-string target (keeps this in step with verify-contract.mjs);
    // an empty result simply fails to resolve and the edge is dropped.
    const to = String(e.target).split('/').pop() ?? '';
    if (ids.has(e.from) && ids.has(to)) edges.push({ from: e.from, to, label: e.rel });
    else dropped.push(e);
  }

  return {
    data: {
      view: 'lineage',
      brand: h.brand ?? g.project,
      title: 'Entity graph',
      caption: `${g.entities} entities · ${edges.length} typed links · ${g.counts.error} errors`,
      direction: 'LR',
      nodes,
      edges,
    },
    dropped,
  };
}

export { graph, hub };
