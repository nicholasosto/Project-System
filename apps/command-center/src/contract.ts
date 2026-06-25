// The single consumer of the Command-Center input contract.
// See docs/spec/command-center-contract.md. The app reads ONLY these two emitted JSON
// artifacts; it never re-reads _project/. Regenerate them with:
//   node ../../tools/render-hub.mjs   (zero-dep)
import type { GraphContract, GraphEdge, GraphNode, LineageTone } from '@trembus/viz';
import type { HubContract, RunRecord, SwimlaneContract } from '@trembus/ui';
import rawGraph from '../../../previews/dashboards/project-system-graph.json';
import rawHub from '../../../previews/dashboards/project-system-hub.json';

// ── Emitted contract shapes (mirror of buildModel()/hubContract() output) ──
export interface KindBucket {
  total: number;
  byStatus: Record<string, number>;
  ids: string[];
}
// Per-entity record — the navigable detail the aggregate byKind buckets can't express.
export interface RawNode {
  id: string;
  kind: string;
  title: string | null;
  status: string | null;
  updated: string | null;
  file: string;
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
  folderByKind: Record<string, string>;
  entities: number;
  migrated: number;
  counts: { error: number; warning: number; info: number };
  nodes: RawNode[];
  byKind: Record<string, KindBucket>;
  edges: RawEdge[];
  edgesByRel: Record<string, number>;
  workflows?: Record<string, unknown>;
  runs?: Record<string, unknown>;
  phases?: Record<string, unknown>;
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

// Defensive fallback: synthesize bare records from byKind for an older contract with no nodes[].
function fallbackNodes(g: RawGraph): RawNode[] {
  const out: RawNode[] = [];
  for (const [kind, bucket] of Object.entries(g.byKind ?? {})) {
    for (const id of bucket.ids) out.push({ id, kind, title: null, status: null, updated: null, file: '' });
  }
  return out;
}

function rawNodes(g: RawGraph): RawNode[] {
  return Array.isArray(g.nodes) && g.nodes.length ? g.nodes : fallbackNodes(g);
}

// ── The navigable entity list (per-entity detail, from the emitted nodes[]) ──
export interface EntityRecord {
  id: string;
  kind: string;
  title: string;
  status: string;
  updated: string;
  file: string;
  tone: LineageTone;
}

function toRecord(n: RawNode): EntityRecord {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title ?? prettify(n.id),
    status: n.status ?? '—',
    updated: n.updated ?? '—',
    file: n.file ?? '',
    tone: KIND_TONE[n.kind] ?? 'neutral',
  };
}

export const entities: EntityRecord[] = rawNodes(graph).map(toRecord);

// Declared-order kind list (decision, report, pipeline, …), straight from byKind.
export const kinds: string[] = Object.keys(graph.byKind ?? {});

export function entitiesOfKinds(...wanted: string[]): EntityRecord[] {
  const set = new Set(wanted);
  return entities.filter((e) => set.has(e.kind));
}

export interface BuildResult {
  data: GraphContract;
  dropped: RawEdge[];
}

// graph.json → @trembus/viz GraphContract.
//  · Nodes come from the emitted nodes[] (real title/status), falling back to byKind ids.
//  · Edges are joined by stripping the folder off `target` — `from` is a bare id but
//    `target` is a `folder/id` path (the namespace asymmetry documented in the spec).
//    Node ids are globally unique (verify-contract enforces), so the final segment resolves.
//  · Unresolved edges are dropped and returned so the UI can flag contract drift.
export function buildGraphContract(g: RawGraph = graph, h: RawHub = hub): BuildResult {
  const ids = new Set<string>();
  const nodes: GraphNode[] = rawNodes(g).map((n) => {
    ids.add(n.id);
    return {
      id: n.id,
      label: n.title ?? prettify(n.id),
      kind: n.kind,
      sub: n.status ?? n.kind,
      tone: KIND_TONE[n.kind] ?? 'neutral',
    };
  });

  const edges: GraphEdge[] = [];
  const dropped: RawEdge[] = [];
  for (const e of g.edges) {
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

// The hub view-model typed for @trembus/ui's <Hub>. hub.json IS the Trembus hub contract,
// so it renders unchanged; this is the same object the header reads via `hub`.
export const hubData = hub as unknown as HubContract;

// Per-entity structured workflows (swimlane contracts) emitted by render-hub.mjs from an
// entity's `## Workflow` block, keyed by entity id. Phase 2: the Workflows tab renders these.
export const workflows: Record<string, SwimlaneContract> =
  (graph.workflows ?? {}) as Record<string, SwimlaneContract>;

// Per-entity run history emitted from a `## Runs` block: the latest `runsWindow` records
// (newest-first) plus `total` + `rollup` over the full set. Phase 3: RunHistory + time-travel.
export interface EntityRuns {
  total: number;
  rollup: { byStatus: Record<string, number> };
  runs: RunRecord[];
}
export const runs: Record<string, EntityRuns> = (graph.runs ?? {}) as Record<string, EntityRuns>;

// ── Planning / progress facets ──
// These already ship in hub.json (the live <Hub> renders only brand/stats/domains/inspector,
// so it ignores them). The Progress board reads the development `ribbon` (milestone phases),
// the coverage `scope` tiles, and `strategy`; the hex details panel reads `domains` to caption
// the selected tile. No renderer change needed — the contract already carries all of it.
export interface RibbonMilestone {
  code: string;
  name: string;
  date?: string;
  /** Config-driven progress state: shipped | current | planned. */
  kind: string;
}
export interface ScopeItem {
  label: string;
  num: string;
  value: string;
}
export type DomainSource = string | { label: string; href?: string };
export interface HubDomainRec {
  id: string;
  kind: string;
  tag: string;
  name: string;
  sub: string;
  status: string;
  dot?: string;
  note?: string;
  sources?: DomainSource[];
}

// Per-entity development phases emitted from a `## Phases` block (a roadmap's structured plan),
// keyed by entity id. The Progress board renders these as a Timeline. Domain-neutral: `status`
// is the project's own vocabulary, mapped to a tone by the consumer.
export interface Phase {
  id?: string;
  label: string;
  status?: string;
  detail?: string;
  note?: string;
}
export const phasesByEntity: Record<string, Phase[]> = (graph.phases ?? {}) as Record<
  string,
  Phase[]
>;

export const ribbon: RibbonMilestone[] = (hub.ribbon as RibbonMilestone[]) ?? [];
export const ribbonTitle: string = (hub.ribbonTitle as string) ?? 'Milestones';
export const ribbonTotal: string | undefined = hub.ribbonTotal as string | undefined;
export const scope: ScopeItem[] = (hub.scope as ScopeItem[]) ?? [];
export const strategy: string = (hub.strategy as string) ?? '';
export const domains: HubDomainRec[] = (hub.domains as HubDomainRec[]) ?? [];
// Selected hub tile id → its domain record (id is the entity kind for petals; 'contract'/'tooling'
// for the center + tooling slot). Powers the hex details panel.
export const domainById: Map<string, HubDomainRec> = new Map(domains.map((d) => [d.id, d]));

export { graph, hub };
