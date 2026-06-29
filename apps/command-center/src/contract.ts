// The single consumer of the Command-Center input contract.
// See docs/spec/command-center-contract.md. The app reads ONLY these two emitted JSON
// artifacts; it never re-reads _project/. Regenerate them with:
//   node ../../tools/render-hub.mjs   (zero-dep)
import type { GraphContract, GraphEdge, GraphNode, LineageTone } from '@trembus/viz';
import type { HubContract, RunRecord, SwimlaneContract, SwimlaneStep } from '@trembus/ui';
import psGraph from '../../../previews/dashboards/project-system-graph.json';
import psHub from '../../../previews/dashboards/project-system-hub.json';
import ssGraph from '../../../previews/dashboards/soul-steel-demo-graph.json';
import ssHub from '../../../previews/dashboards/soul-steel-demo-hub.json';

// ── Emitted contract shapes (mirror of buildModel()/hubContract() output) ──
export interface KindBucket {
  total: number;
  byStatus: Record<string, number>;
  ids: string[];
  /** Lineage tone for this kind's entities, derived by render-hub from the kind's accent dot. */
  tone?: LineageTone;
  /** The kind's declared status enum, in config order — the category order for entity briefs. */
  statusOrder?: string[];
}
// Per-entity record — the navigable detail the aggregate byKind buckets can't express.
export interface RawNode {
  id: string;
  kind: string;
  title: string | null;
  status: string | null;
  updated: string | null;
  file: string;
  /** The entity's tag map (omitted when none) — lets a view filter/group by a facet, e.g. tier. */
  tags?: Record<string, string>;
  /** First-paragraph gist of the body (markdown-stripped, ~220 chars). Omitted for a prose-less body. */
  excerpt?: string;
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
  /** Kinds whose entities ARE workflows (config `carriesSwimlanes`). Drives the workflow picker. */
  swimlaneKinds?: string[];
  /** The Field Guide tree (framework anatomy + config-derived naming conventions). Optional: an
   *  older contract or a consumer that predates the field omits it; the app degrades gracefully. */
  guide?: GuideContract;
}

// ── Field Guide (framework & naming reference) ──
// A tree the app renders as an expandable folder explorer; clicking a node shows its brief.
// The framework anatomy (schema/·lib/·tools/·hooks) is authored; the _project/ surface and the
// rel/primitive concepts are derived by render-hub from the project's config + base schema.
export interface GuideFact {
  label: string;
  value: string | string[];
}
export interface GuideNode {
  id: string;
  label: string;
  path?: string | null;
  /** root | folder | file | kind-folder | kind-file | concept (open — unknown degrades sanely). */
  nodeType: string;
  /** authored (framework anatomy) | derived (from this project's config). */
  origin?: string;
  brief?: string;
  facts?: GuideFact[];
  children?: GuideNode[];
}
export interface GuideContract {
  generatedBy: string;
  version: number;
  root: GuideNode;
}
export interface RawHub {
  brand: string;
  tagline: string;
  stats: { label: string; value: number; color?: string }[];
  scope: { label: string; num: string; value: string }[];
  [k: string]: unknown;
}

// ── Consumer registry ──────────────────────────────────────────────────────────────────
// Every in-repo project whose contract is bundled (emitted co-located by render-all.mjs).
// The active one is chosen at module load from `?consumer=<key>` (default the framework
// dogfood). Because every export below derives from `graph`/`hub`, swapping the active pair is
// the ONLY change needed — App.tsx and workflows.ts read the selected consumer unchanged.
interface ConsumerEntry {
  key: string;
  label: string;
  graph: RawGraph;
  hub: RawHub;
}
const CONSUMERS: ConsumerEntry[] = [
  { key: 'project-system', label: 'Project System · dogfood', graph: psGraph as unknown as RawGraph, hub: psHub as unknown as RawHub },
  { key: 'soul-steel-demo', label: 'Soul-Steel · demo fixture', graph: ssGraph as unknown as RawGraph, hub: ssHub as unknown as RawHub },
];
const DEFAULT_CONSUMER = 'project-system';

function pickConsumerKey(): string {
  if (typeof window === 'undefined') return DEFAULT_CONSUMER;
  const want = new URLSearchParams(window.location.search).get('consumer');
  return CONSUMERS.some((c) => c.key === want) ? (want as string) : DEFAULT_CONSUMER;
}

/** The consumers the header switcher offers. */
export const consumerOptions: { key: string; label: string }[] = CONSUMERS.map(({ key, label }) => ({ key, label }));
/** The consumer currently rendered (drives the whole module). */
export const activeConsumer: string = pickConsumerKey();
/** Switch consumers — sets `?consumer=<key>` and reloads, re-deriving the entire contract. */
export function setConsumer(key: string): void {
  if (typeof window === 'undefined' || key === activeConsumer) return;
  const url = new URL(window.location.href);
  if (key === DEFAULT_CONSUMER) url.searchParams.delete('consumer');
  else url.searchParams.set('consumer', key);
  window.location.assign(url.toString());
}

const selected = CONSUMERS.find((c) => c.key === activeConsumer) ?? CONSUMERS[0];
const graph = selected.graph;
const hub = selected.hub;

// Per-kind lineage tone, DERIVED from the emitted contract (render-hub maps each kind's accent
// dot → a tone). No hardcoded kind names — adding a kind needs no edit here. `danger` stays
// reserved for error states; `neutral` is the defensive fallback for an older contract.
const toneByKind: Record<string, LineageTone> = Object.fromEntries(
  Object.entries(graph.byKind ?? {}).map(([k, b]) => [k, b.tone ?? 'neutral']),
);

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
  /** The entity's tag map (empty when none) — e.g. `tags.tier` = required | optional. */
  tags: Record<string, string>;
  /** First-paragraph gist of the body ('' when the body carries no prose). */
  excerpt: string;
}

function toRecord(n: RawNode): EntityRecord {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title ?? prettify(n.id),
    status: n.status ?? '—',
    updated: n.updated ?? '—',
    file: n.file ?? '',
    tone: toneByKind[n.kind] ?? 'neutral',
    tags: n.tags ?? {},
    excerpt: n.excerpt ?? '',
  };
}

export const entities: EntityRecord[] = rawNodes(graph).map(toRecord);

// Declared-order kind list (decision, report, pipeline, …), straight from byKind.
export const kinds: string[] = Object.keys(graph.byKind ?? {});

// Kinds whose entities ARE workflows (config `carriesSwimlanes`) — leads the workflow picker.
export const swimlaneKinds: string[] = graph.swimlaneKinds ?? [];

export function entitiesOfKinds(...wanted: string[]): EntityRecord[] {
  const set = new Set(wanted);
  return entities.filter((e) => set.has(e.kind));
}

// A kind's declared status enum (config order) — the category order for entity briefs. Falls back
// to the statuses actually present (first-seen) for an older contract that predates `statusOrder`.
export function statusOrderForKind(kind: string): string[] {
  const bucket = graph.byKind?.[kind];
  if (bucket?.statusOrder?.length) return bucket.statusOrder;
  return Object.keys(bucket?.byStatus ?? {});
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
      tone: toneByKind[n.kind] ?? 'neutral',
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

// ── Relationship surface ────────────────────────────────────────────────────────────────
// Kind-agnostic projections of the emitted edges[], reused by the Decision Surface (and open to
// any kind). `from` is a bare id; `target` is a `<folder>/<id>` path — the namespace asymmetry the
// spec documents — so we resolve a target to its final segment (ids are globally unique).
const recordById = new Map(entities.map((e) => [e.id, e]));
const bareId = (target: string): string => String(target).split('/').pop() ?? target;

/** The entity record for an id (the navigable detail), or undefined for an unknown id. */
export function recordFor(id: string): EntityRecord | undefined {
  return recordById.get(id);
}

/** One edge incident to a subject entity, resolved to the entity on the OTHER end + direction. */
export interface RelatedEdge {
  rel: string;
  /** The entity on the other end of the edge from the subject. */
  other: EntityRecord;
  /** 'out' = subject → other (an authored link); 'in' = other → subject (a backlink). */
  dir: 'out' | 'in';
}

// Every edge touching `id`, resolved to the far entity + direction. Unresolved ends are dropped.
// The Decision Surface buckets these into Provenance / Lineage / Impact; any view can re-bucket.
export function relatedEdges(id: string): RelatedEdge[] {
  const out: RelatedEdge[] = [];
  for (const e of graph.edges) {
    const to = bareId(e.target);
    if (e.from === id) {
      const other = recordById.get(to);
      if (other) out.push({ rel: e.rel, other, dir: 'out' });
    } else if (to === id) {
      const other = recordById.get(e.from);
      if (other) out.push({ rel: e.rel, other, dir: 'in' });
    }
  }
  return out;
}

// A scoped @trembus/viz GraphContract centered on `id`: the subject + its 1-hop neighbors, with
// every edge among that set (so neighbor↔neighbor context shows, but the graph stays small — the
// reason the whole-project lineage was retired). Render with <Lineage> + selectedId={id}.
export function egoGraph(id: string): GraphContract {
  const center = recordById.get(id);
  const neighborIds = new Set<string>([id, ...relatedEdges(id).map((r) => r.other.id)]);
  const nodes: GraphNode[] = [...neighborIds]
    .map((nid) => recordById.get(nid))
    .filter((r): r is EntityRecord => Boolean(r))
    .map((r) => ({ id: r.id, label: r.title, kind: r.kind, sub: r.status, tone: r.tone }));
  const edges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const to = bareId(e.target);
    if (neighborIds.has(e.from) && neighborIds.has(to)) edges.push({ from: e.from, to, label: e.rel });
  }
  return {
    view: 'lineage',
    brand: center?.kind ?? 'entity',
    title: center?.title ?? id,
    caption: `${nodes.length - 1} linked · ${edges.length} edges`,
    // Top-down so the ego-graph fits the narrow detail drawer (grows in height, not width).
    direction: 'TB',
    nodes,
    edges,
  };
}

/** One entity's cross-kind reach — the heart of the impact constellation. */
export interface ConstellationRow {
  entity: EntityRecord;
  /** Inbound edge count from each OTHER kind (what depends on this entity), by kind. */
  reachByKind: Record<string, number>;
  /** Total inbound from other kinds — the "load-bearing" magnitude. */
  reach: number;
  /** Same-kind edge degree touching this entity (e.g. the decision↔decision DAG). */
  lineage: number;
}
export interface Constellation {
  rows: ConstellationRow[];
  /** The other kinds that actually appear as columns, in declared kind order. */
  columns: string[];
}

// Project a kind's entities into the constellation: each row's connectivity across the OTHER kinds
// (inbound = what depends on it) plus its same-kind lineage degree. Sorted most load-bearing first.
export function constellation(kind: string): Constellation {
  const rows: ConstellationRow[] = entitiesOfKinds(kind).map((entity) => {
    const reachByKind: Record<string, number> = {};
    let lineage = 0;
    for (const r of relatedEdges(entity.id)) {
      if (r.other.kind === kind) lineage += 1;
      else if (r.dir === 'in') reachByKind[r.other.kind] = (reachByKind[r.other.kind] ?? 0) + 1;
    }
    const reach = Object.values(reachByKind).reduce((a, b) => a + b, 0);
    return { entity, reachByKind, reach, lineage };
  });
  const present = new Set(rows.flatMap((r) => Object.keys(r.reachByKind)));
  const columns = kinds.filter((k) => k !== kind && present.has(k));
  rows.sort(
    (a, b) =>
      b.reach - a.reach || b.lineage - a.lineage || b.entity.updated.localeCompare(a.entity.updated),
  );
  return { rows, columns };
}

// The hub view-model typed for @trembus/ui's <Hub>. hub.json IS the Trembus hub contract,
// so it renders unchanged; this is the same object the header reads via `hub`.
export const hubData = hub as unknown as HubContract;

// Per-entity structured workflows (swimlane contracts) emitted by render-hub.mjs from an
// entity's `## Workflow` block, keyed by entity id. The Workflows tab renders these.
//
// A step ref, resolved by render-hub: the rel + the target entity's id, title, and kind (kind is
// null when the target didn't resolve — the drawer then shows a non-navigating chip).
export interface ResolvedRef {
  rel: string;
  target: string;
  title: string;
  kind: string | null;
}
// A swimlane step widened with the resolved refs render-hub emits. The kit's SwimlaneStep has no
// refs field; extra fields are ignored by the kit's <Swimlane>, so this stays structurally
// compatible (a WorkflowContract is assignable wherever a SwimlaneContract is expected).
export interface StepWithRefs extends SwimlaneStep {
  refs?: ResolvedRef[];
}
export interface WorkflowContract extends Omit<SwimlaneContract, 'steps'> {
  steps: StepWithRefs[];
}
export const workflows: Record<string, WorkflowContract> =
  (graph.workflows ?? {}) as Record<string, WorkflowContract>;

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
// A detail row for a control-surface facet tile (commands / workflows / hooks). Mirrors the
// `entries[]` render-hub emits for facet domains; maps onto a Brief item (text + gloss + chip).
export interface HubDomainEntry {
  text: string;
  desc?: string;
  status?: string;
  ref?: string;
}
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
  /** Control-surface facets (commands/workflows/hooks) carry their detail rows here. */
  entries?: HubDomainEntry[];
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

// ── Field Guide accessors ──
// `guideRoot` is the whole tree's root (its brief intros the system); `guide` is the forest the
// tree renders (the root's children — core / _project / concepts). `hasGuide` gates the nav tab +
// hex tile so a contract without the payload simply omits the feature. `guideIndex` maps every
// node id → node for selection lookups. Defensive `?? null/[]` mirrors the workflows?/phases?
// accessors above — an older contract degrades, never throws.
export const guideRoot: GuideNode | null = (graph.guide?.root as GuideNode) ?? null;
export const guide: GuideNode[] = guideRoot?.children ?? [];
export const hasGuide: boolean = guide.length > 0;

function indexGuide(nodes: GuideNode[], map = new Map<string, GuideNode>()): Map<string, GuideNode> {
  for (const n of nodes) {
    map.set(n.id, n);
    if (n.children?.length) indexGuide(n.children, map);
  }
  return map;
}
export const guideIndex: Map<string, GuideNode> = guideRoot ? indexGuide([guideRoot]) : new Map();

export { graph, hub };
